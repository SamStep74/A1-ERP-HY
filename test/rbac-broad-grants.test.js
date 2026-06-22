// A1 ERP-HY RBAC catalog-grant audit — test suite
//
// Locks in the invariant the Wave 3 migration violated: for every
// `requireXxx` helper and every `preHandler: requirePerm(...)` route,
// the set of roles that hold the corresponding permission key (computed
// by inverting `roleMatrix` + matrix permission sets) is a SUBSET of the
// legacy `user.role` allow-list the original code enforced.
//
// The test loads `scripts/lint-rbac-broad-grants.js` as a library (it
// exports `audit`, `rolesWithPermission`, `parseAllowListFromHelperBody`,
// and `loadHelperBodies`) and runs:
//
//   1. A lock-in snapshot test that diffs the current `audit()` output
//      against `test/fixtures/catalog-grant-audit-snapshot.json`. The
//      snapshot is a stable, time-independent record of which perm keys
//      fall into PASS / BROAD GRANT / NO LEGACY ALLOW-LIST / UNKNOWN
//      PERM KEY. Refresh it with `node scripts/snapshot-catalog-grant-audit.js`
//      when an intentional catalog change moves findings between sections.
//
//   2. Library API tests for `parseAllowListFromHelperBody` covering:
//        - inline `// rbac-audit: expected-roles …` annotation
//        - legacy `[A, B].includes(user.role)` parse
//        - single-compare `user.role !== "X"`
//        - unmappable helper (compound predicate)
//
//   3. Targeted role-set assertions for the most consequential perm
//      keys, so a future PR that silently widens the role matrix for
//      `hr.employee.create` or `system.tenant.create` fails the test
//      even before the lock-in snapshot is updated.
//
//   4. Exit-code assertion: `node scripts/lint-rbac-broad-grants.js`
//      must exit 0 when no BROAD GRANTs are present (driven by the
//      snapshot's `counts.broad === 0`).

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

const {
  audit,
  rolesWithPermission,
  parseAllowListFromHelperBody,
  loadHelperBodies,
  auditMap,
  PERMISSIONS,
} = require('../scripts/lint-rbac-broad-grants.js');

const snapshot = require('./fixtures/catalog-grant-audit-snapshot.json');

const isValidKey = require('../server/rbac/permissions').isValidKey;

// ───────── 1. Lock-in snapshot test ─────────
test('audit output matches the lock-in snapshot', () => {
  const result = audit();
  // Counts must match first — this is the cheap, high-signal diff.
  const actualCounts = {
    pass: result.findings.filter((f) => f.kind === 'pass').length,
    broad: result.findings.filter((f) => f.kind === 'broad').length,
    'no-legacy': result.findings.filter((f) => f.kind === 'no-legacy').length,
    'unknown-key': result.findings.filter((f) => f.kind === 'unknown-key').length,
    total: result.findings.length,
  };
  assert.deepEqual(actualCounts, snapshot.counts, 'audit counts drifted from the snapshot. Re-run `node scripts/snapshot-catalog-grant-audit.js` if the change is intentional.');

  // Full findings list must match too — the snapshot captures
  // (source, permKey, expectedRoles, actualRoles, extraRoles) for every
  // finding, so a future PR that changes any of those without updating
  // the snapshot fails the test.
  assert.deepEqual(
    result.findings,
    snapshot.findings,
    'audit findings drifted from the snapshot — see the diff above for which (source, permKey) moved between sections.'
  );
});

