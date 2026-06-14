// A1 ERP-HY RBAC Guards
//
// Runtime guards that route handlers use to enforce permissions.
// These functions throw a 403 error if the check fails; never call them
// without a try/catch wrapper or inside a Fastify handler that translates
// errors via app.setErrorHandler.
//
// Pattern: load the user's effective permission set once per request, then
// call hasPermission / requirePermission cheaply. We also support field-level
// and record-level (row-level) checks for sensitive data.
//
// Field-level security: FLS_RULES maps resource → field → sensitivity
//   (e.g. "viewable only by sensitive-data-readers"). Used to redact fields
//   in API responses.
//
// Record-level security: a row-level policy is a SQL-like predicate fragment
//   that we AND into queries. Built dynamically from RLS_RULES.

'use strict';

const { PERMISSIONS, SENSITIVITY } = require('./permissions');
const { ROLES, mfaRequiredFor, sessionHardLimitMinutesFor, canBeImpersonated } = require('./roles');
const { PERMISSION_SETS } = require('./matrix');
const { expandRolePermissions, listForRole, getParentChain } = require('./roleMatrix');

// ───────── Permission resolution cache ─────────
//
// Permission resolution is per-request and inexpensive (Set lookup), but
// we still cache the expanded set keyed on the user identity for repeated
// checks in the same request lifecycle.

function resolveEffectivePermissions(user) {
  if (!user) return new Set();
  if (user._effectivePermissions instanceof Set) return user._effectivePermissions;

  // 1. Get the role's direct permission set list (no chain inheritance for
  //    permission sets — the role chain is reserved for org structure
  //    policies: appSet, MFA, session hard limit, impersonation).
  const ids = new Set();
  for (const ps of listForRole(user.role)) ids.add(ps);

  // 2. Add directly assigned permission sets.
  if (Array.isArray(user.permission_set_ids)) {
    for (const ps of user.permission_set_ids) ids.add(ps);
  }

  // 3. Expand permission set → permission keys.
  const keys = new Set();
  for (const id of ids) {
    const ps = PERMISSION_SETS[id];
    if (!ps) continue;
    for (const k of ps.permissions) keys.add(k);
  }

  // 4. Owner is the super-user and implicitly holds every permission. This
  //    is the ONLY implicit-all shortcut. Admin gets its powers explicitly
  //    through its role matrix (e.g. SystemAdmin PS).
  if (user.role === 'Owner') { // rbac-lint: allow-role-check — Owner shortcut
    for (const k of Object.keys(PERMISSIONS)) keys.add(k);
  }
  user._effectivePermissions = keys;
  return keys;
}

function hasPermission(user, permissionKey) {
  if (!user) return false;
  // Safety: if the user is unauthenticated, deny. (Auth middleware should
  // already have rejected before getting here, but defense in depth.)
  if (!user.id) return false;
  const perms = resolveEffectivePermissions(user);
  return perms.has(permissionKey);
}

function hasAnyPermission(user, keys) {
  if (!Array.isArray(keys) || keys.length === 0) return false;
  const perms = resolveEffectivePermissions(user);
  for (const k of keys) if (perms.has(k)) return true;
  return false;
}

function hasAllPermissions(user, keys) {
  if (!Array.isArray(keys) || keys.length === 0) return true;
  const perms = resolveEffectivePermissions(user);
  for (const k of keys) if (!perms.has(k)) return false;
  return true;
}

function requirePermission(user, permissionKey) {
  if (!hasPermission(user, permissionKey)) {
    const err = new Error(`Missing permission: ${permissionKey}`);
    err.statusCode = 403;
    err.code = 'rbac_forbidden';
    err.required = permissionKey;
    throw err;
  }
}

function requireAnyPermission(user, keys) {
  if (!hasAnyPermission(user, keys)) {
    const err = new Error(`Missing required permission: one of ${keys.join(', ')}`);
    err.statusCode = 403;
    err.code = 'rbac_forbidden';
    err.requiredAny = keys;
    throw err;
  }
}

function requireAllPermissions(user, keys) {
  if (!hasAllPermissions(user, keys)) {
    const err = new Error(`Missing required permissions: ${keys.join(', ')}`);
    err.statusCode = 403;
    err.code = 'rbac_forbidden';
    err.requiredAll = keys;
    throw err;
  }
}

