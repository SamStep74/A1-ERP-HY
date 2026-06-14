// A1 ERP-HY Role → Permission Set Matrix
//
// This file maps each system role to the permission sets it inherits by default.
// A user with role X gets: (matrix[X] ∪ permission_sets_assigned_to_user).
//
// To extend a role's default set without touching this file, add the
// permission set in the admin UI to a specific user.
// To restrict, set that user's role to a more restrictive role.
//
// Convention:
//   - "StandardUser" is implicitly granted to every authenticated user.
//   - Sensitive roles (Owner, Admin, FinanceLead, PayrollClerk, Auditor)
//     do NOT get StandardUser — they get it through their custom grants.

'use strict';

const { ROLES } = require('./roles');
const { PERMISSION_SETS } = require('./matrix');

const ROLE_MATRIX = Object.freeze({
  // ───────── Top of hierarchy ─────────
  Owner:           Object.freeze([
    'SystemAdmin', 'TenantAdmin', 'UserAdmin', 'SecurityAdmin', 'ComplianceOperator', 'ComplianceAdmin', 'RetentionAdmin', 'RetentionOperator',
    'FinanceOperator', 'FinancePeriodAdmin', 'TaxFiler',
    'CRMOperator', 'InventoryOperator', 'InventoryAdmin', 'PurchaseOperator', 'PurchaseAdmin',
    'POSOperator', 'POSSupervisor', 'HROperator', 'PayrollOperator',
    'ProjectsOperator', 'DeskOperator', 'DeskAdmin',
    'DocsOperator', 'DocsAdmin', 'MarketingOperator', 'MarketingAutomation', 'ManufacturingOperator', 'ManufacturingAdmin', 'QualityHoldAdmin',
    'StudioBuilder', 'ReportBuilder', 'AuditOperator', 'AuditDeliver',
    'AIPowerUser', 'AIGovernance', 'AgentDeveloper', 'AgentDeployer',
    'PIIEditor', 'StandardUser',
    // Wave 5 narrow-grant perm sets — mirror the legacy requireXxx allow-lists.
    'PeopleWriter', 'AccessReviewer', 'SessionReader', 'SessionAdmin',
    'AuditReader', 'AuditExportWriter', 'DealCreator', 'QuoteSender',
    'JournalWriter', 'IntegrationsReader',
  ]),
  Admin:           Object.freeze([
    'SystemAdmin', 'UserAdmin', 'SecurityAdmin', 'ComplianceOperator', 'RetentionAdmin',
    'FinanceOperator', 'FinancePeriodAdmin', 'TaxFiler',
    'CRMOperator', 'InventoryOperator', 'InventoryAdmin', 'PurchaseOperator', 'PurchaseAdmin',
    'POSOperator', 'POSSupervisor', 'HROperator', 'PayrollOperator',
    'ProjectsOperator', 'DeskOperator', 'DeskAdmin',
    'DocsOperator', 'DocsAdmin', 'MarketingOperator', 'MarketingAutomation', 'ManufacturingOperator', 'ManufacturingAdmin',
    'StudioBuilder', 'ReportBuilder', 'AuditOperator',
    'AIEnabled', 'AIMutator', 'AIGovernance', 'AgentDeveloper', 'StandardUser',
    // Wave 5 narrow-grant perm sets — mirror the legacy requireXxx allow-lists.
    'PeopleWriter', 'AccessReviewer', 'SessionReader', 'SessionAdmin',
    'AuditReader', 'AuditExportWriter', 'DealCreator', 'QuoteSender',
    'JournalWriter', 'IntegrationsReader',
  ]),

  // ───────── Functional leads ─────────
  FinanceLead:     Object.freeze([
    'FinanceOperator', 'FinancePeriodAdmin', 'TaxFiler',
    'CRMOperator', 'InventoryOperator', 'PurchaseOperator',
    'DocsOperator', 'ReportBuilder', 'AuditOperator',
    'AIPowerUser', 'SensitiveDataReader', 'StandardUser',
  ]),
  SalesLead:       Object.freeze([
    'CRMOperator', 'InventoryOperator', 'DeskOperator',
    'DocsOperator', 'ReportBuilder', 'MarketingOperator',
    'AIEnabled', 'StandardUser',
    // Wave 5 narrow-grant perm sets — mirror the legacy requireCrmEditor /
    // requireCollectionEditor allow-lists (Salesperson maps to the
    // current sales roles SalesLead / SalesManager / SalesRep).
    'DealCreator', 'QuoteSender',
  ]),
  PurchaseLead:    Object.freeze([
    'PurchaseOperator', 'PurchaseAdmin', 'InventoryOperator',
    'DocsOperator', 'ReportBuilder', 'FinanceOperator',
    'AIEnabled', 'StandardUser',
  ]),
  HRLead:          Object.freeze([
    'HROperator', 'PayrollOperator', 'DocsOperator', 'ReportBuilder', 'ComplianceOperator',
    'AIEnabled', 'PIIEditor', 'SensitiveDataReader', 'StandardUser',
  ]),
  InventoryLead:   Object.freeze([
    'InventoryOperator', 'InventoryAdmin', 'PurchaseOperator',
    'POSOperator', 'POSSupervisor', 'DocsOperator', 'ReportBuilder',
    'AIEnabled', 'StandardUser',
  ]),
  ProjectLead:     Object.freeze([
    'ProjectsOperator', 'DeskOperator', 'DeskAdmin',
    'DocsOperator', 'ReportBuilder',
    'AIEnabled', 'StandardUser',
  ]),

  // ───────── Practitioners ─────────
  Accountant:      Object.freeze([
    'FinanceOperator', 'CRMOperator', 'InventoryOperator', 'PurchaseOperator',
    'DocsOperator', 'ReportBuilder', 'ComplianceOperator',
    'AIEnabled', 'SensitiveDataReader', 'StandardUser',
    // Wave 5 narrow-grant perm sets — mirror the legacy requireXxx allow-lists.
    // - PeopleWriter:   requirePeopleWriter      (Owner, Admin, Accountant)
    // - JournalWriter:  requireFinanceOperator   (Owner, Admin, Accountant)
    // - QuoteSender:    requireCollectionEditor  (Owner, Admin, Operator, Salesperson, Service Manager, Accountant)
    'PeopleWriter', 'JournalWriter', 'QuoteSender',
  ]),
  Bookkeeper:      Object.freeze([
    'FinanceOperator', 'CRMOperator', 'DocsOperator', 'StandardUser',
  ]),
  Lawyer:          Object.freeze([
    'DocsOperator', 'ComplianceOperator',
    'AIEnabled', 'StandardUser',
  ]),
  SalesManager:    Object.freeze([
    'CRMOperator', 'InventoryOperator', 'DeskOperator',
    'DocsOperator', 'ReportBuilder', 'MarketingOperator',
    'AIEnabled', 'Approver', 'StandardUser',
    // Wave 5 narrow-grant perm sets — mirror the legacy requireCrmEditor /
    // requireCollectionEditor allow-lists (Salesperson maps to the
    // current sales roles SalesLead / SalesManager / SalesRep).
    'DealCreator', 'QuoteSender',
  ]),
  SalesRep:        Object.freeze([
    'CRMOperator', 'InventoryOperator',
    'DocsOperator', 'AIEnabled', 'StandardUser',
    // Wave 5 narrow-grant perm sets — mirror the legacy requireCrmEditor /
    // requireCollectionEditor allow-lists (Salesperson maps to the
    // current sales roles SalesLead / SalesManager / SalesRep).
    'DealCreator', 'QuoteSender',
  ]),
  Purchaser:       Object.freeze([
    'PurchaseOperator', 'InventoryOperator',
    'DocsOperator', 'ReportBuilder', 'AIEnabled', 'StandardUser',
  ]),
  WarehouseClerk:  Object.freeze([
    'InventoryOperator', 'DocsOperator', 'StandardUser',
  ]),
  HRSpecialist:    Object.freeze([
    'HROperator', 'DocsOperator', 'ComplianceOperator',
    'AIEnabled', 'PIIEditor', 'StandardUser',
  ]),
  PayrollClerk:    Object.freeze([
    'PayrollOperator', 'FinanceOperator', 'HROperator',
    'DocsOperator', 'ReportBuilder',
    'AIEnabled', 'SensitiveDataReader', 'StandardUser',
  ]),
  ProjectManager:  Object.freeze([
    'ProjectsOperator', 'DeskOperator', 'DeskAdmin',
    'DocsOperator', 'ReportBuilder',
    'AIEnabled', 'Approver', 'StandardUser',
  ]),
  ProjectMember:   Object.freeze([
    'ProjectsOperator', 'DocsOperator', 'AIEnabled', 'StandardUser',
  ]),
  HelpdeskAgent:   Object.freeze([
    'DeskOperator', 'CRMOperator', 'DocsOperator', 'AIEnabled', 'StandardUser',
  ]),
  POSCashier:      Object.freeze([
    'POSOperator', 'CRMOperator', 'DocsOperator', 'StandardUser',
  ]),

  // ───────── Specialists ─────────
  CopilotReviewer: Object.freeze([
    'AIEnabled', 'AIMutator', 'ComplianceOperator', 'AuditOperator', 'ReportBuilder', 'StandardUser',
  ]),
  ComplianceOfficer: Object.freeze([
    'ComplianceOperator', 'ComplianceAdmin', 'RetentionAdmin', 'RetentionOperator', 'AuditOperator', 'ReportBuilder',
    'AIEnabled', 'PIIEditor', 'StandardUser',
  ]),
  Auditor:         Object.freeze([
    'ReadOnly', 'AuditOperator', 'AuditDeliver', 'ComplianceOperator',
    'ReportBuilder', 'SensitiveDataReader', 'StandardUser',
    // Wave 5 narrow-grant perm sets — mirror the legacy requireXxx allow-lists.
    // - AccessReviewer:    requireAccessReviewer   (Owner, Admin, Auditor)
    // - SessionReader:     requireSessionReviewer  (Owner, Admin, Auditor)
    // - AuditReader:       requireAuditReader      (Owner, Admin, Auditor)
    // - IntegrationsReader: requireIntegrationReader (Owner, Admin, Auditor)
    'AccessReviewer', 'SessionReader', 'AuditReader', 'IntegrationsReader',
  ]),

  // ───────── Operator / service ─────────
  Operator:        Object.freeze([
    'CRMOperator', 'DeskOperator', 'DocsOperator', 'AIEnabled', 'StandardUser',
    // Wave 5 narrow-grant perm sets — mirror the legacy requireCrmEditor /
    // requireCollectionEditor allow-lists.
    'DealCreator', 'QuoteSender',
  ]),
  ServiceManager:  Object.freeze([
    'DeskOperator', 'DeskAdmin', 'CRMOperator', 'DocsOperator', 'ReportBuilder', 'AIEnabled', 'StandardUser',
    // Wave 5 narrow-grant perm sets — mirror the legacy requireCrmEditor /
    // requireCollectionEditor allow-lists (Service Manager maps to
    // ServiceManager).
    'DealCreator', 'QuoteSender',
  ]),

  // ───────── External / Customer ─────────
  CustomerPortal:  Object.freeze(['PortalCustomer']),
  VendorPortal:    Object.freeze(['PortalVendor']),
});