test('audit exit code is 0 when no BROAD GRANT findings are present', () => {
  // Drive the CLI binary so we exercise the same exit-code path CI uses.
  // The snapshot's `counts.broad` is the source of truth: if it goes to
  // 0 the script should exit 0; otherwise it exits 1.
  const expectedExit = snapshot.counts.broad === 0 ? 0 : 1;
  let actualExit = null;
  let stderr = '';
  try {
    execFileSync('node', ['scripts/lint-rbac-broad-grants.js', '--quiet'], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    actualExit = 0;
  } catch (err) {
    actualExit = err.status;
    stderr = String(err.stderr || '');
  }
  assert.equal(actualExit, expectedExit, `lint-rbac-broad-grants.js exited with ${actualExit} (expected ${expectedExit}). stderr: ${stderr.slice(0, 500)}`);
});

// ───────── 2. Library API tests ─────────
test('parseAllowListFromHelperBody: inline annotation wins over regex parse', () => {
  const body = `
    // rbac-audit: expected-roles Owner, Admin, Auditor
    function requireAuditReader(user) {
      return ['Owner', 'Admin'].includes(user.role);
    }
  `;
  const { expectedRoles, source } = parseAllowListFromHelperBody(body);
  assert.deepEqual(expectedRoles, ['Owner', 'Admin', 'Auditor']);
  assert.equal(source, 'annotation', 'inline annotation should take precedence');
});

test('parseAllowListFromHelperBody: parses [...].includes(user.role)', () => {
  const body = `
    function requireFinanceOperator(user) {
      return ['Owner', 'Admin', 'Accountant'].includes(user.role);
    }
  `;
  const { expectedRoles, source } = parseAllowListFromHelperBody(body);
  assert.deepEqual(expectedRoles, ['Owner', 'Admin', 'Accountant']);
  assert.equal(source, 'parsed');
});

test('parseAllowListFromHelperBody: single-compare `user.role !== "X"` parses as single-role allow-list', () => {
  const body = `
    function requireOwner(user) {
      if (user.role !== 'Owner') {
        const err = new Error('forbidden');
        err.statusCode = 403;
        throw err;
      }
    }
  `;
  const { expectedRoles, source } = parseAllowListFromHelperBody(body);
  assert.deepEqual(expectedRoles, ['Owner']);
  assert.equal(source, 'parsed');
});

test('parseAllowListFromHelperBody: returns null for compound-predicate helpers', () => {
  const body = `
    function requireMfaPrivilegedUser(user) {
      return mfaRequiredForRole(user.role) && user.mfa_enrolled;
    }
  `;
  const { expectedRoles, source } = parseAllowListFromHelperBody(body);
  assert.equal(expectedRoles, null);
  assert.equal(source, 'unmappable');
});

test('loadHelperBodies: extracts every `function requireXxx(user)` body from app.js', () => {
  const appJs = fs.readFileSync(path.join(repoRoot, 'server/app.js'), 'utf8');
  const bodies = loadHelperBodies(appJs);
  // Smoke check: the helper bodies for the named helpers in the audit
  // map must be present and non-empty.
  for (const helperName of Object.keys(auditMap.helpers)) {
    assert.ok(bodies[helperName], `helper body missing for ${helperName}`);
    assert.ok(bodies[helperName].length > 0, `helper body empty for ${helperName}`);
  }
  // The legacy unmappable helpers should also be found. Filter out
  // the `$comment` key the audit map uses for documentation.
  for (const helperName of Object.keys(auditMap.unmappable)) {
    if (helperName.startsWith('$')) continue;
    assert.ok(bodies[helperName], `legacy helper body missing for ${helperName}`);
  }
});

// ───────── 3. Targeted role-set assertions ─────────
//
// These tests catch the most damaging catalog regressions even when
// the snapshot is out of date. They assert a small, hand-picked set
// of perm keys have the exact role set the catalog shipped with.

test('rolesWithPermission: system.tenant.create is Owner-only (Owner escape hatch)', () => {
  // The catalog treats system.tenant.create as the Owner escape hatch:
  // only Owner holds it via the catalog (the legacy requireOwner also
  // accepted only Owner). The route layer (`/api/platform/tenant`)
  // additionally exposes `system.tenant.read` to Admin + Owner, which
  // is the catalog-correct shape and is asserted in the lock-in
  // snapshot's PASS section.
  const holders = rolesWithPermission('system.tenant.create');
  assert.deepEqual(holders, ['Owner'], 'system.tenant.create must be Owner-only');
});

test('rolesWithPermission: hr.employee.create is now narrow ⊆ [Owner, Admin, Accountant]', () => {
  // Wave 5 (narrow-broad-grants) split hr.employee.create out of HROperator
  // and into a dedicated PeopleWriter perm set, which is granted only to
  // Owner, Admin, Accountant (mirroring the legacy requirePeopleWriter
  // allow-list). HRLead, HRSpecialist, and PayrollClerk lost the perm
  // (they keep HR read/update/etc. via HROperator, just not create).
  const holders = rolesWithPermission('hr.employee.create');
  assert.deepEqual(holders, ['Accountant', 'Admin', 'Owner']);
  // HR / payroll / sales roles must NOT hold hr.employee.create.
  for (const blocked of ['HRLead', 'HRSpecialist', 'PayrollClerk', 'SalesRep', 'HelpdeskAgent', 'Bookkeeper', 'FinanceLead']) {
    assert.ok(!holders.includes(blocked), `${blocked} must NOT hold hr.employee.create after Wave 5 narrowing`);
  }
});

// ───────── 3b. Wave 5 narrow-grant assertions ─────────
//
// One test per broad-grant finding that was collapsed by the
// narrow-broad-grants worker. Each test asserts:
//   rolesWithPermission(permKey) is a subset of (or equal to) the legacy
//   requireXxx allow-list, AND
//   the extras listed in the Wave 4 audit are no longer in the holder set.
// If a future PR silently widens the catalog for any of these perms,
// the targeted test fails even before the lock-in snapshot is updated.

test('narrow: requirePeopleWriter → hr.employee.create ⊆ [Owner, Admin, Accountant]', () => {
  const expected = ['Owner', 'Admin', 'Accountant'];
  const holders = rolesWithPermission('hr.employee.create');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['HRLead', 'HRSpecialist', 'PayrollClerk']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold hr.employee.create`);
  }
});

test('narrow: requireAccessReviewer → security.access.review ⊆ [Owner, Admin, Auditor]', () => {
  const expected = ['Owner', 'Admin', 'Auditor'];
  const holders = rolesWithPermission('security.access.review');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['ComplianceOfficer', 'CopilotReviewer', 'FinanceLead']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold security.access.review`);
  }
});