// ───────── Sensitivity-aware guards ─────────
//
// If the user holds the permission but the permission is "high" or "critical",
// we may require MFA to be verified in the current session. This is the
// "step-up auth" pattern.

function checkSensitivity(user, permissionKey) {
  if (!user) return { allowed: false, reason: 'no_user' };
  if (!hasPermission(user, permissionKey)) {
    return { allowed: false, reason: 'no_permission' };
  }
  const def = PERMISSIONS[permissionKey];
  if (!def) return { allowed: true }; // unknown permissions can't be gated
  const sens = SENSITIVITY[def.sensitivity];
  if (sens && sens.mfa && user.mfa_required && !user.mfa_verified) {
    return { allowed: false, reason: 'mfa_required', sensitivity: def.sensitivity };
  }
  return { allowed: true };
}

function requirePermissionWithSensitivity(user, permissionKey) {
  const result = checkSensitivity(user, permissionKey);
  if (result.allowed) return;
  const err = new Error(
    result.reason === 'mfa_required'
      ? `MFA required for sensitive action: ${permissionKey}`
      : `Missing permission: ${permissionKey}`
  );
  err.statusCode = result.reason === 'mfa_required' ? 401 : 403;
  err.code = result.reason === 'mfa_required' ? 'rbac_mfa_required' : 'rbac_forbidden';
  err.required = permissionKey;
  err.sensitivity = result.sensitivity;
  throw err;
}

// ───────── Field-level security (FLS) ─────────
//
// Some fields are sensitive even if the resource is readable. Examples:
//   - finance.bank.account_number
//   - hr.employee.ssn
//   - hr.employee.bank_account
//
// FLS_RULES maps field path → { minPermission: permissionKey, label }.
// Routes that return objects with sensitive fields call redactFields() to
// remove fields the user does not have permission to see.

const FLS_RULES = Object.freeze({
  // Finance
  'finance.bank.account_number':    { minPermission: 'finance.bank.read',      label: 'Bank account number' },
  'finance.bank.routing':           { minPermission: 'finance.bank.read',      label: 'Bank routing code' },
  // HR
  'hr.employee.ssn':                { minPermission: 'hr.employee.pii.read',   label: 'Employee SSN' },
  'hr.employee.bank_account':       { minPermission: 'hr.employee.pii.read',   label: 'Employee bank account' },
  'hr.employee.medical_notes':      { minPermission: 'hr.employee.pii.read',   label: 'Employee medical notes' },
  // Customer
  'crm.account.tax_id':             { minPermission: 'crm.account.read',       label: 'Customer tax ID' },
  // Auth
  'security.user.password_hash':    { minPermission: 'security.user.read',     label: 'Password hash' },
  'security.user.mfa_secret':       { minPermission: 'security.user.read',     label: 'MFA secret' },
  // Inventory & purchasing — pricing/valuation is sensitive even when the
  // resource itself is readable. Cost and margin only visible to readers
  // that hold a higher-sensitivity permission (InventoryOperator or above
  // holds inv.stock.receive which we use as the gate here; the dedicated
  // inv.valuation.read key would also work but is role-specific).
  'inv.product.cost_price':         { minPermission: 'inv.stock.receive',      label: 'Product cost price' },
  'inv.product.margin':             { minPermission: 'inv.stock.receive',      label: 'Product margin' },
  'inv.stock.unit_cost':            { minPermission: 'inv.stock.receive',      label: 'Stock unit cost' },
  'inv.stock.total_value':          { minPermission: 'inv.stock.receive',      label: 'Stock total value' },
  'purchase.vendor.pricing':        { minPermission: 'purchase.pricelist.read',label: 'Vendor pricing' },
  'purchase.vendor.unit_cost':      { minPermission: 'purchase.pricelist.read',label: 'Vendor unit cost' },
  'purchase.po.amount':             { minPermission: 'purchase.po.create',     label: 'PO amount' },
  'purchase.po.total':              { minPermission: 'purchase.po.create',     label: 'PO total' },
  'purchase.po.unit_cost':          { minPermission: 'purchase.po.create',     label: 'PO unit cost' },
});