function listForRole(roleId) {
  return ROLE_MATRIX[roleId] || Object.freeze([]);
}

function getDefaultPermissionSetIds(user) {
  // Returns the role-default permission sets (NO chain inheritance for PSs)
  // plus any directly assigned permission sets. The parent chain is used
  // for org-structure policies (appSet, MFA, session) elsewhere.
  const ids = new Set();
  for (const ps of listForRole(user.role)) ids.add(ps);
  if (Array.isArray(user.permission_set_ids)) {
    for (const ps of user.permission_set_ids) ids.add(ps);
  }
  return [...ids];
}

function getParentChain(roleId) {
  const chain = [];
  let cur = ROLES[roleId];
  while (cur) {
    chain.push(cur.id);
    cur = cur.parent ? ROLES[cur.parent] : null;
  }
  return chain;
}

// Expand a set of permission set IDs to the concrete permission keys.
// Returns a Set for O(1) membership tests.
function expandPermissionKeys(permissionSetIds) {
  const out = new Set();
  for (const id of permissionSetIds) {
    const ps = PERMISSION_SETS[id];
    if (!ps) continue;
    for (const k of ps.permissions) out.add(k);
  }
  return out;
}

function expandRolePermissions(roleId, userPermissionSetIds = []) {
  // Direct role permission sets only (no chain inheritance). This makes the
  // effective permission set predictable and matches the resolveEffectivePermissions
  // runtime. The chain is still useful for org-structure policies.
  const ids = new Set(listForRole(roleId));
  for (const ps of userPermissionSetIds) ids.add(ps);
  return expandPermissionKeys(ids);
}

module.exports = {
  ROLE_MATRIX,
  listForRole,
  getDefaultPermissionSetIds,
  getParentChain,
  expandPermissionKeys,
  expandRolePermissions,
};