test('narrow: requireSessionReviewer → security.session.list ⊆ [Owner, Admin, Auditor]', () => {
  const expected = ['Owner', 'Admin', 'Auditor'];
  const holders = rolesWithPermission('security.session.list');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['ComplianceOfficer', 'CopilotReviewer', 'FinanceLead']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold security.session.list`);
  }
});

test('narrow: requireSessionAdmin → security.session.revoke ⊆ [Owner, Admin]', () => {
  const expected = ['Owner', 'Admin'];
  const holders = rolesWithPermission('security.session.revoke');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['Auditor', 'ComplianceOfficer', 'CopilotReviewer', 'FinanceLead']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold security.session.revoke`);
  }
});

test('narrow: requireAuditExportReader → security.audit.read ⊆ [Owner, Admin, Auditor]', () => {
  const expected = ['Owner', 'Admin', 'Auditor'];
  const holders = rolesWithPermission('security.audit.read');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['ComplianceOfficer', 'CopilotReviewer', 'FinanceLead']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold security.audit.read`);
  }
});

test('narrow: requireAuditReader → security.audit.read ⊆ [Owner, Admin, Auditor] (same perm as above)', () => {
  // requireAuditReader and requireAuditExportReader both gate on
  // security.audit.read, so the narrowing is shared.
  const holders = rolesWithPermission('security.audit.read');
  assert.deepEqual(holders, ['Admin', 'Auditor', 'Owner']);
});

test('narrow: requireAuditExportWriter → security.audit.export ⊆ [Owner, Admin]', () => {
  const expected = ['Owner', 'Admin'];
  const holders = rolesWithPermission('security.audit.export');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['Auditor', 'ComplianceOfficer', 'CopilotReviewer', 'FinanceLead']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold security.audit.export`);
  }
});

test('narrow: requireCrmEditor → crm.deal.create ⊆ [Owner, Admin, Operator, SalesLead, SalesManager, SalesRep, ServiceManager]', () => {
  // Strategy C — legacy allow-list uses the old role names
  // "Salesperson" / "Service Manager" which were renamed to the current
  // sales + service role set. The inline annotation in app.js
  // declares the current expected set; this test pins it.
  const expected = ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager'];
  const holders = rolesWithPermission('crm.deal.create');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['Accountant', 'Bookkeeper', 'FinanceLead', 'HelpdeskAgent', 'POSCashier']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold crm.deal.create`);
  }
});

test('narrow: requireCollectionEditor → crm.quote.send ⊆ [Owner, Admin, Operator, SalesLead, SalesManager, SalesRep, ServiceManager, Accountant]', () => {
  // Strategy C — legacy allow-list uses the old role names
  // "Salesperson" / "Service Manager" which were renamed to the current
  // sales + service role set. The inline annotation in app.js
  // declares the current expected set; this test pins it.
  const expected = ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager', 'Accountant'];
  const holders = rolesWithPermission('crm.quote.send');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['Bookkeeper', 'FinanceLead', 'HelpdeskAgent', 'POSCashier']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold crm.quote.send`);
  }
});