function redactFields(user, obj, fieldPaths) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? obj.map(o => redactFields(user, o, fieldPaths)) : { ...obj };
  if (Array.isArray(out)) return out;
  for (const path of fieldPaths) {
    const rule = FLS_RULES[path];
    if (!rule) continue;
    if (hasPermission(user, rule.minPermission)) continue;
    // Try the path as a nested traversal first: e.g. crm.account.tax_id →
    // out.crm.account.tax_id. If that doesn't find anything, fall back to
    // the leaf segment as a top-level key, which is the common case when
    // the API returns a flat record (e.g. { tax_id: '...' } instead of
    // { crm: { account: { tax_id: '...' } } }).
    const parts = path.split('.');
    const leaf = parts[parts.length - 1];
    let deleted = false;
    if (Object.prototype.hasOwnProperty.call(out, leaf)) {
      delete out[leaf];
      deleted = true;
    } else {
      // Also try the camelCase form of the leaf, since many API responses
      // return flat records with camelCase keys (e.g. { accountNumber: '...' }
      // for the snake_case leaf `account_number`).
      const camel = leaf.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
      if (camel !== leaf && Object.prototype.hasOwnProperty.call(out, camel)) {
        delete out[camel];
        deleted = true;
      } else {
        let cur = out;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!cur || typeof cur !== 'object') break;
          cur = cur[parts[i]];
        }
        if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, leaf)) {
          delete cur[leaf];
          deleted = true;
        }
      }
    }
    // Silently skip paths that don't match the object shape — the caller may
    // be passing paths speculatively.
    void deleted;
  }
  return out;
}

// ───────── Record-level security (RLS) ─────────
//
// RLS scopes which records a user can see. The predicates are ANDed into
// queries that hit the underlying tables.
//
// For now, a simple model:
//   - "own": only records where owner_user_id = current user
//   - "team": only records where owner_user_id is in the user's team
//   - "org": all records in the user's org
//
// Most modules default to "org" with a few exceptions:
//   - portal: tenant_id = current_user.tenant_id
//   - reports/time: "own" by default
//
// RLS_RULES is a list of overrides: { resource, predicate, description }.

const RLS_RULES = Object.freeze([
  { resource: 'crm.lead',         defaultScope: 'org', description: 'All org leads visible' },
  { resource: 'crm.deal',         defaultScope: 'org', description: 'All org deals visible' },
  { resource: 'crm.quote',        defaultScope: 'org', description: 'All org quotes visible' },
  { resource: 'crm.activity',     defaultScope: 'own', description: 'Default to own activities' },
  { resource: 'projects.task',    defaultScope: 'team', description: 'Tasks for the user\'s team' },
  { resource: 'projects.time',    defaultScope: 'own', description: 'Default to own time entries' },
  { resource: 'desk.case',        defaultScope: 'org', description: 'All org cases visible' },
  { resource: 'hr.employee',      defaultScope: 'org', description: 'HR is org-wide for HR roles, own for self' },
  { resource: 'hr.payroll',       defaultScope: 'org', description: 'Payroll visible to payroll roles only' },
  { resource: 'finance.journal',  defaultScope: 'org', description: 'All org journal entries' },
  { resource: 'inv.stock',        defaultScope: 'org', description: 'All org stock' },
  { resource: 'purchase.po',      defaultScope: 'org', description: 'All org POs' },
  { resource: 'pos.sale',         defaultScope: 'org', description: 'All POS sales' },
  { resource: 'portal.order',     defaultScope: 'own', description: 'Customer portal: own orders only' },
  { resource: 'portal.invoice',   defaultScope: 'own', description: 'Customer portal: own invoices only' },
  { resource: 'portal.ticket',    defaultScope: 'own', description: 'Customer portal: own tickets only' },
]);

// Build a SQL WHERE fragment for record-level scope. Returns a clause +
// params you can splice into a SELECT. NULL clause means "no extra filter".
function recordLevelClause(user, resource, opts = {}) {
  const rule = RLS_RULES.find(r => r.resource === resource);
  const scope = opts.scopeOverride || (rule ? rule.defaultScope : 'org');

  // Owner / Admin see everything across the org.
  if (user.role === 'Owner' || user.role === 'Admin') { // rbac-lint: allow-role-check — RLS super-user shortcut
    return { clause: '', params: [] };
  }

  // Portal users are always tenant-scoped.
  if (user.role === 'CustomerPortal' || user.role === 'VendorPortal') { // rbac-lint: allow-role-check — RLS portal branch
    return {
      clause: `${resourcePrimaryKey(resource)} IN (SELECT id FROM ${resourceTable(resource)} WHERE tenant_id = ?)`,
      params: [user.tenant_id || user.org_id || 0],
    };
  }

  switch (scope) {
    case 'own': {
      return {
        clause: `owner_user_id = ?`,
        params: [user.id],
      };
    }
    case 'team': {
      return {
        clause: `owner_user_id IN (SELECT member_user_id FROM team_members WHERE team_id IN (SELECT team_id FROM team_members WHERE member_user_id = ?))`,
        params: [user.id],
      };
    }
    case 'org':
    default: {
      return { clause: 'org_id = ?', params: [user.org_id || 0] };
    }
  }
}

function resourcePrimaryKey(resource) {
  // Convention: each resource map to a table whose primary key is "id".
  return 'id';
}
function resourceTable(resource) {
  // Heuristic: strip dots and pluralize crudely. Most A1 tables use
  // snake_case plurals; this is enough for tenant isolation.
  const cleaned = resource.replace(/\./g, '_');
  return cleaned + 's';
}

// ───────── High-level guard helpers for Fastify preHandlers ─────────
//
// A Fastify route uses:
//   app.post("/api/invoices", { preHandler: requirePerm("finance.invoice.create") }, handler);

function requirePerm(permissionKey) {
  return async function rbacPreHandler(request, reply) {
    try {
      requirePermissionWithSensitivity(request.user, permissionKey);
    } catch (err) {
      reply.code(err.statusCode || 403).send({
        error: err.code || 'rbac_forbidden',
        message: err.message,
        required: err.required,
        sensitivity: err.sensitivity,
      });
    }
  };
}

function requireAnyPerm(permissionKeys) {
  return async function rbacPreHandler(request, reply) {
    try {
      requireAnyPermission(request.user, permissionKeys);
    } catch (err) {
      reply.code(err.statusCode || 403).send({
        error: err.code || 'rbac_forbidden',
        message: err.message,
        requiredAny: err.requiredAny,
      });
    }
  };
}

// Enforce role-level MFA + session hard limits on a request.
// Returns true if the session is fine; otherwise throws.
function enforceSessionPolicy(user, session) {
  if (!user) throw Object.assign(new Error('Unauthenticated'), { statusCode: 401 });
  if (mfaRequiredFor(user.role) && !user.mfa_verified && session?.mfa_factor) {
    const err = new Error('MFA required');
    err.statusCode = 401;
    err.code = 'mfa_required';
    throw err;
  }
  const hardLimit = sessionHardLimitMinutesFor(user.role);
  if (session && session.created_at) {
    const ageMin = (Date.now() - new Date(session.created_at).getTime()) / 60000;
    if (ageMin > hardLimit) {
      const err = new Error('Session exceeded hard limit');
      err.statusCode = 401;
      err.code = 'session_hard_limit';
      err.hardLimitMinutes = hardLimit;
      throw err;
    }
  }
}

// Impersonation: who can be impersonated by whom?
function canImpersonate(actor, target) {
  if (!actor || !target) return false;
  if (actor.id === target.id) return false;
  // Only Owner and Admin can impersonate.
  if (!['Owner', 'Admin'].includes(actor.role)) return false;
  // Cannot impersonate other Owner/Admin unless actor is Owner.
  if (['Owner', 'Admin'].includes(target.role) && actor.role !== 'Owner') return false;
  // Target must allow impersonation.
  if (!canBeImpersonated(target.role)) return false;
  return true;
}

module.exports = {
  // Resolution
  resolveEffectivePermissions,
  // Permission checks
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  checkSensitivity,
  requirePermissionWithSensitivity,
  // Field / Record security
  FLS_RULES,
  redactFields,
  RLS_RULES,
  recordLevelClause,
  // Fastify preHandlers
  requirePerm,
  requireAnyPerm,
  // Session / impersonation
  enforceSessionPolicy,
  canImpersonate,
  // Re-exports for convenience
  expandRolePermissions,
};