test('narrow: requireFinanceOperator → finance.journal.create ⊆ [Owner, Admin, Accountant]', () => {
  const expected = ['Owner', 'Admin', 'Accountant'];
  const holders = rolesWithPermission('finance.journal.create');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['Bookkeeper', 'FinanceLead', 'PayrollClerk', 'PurchaseLead']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold finance.journal.create`);
  }
});

test('narrow: GET /api/integrations/connectors → system.integrations.read ⊆ [Owner, Admin, Auditor]', () => {
  // Wave 5 also narrows the GET /api/integrations/connectors route. The
  // legacy requireIntegrationReader helper (unmappable in the audit map
  // but added to auth-security-slice) gates on Owner, Admin, Auditor.
  // The new IntegrationsReader perm set delivers exactly that.
  const expected = ['Owner', 'Admin', 'Auditor'];
  const holders = rolesWithPermission('system.integrations.read');
  for (const role of holders) {
    assert.ok(expected.includes(role), `extra role ${role} not in legacy allow-list ${JSON.stringify(expected)}`);
  }
  for (const extra of ['ComplianceOfficer', 'CopilotReviewer', 'FinanceLead']) {
    assert.ok(!holders.includes(extra), `${extra} must NOT hold system.integrations.read`);
  }
});

test('rolesWithPermission: unknown perm key returns empty array (does not throw)', () => {
  const holders = rolesWithPermission('definitely.not.a.perm');
  assert.deepEqual(holders, []);
});

test('rolesWithPermission: every perm key in auditMap.helpers resolves to a non-empty holder set', () => {
  // The helpers section of the audit map is the one we expect to PASS
  // or BROAD GRANT — it should never resolve to an empty holder set
  // unless the perm key is itself unknown OR the perm is registered in
  // the catalog but not yet assigned to any role (system-defined but
  // unassigned; a future wave grants it to the right roles).
  for (const [helperName, helperDef] of Object.entries(auditMap.helpers)) {
    if (!helperDef.permKey) continue;
    if (!isValidKey(helperDef.permKey)) continue; // unknown-key is a separate failure mode
    if (PERMISSIONS[helperDef.permKey]) continue; // system-defined but unassigned — skip
    const holders = rolesWithPermission(helperDef.permKey);
    assert.ok(holders.length > 0, `${helperName} → ${helperDef.permKey} resolves to an empty holder set; the catalog is missing this perm key`);
  }
});

// ───────── 4. Cross-check: BROAD GRANT findings explain the drift ─────────
test('every BROAD GRANT finding has at least one extra role, and the extras are all in the actual set', () => {
  const result = audit();
  for (const f of result.findings.filter((x) => x.kind === 'broad')) {
    assert.ok(f.extraRoles.length > 0, `BROAD GRANT ${f.source} → ${f.permKey} has no extraRoles (broken finding)`);
    for (const extra of f.extraRoles) {
      assert.ok(
        f.actualRoles.includes(extra),
        `BROAD GRANT ${f.source} → ${f.permKey} extra role ${extra} is not in actualRoles`
      );
      assert.ok(
        !f.expectedRoles.includes(extra),
        `BROAD GRANT ${f.source} → ${f.permKey} extra role ${extra} is in expectedRoles (should not be flagged)`
      );
    }
  }
});

test('every PASS finding has empty extraRoles and a non-empty actualRoles set', () => {
  const result = audit();
  for (const f of result.findings.filter((x) => x.kind === 'pass')) {
    assert.deepEqual(f.extraRoles, [], `PASS ${f.source} → ${f.permKey} has extraRoles (should be empty)`);
    // A perm that is registered in the catalog but not yet granted to any
    // role (system-defined but unassigned) PASSes the audit vacuously
    // (no actual roles to compare). Skip the non-empty-actualRoles check
    // for those.
    if (PERMISSIONS[f.permKey] && f.actualRoles.length === 0) continue;
    assert.ok(f.actualRoles.length > 0, `PASS ${f.source} → ${f.permKey} has empty actualRoles`);
    for (const role of f.actualRoles) {
      assert.ok(f.expectedRoles.includes(role), `PASS ${f.source} → ${f.permKey} actual role ${role} is not in expectedRoles`);
    }
  }
});

// ───────── 5. Sanity: snapshot schema is the version we expect ─────────
test('snapshot file is the lock-in version (version: 1)', () => {
  assert.equal(snapshot.version, 1, 'snapshot version mismatch — regenerate the snapshot file');
  assert.ok(Array.isArray(snapshot.findings), 'snapshot.findings must be an array');
  assert.equal(snapshot.capturedAt, 'LOCKED', 'snapshot.capturedAt must remain "LOCKED" so the file is reproducible across runs');
});

// ───────── 6. annotate-allow-list-sites: per-site lock-in ─────────
//
// Each of the 23 NO LEGACY ALLOW-LIST sites that Wave 5's
// `annotate-allow-list-sites` worker resolved gets a dedicated assertion:
// the site must no longer be reported as 'no-legacy' by the audit, and
// the `expectedRoles` must match the inline `// rbac-audit: expected-roles`
// annotation that was added either inside the helper body (catalog /
// inventory / purchase helpers) or above the preHandler line (mfa).
// The annotation is the single source of truth — if a future PR changes
// the helper body without updating the annotation, these tests fail
// before the snapshot does, giving the author a targeted diff.

const ANNOTATED_SITES = [
  // mfa routes — annotated above the preHandler line in server/app.js
  { method: 'POST', path: '/api/security/mfa/enroll',           permKey: 'security.mfa.configure', expectedRoles: ['Owner', 'Admin'] },
  { method: 'POST', path: '/api/security/mfa/verify-enrollment',permKey: 'security.mfa.configure', expectedRoles: ['Owner', 'Admin'] },
  // catalog read — all 6 routes share CatalogReader perm set
  // (Wave 7 — legacy "Salesperson" → SalesLead/SalesManager/SalesRep,
  //  "Service Manager" → ServiceManager; remaining roles hold the perm
  //  via the broad InventoryOperator / ReadOnly perm sets)
  { method: 'GET',  path: '/api/catalog/categories',           permKey: 'inv.product.read',       expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  { method: 'GET',  path: '/api/catalog/price-lists',          permKey: 'inv.product.read',       expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  { method: 'GET',  path: '/api/catalog/pricing/resolve',      permKey: 'inv.product.read',       expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  { method: 'GET',  path: '/api/catalog/margin-rules',         permKey: 'inv.product.read',       expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  { method: 'GET',  path: '/api/catalog/items',                permKey: 'inv.product.read',       expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  { method: 'GET',  path: '/api/catalog/items/:id',            permKey: 'inv.product.read',       expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  // catalog write — 2 routes share CatalogEditor perm set
  // (Wave 7 — legacy "Salesperson" → SalesLead/SalesManager/SalesRep;
  //  Auditor is NOT in the legacy catalog-write allow-list)
  { method: 'POST', path: '/api/catalog/items',                permKey: 'inv.product.create',     expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager', 'Accountant', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  { method: 'PATCH',path: '/api/catalog/items/:id',            permKey: 'inv.product.update',     expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'ServiceManager', 'Accountant', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  // inventory read — 3 routes share StockReader perm set
  // (Wave 7 — ServiceManager is NOT in the legacy inventory allow-list;
  //  remaining non-Owner/Admin/Operator roles hold the perm via the
  //  broad InventoryOperator / ReadOnly perm sets)
  { method: 'GET',  path: '/api/inventory/locations',          permKey: 'inv.stock.read',         expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  { method: 'GET',  path: '/api/inventory/stock',              permKey: 'inv.stock.read',         expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  { method: 'GET',  path: '/api/inventory/moves',              permKey: 'inv.stock.read',         expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  // inventory write — 1 route uses StockReceiver perm set
  // (Wave 7 — ServiceManager and Auditor are NOT in the legacy
  //  stock.receive allow-list)
  { method: 'POST', path: '/api/inventory/moves',              permKey: 'inv.stock.receive',      expectedRoles: ['Owner', 'Admin', 'Operator', 'SalesLead', 'SalesManager', 'SalesRep', 'Accountant', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser', 'WarehouseClerk'] },
  // purchase read — 3 routes share requirePurchaseReader
  { method: 'GET',  path: '/api/purchase/orders',              permKey: 'purchase.po.read',       expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant', 'Auditor'] },
  { method: 'GET',  path: '/api/purchase/vendors',             permKey: 'purchase.vendor.read',   expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant', 'Auditor'] },
  { method: 'GET',  path: '/api/purchase/analytics',           permKey: 'purchase.analytics.read',expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant', 'Auditor'] },
  // purchase write — 4 routes share requirePurchaseWriter
  { method: 'POST', path: '/api/purchase/vendors',             permKey: 'purchase.vendor.create', expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant'] },
  { method: 'POST', path: '/api/purchase/orders',              permKey: 'purchase.po.create',     expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant'] },
  { method: 'POST', path: '/api/purchase/orders/:id/confirm',  permKey: 'purchase.po.update',     expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant'] },
  { method: 'POST', path: '/api/purchase/orders/:id/receive',  permKey: 'purchase.receipt.create',expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant'] },
  { method: 'POST', path: '/api/purchase/orders/:id/return',   permKey: 'purchase.return.create', expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant'] },
  // finance bill — 1 route uses requireFinanceOperator
  { method: 'POST', path: '/api/purchase/orders/:id/bill',     permKey: 'finance.bill.create',    expectedRoles: ['Owner', 'Admin', 'Accountant'] },
  // Wave 10 purchase evidence routes
  { method: 'GET',  path: '/api/purchase/reorder-suggestions',            permKey: 'purchase.analytics.read',expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant', 'Auditor'] },
  { method: 'POST', path: '/api/purchase/reorder-suggestions/generate',   permKey: 'purchase.po.create',     expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant'] },
  { method: 'POST', path: '/api/purchase/reorder-suggestions/:id/accept', permKey: 'purchase.po.create',     expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant'] },
  { method: 'POST', path: '/api/purchase/reorder-suggestions/:id/reject', permKey: 'purchase.po.create',     expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant'] },
  { method: 'GET',  path: '/api/purchase/orders/:id/match',               permKey: 'purchase.po.read',       expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant', 'Auditor'] },
  { method: 'POST', path: '/api/purchase/orders/:id/match/recompute',     permKey: 'purchase.po.update',     expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant'] },
  { method: 'GET',  path: '/api/purchase/matches/receipts',               permKey: 'purchase.analytics.read',expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant', 'Auditor'] },
  { method: 'GET',  path: '/api/purchase/matches/bills',                  permKey: 'purchase.analytics.read',expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant', 'Auditor'] },
  { method: 'GET',  path: '/api/purchase/vendors/:id/360',                permKey: 'purchase.vendor_360.read', expectedRoles: ['Owner', 'Admin', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser'] },
  { method: 'GET',  path: '/api/purchase/vendors/:id/recent-orders',      permKey: 'purchase.po.read',       expectedRoles: ['Owner', 'Admin', 'Operator', 'Accountant', 'Auditor'] },
  { method: 'GET',  path: '/api/purchase/vendors/:id/price-history',      permKey: 'purchase.pricelist.read', expectedRoles: ['Owner', 'Admin', 'Accountant', 'Auditor', 'FinanceLead', 'InventoryLead', 'PurchaseLead', 'Purchaser'] },
];

for (const site of ANNOTATED_SITES) {
  test(`annotate: ${site.method} ${site.path}`, () => {
    const result = audit();
    const source = `${site.method} ${site.path}`;
    const finding = result.findings.find((f) => f.source === source && f.permKey === site.permKey);
    assert.ok(finding, `${source} (${site.permKey}) is not in the audit output — the worker must have missed it`);
    assert.notEqual(
      finding.kind,
      'no-legacy',
      `${source} (${site.permKey}) is still reported as no-legacy; the audit cannot extract the expected-roles annotation`
    );
    assert.deepEqual(
      finding.expectedRoles,
      site.expectedRoles,
      `${source} (${site.permKey}) expectedRoles drift from the inline annotation`
    );
  });
}
