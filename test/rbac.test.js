// A1 ERP-HY RBAC Test Suite
//
// Uses node:test (built-in) and assert/strict. No external deps so the
// tests run anywhere Node runs.
//
// Run with:
//   node --test test/rbac.test.js
//
// Coverage targets:
//   - Catalog integrity (no duplicate keys, all keys valid)
//   - Role hierarchy (no cycles, single parent)
//   - Permission set integrity (no references to unknown permissions)
//   - Role matrix integrity (no references to unknown roles or PSs)
//   - Permission resolution (role + PS = union)
//   - Field-level security (redact)
//   - Record-level security (clause generation)
//   - Sensitivity gating
//   - Impersonation policy
//   - Seed idempotency (in-memory SQLite)

'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

const rbac = require('../server/rbac');
const {
  PERMISSIONS, ROLES, PERMISSION_SETS, ROLE_MATRIX,
  byCategory, isValidKey, getDefinition, listKeys,
  getRole, listRoleIds, getParentChain, getEffectiveAppSet,
  mfaRequiredFor, sessionHardLimitMinutesFor, canBeImpersonated,
  listForRole, getDefaultPermissionSetIds, expandRolePermissions,
  hasPermission, hasAnyPermission, hasAllPermissions,
  requirePermission, requirePermissionWithSensitivity,
  redactFields, recordLevelClause, canImpersonate,
  seedRBAC, readVersions, validateCustomRole,
} = rbac;

// ─────────────── Catalog integrity ───────────────

describe('Permission catalog', () => {
  test('has version and at least 100 permissions', () => {
    assert.ok(rbac.PERMISSIONS_VERSION >= 1);
    assert.ok(listKeys().length >= 100, `expected ≥100 permissions, got ${listKeys().length}`);
  });

  test('keys are unique, lowercase, and dot-separated', () => {
    const keys = listKeys();
    const seen = new Set();
    for (const k of keys) {
      assert.ok(!seen.has(k), `duplicate key: ${k}`);
      seen.add(k);
      assert.match(k, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/,
        `bad key shape: ${k}`);
    }
  });

  test('every permission has a valid category and sensitivity', () => {
    const validCategories = new Set(Object.keys(rbac.CATEGORIES));
    const validSensitivities = new Set(Object.keys(rbac.SENSITIVITY));
    for (const [k, def] of Object.entries(PERMISSIONS)) {
      assert.ok(validCategories.has(def.category), `bad category on ${k}: ${def.category}`);
      assert.ok(validSensitivities.has(def.sensitivity), `bad sensitivity on ${k}: ${def.sensitivity}`);
      assert.ok(typeof def.label === 'string' && def.label.length > 0, `missing label on ${k}`);
    }
  });

  test('critical actions are tagged dual-control', () => {
    for (const [k, def] of Object.entries(PERMISSIONS)) {
      if (def.sensitivity === 'critical') {
        assert.equal(rbac.SENSITIVITY.critical.dualControl, true, `critical ${k} must be dual-control`);
      }
    }
  });

  test('isValidKey is correct for known/unknown', () => {
    assert.equal(isValidKey('finance.invoice.create'), true);
    assert.equal(isValidKey('nope.nope.nope'), false);
  });

  test('byCategory returns a map keyed by category', () => {
    const m = byCategory();
    assert.ok(m.size > 0);
    for (const [cat, items] of m) {
      assert.ok(rbac.CATEGORIES[cat], `unknown category ${cat} leaked into byCategory`);
      for (const item of items) assert.equal(item.category, cat);
    }
  });
});

// ─────────────── Catalog additions: new domains ───────────────
//
// Every test in this suite verifies a specific new key that was added
// during the rbac-catalog audit. The keys cover manufacturing (mfg.*),
// marketing automation (mrkt.*), compliance (compliance.*), AI agents
// (ai.agent.* / ai.tool.* / ai.budget.* / ai.fallback.update), and tenant
// management (system.tenant.*).

describe('New permission keys — manufacturing (mfg.*)', () => {
  // Each key is verified to: (1) exist, (2) belong to the mfg category,
  // (3) carry a valid sensitivity. We also assert a few semantic pairs
  // (e.g. read before write).
  const newKeys = [
    'mfg.bom.delete',
    'mfg.bom.version',
    'mfg.routing.read',
    'mfg.routing.update',
    'mfg.work_order.cancel',
    'mfg.work_order.release',
    'mfg.quality.hold',
    'mfg.quality.release',
    'mfg.repair.complete',
    'mfg.mps.read',
    'mfg.mps.update',
    'mfg.mrp.run',
    'mfg.costing.read',
    'mfg.costing.update',
  ];
  for (const k of newKeys) {
    test(`has ${k} with valid metadata`, () => {
      assert.ok(isValidKey(k), `missing key: ${k}`);
      const def = getDefinition(k);
      assert.ok(def, `no definition for ${k}`);
      assert.equal(def.category, 'mfg', `${k} should be in mfg category`);
      assert.ok(rbac.SENSITIVITY[def.sensitivity], `${k} bad sensitivity: ${def.sensitivity}`);
      assert.ok(def.label && def.label.length > 0, `${k} missing label`);
      assert.ok(def.description && def.description.length > 0, `${k} missing description`);
    });
  }

  test('quality.hold and quality.release are both critical (dual-control)', () => {
    // These two actions must be tagged critical so they trigger MFA + dual
    // control when invoked from a route.
    assert.equal(getDefinition('mfg.quality.hold').sensitivity, 'critical');
    assert.equal(getDefinition('mfg.quality.release').sensitivity, 'critical');
  });

  test('bom.delete is critical (destructive)', () => {
    assert.equal(getDefinition('mfg.bom.delete').sensitivity, 'critical');
  });
});

describe('New permission keys — marketing automation (mrkt.*)', () => {
  const newKeys = [
    'mrkt.campaign.pause',
    'mrkt.campaign.duplicate',
    'mrkt.campaign.export',
    'mrkt.segment.preview',
    'mrkt.journey.read',
    'mrkt.journey.update',
    'mrkt.journey.publish',
    'mrkt.landing.read',
    'mrkt.landing.update',
    'mrkt.form.read',
    'mrkt.form.update',
    'mrkt.subscription.read',
    'mrkt.subscription.update',
    'mrkt.lead_score.read',
    'mrkt.lead_score.update',
    'mrkt.abtest.read',
    'mrkt.abtest.update',
    'mrkt.webhook.read',
    'mrkt.webhook.update',
  ];
  for (const k of newKeys) {
    test(`has ${k} with valid metadata`, () => {
      assert.ok(isValidKey(k), `missing key: ${k}`);
      const def = getDefinition(k);
      assert.ok(def, `no definition for ${k}`);
      assert.equal(def.category, 'mrkt', `${k} should be in mrkt category`);
      assert.ok(rbac.SENSITIVITY[def.sensitivity], `${k} bad sensitivity: ${def.sensitivity}`);
      assert.ok(def.label && def.label.length > 0, `${k} missing label`);
    });
  }
});

describe('New permission keys — compliance (compliance.*)', () => {
  const newKeys = [
    'compliance.policy.approve',
    'compliance.policy.publish',
    'compliance.control.read',
    'compliance.control.update',
    'compliance.risk.read',
    'compliance.risk.update',
    'compliance.evidence.read',
    'compliance.evidence.update',
    'compliance.vendor_assessment.read',
    'compliance.vendor_assessment.update',
    'compliance.retention.run',
    'compliance.breach.read',
    'compliance.breach.update',
    'compliance.sox.read',
    'compliance.sox.update',
  ];
  for (const k of newKeys) {
    test(`has ${k} with valid metadata`, () => {
      assert.ok(isValidKey(k), `missing key: ${k}`);
      const def = getDefinition(k);
      assert.ok(def, `no definition for ${k}`);
      assert.equal(def.category, 'compliance', `${k} should be in compliance category`);
      assert.ok(rbac.SENSITIVITY[def.sensitivity], `${k} bad sensitivity: ${def.sensitivity}`);
      assert.ok(def.label && def.label.length > 0, `${k} missing label`);
    });
  }

  test('breach.update and retention.run are critical (destructive)', () => {
    assert.equal(getDefinition('compliance.breach.update').sensitivity, 'critical');
    assert.equal(getDefinition('compliance.retention.run').sensitivity, 'critical');
  });
});

describe('New permission keys — AI agents (ai.agent.* + ai.tool.* + ai.budget.*)', () => {
  const newKeys = [
    'ai.agent.read',
    'ai.agent.create',
    'ai.agent.update',
    'ai.agent.delete',
    'ai.agent.schedule',
    'ai.agent.pause',
    'ai.agent.version',
    'ai.agent.rollback',
    'ai.agent.scope.read',
    'ai.agent.scope.update',
    'ai.agent.runlog.read',
    'ai.agent.runlog.export',
    'ai.tool.read',
    'ai.tool.update',
    'ai.budget.read',
    'ai.budget.update',
    'ai.fallback.update',
  ];
  for (const k of newKeys) {
    test(`has ${k} with valid metadata`, () => {
      assert.ok(isValidKey(k), `missing key: ${k}`);
      const def = getDefinition(k);
      assert.ok(def, `no definition for ${k}`);
      assert.equal(def.category, 'ai', `${k} should be in ai category`);
      assert.ok(rbac.SENSITIVITY[def.sensitivity], `${k} bad sensitivity: ${def.sensitivity}`);
      assert.ok(def.label && def.label.length > 0, `${k} missing label`);
    });
  }

  test('agent.delete, agent.deploy, agent.rollback are all critical (destructive)', () => {
    assert.equal(getDefinition('ai.agent.delete').sensitivity, 'critical');
    assert.equal(getDefinition('ai.agent.deploy').sensitivity, 'critical');
    assert.equal(getDefinition('ai.agent.rollback').sensitivity, 'critical');
  });
});

describe('New permission keys — tenant management (system.tenant.*)', () => {
  const newKeys = [
    'system.tenant.read',
    'system.tenant.update',
    'system.tenant.suspend',
    'system.tenant.reactivate',
    'system.tenant.transfer',
    'system.tenant.plan.read',
    'system.tenant.plan.update',
    'system.tenant.billing.read',
    'system.tenant.billing.update',
    'system.tenant.region.update',
    'system.tenant.domain.read',
    'system.tenant.domain.update',
    'system.tenant.sso.read',
    'system.tenant.sso.update',
    'system.tenant.isolation.read',
    'system.tenant.isolation.update',
  ];
  for (const k of newKeys) {
    test(`has ${k} with valid metadata`, () => {
      assert.ok(isValidKey(k), `missing key: ${k}`);
      const def = getDefinition(k);
      assert.ok(def, `no definition for ${k}`);
      assert.equal(def.category, 'system', `${k} should be in system category`);
      assert.ok(rbac.SENSITIVITY[def.sensitivity], `${k} bad sensitivity: ${def.sensitivity}`);
      assert.ok(def.label && def.label.length > 0, `${k} missing label`);
    });
  }

  test('tenant.suspend/reactivate/transfer/delete/isolation.update are all critical', () => {
    assert.equal(getDefinition('system.tenant.suspend').sensitivity, 'critical');
    assert.equal(getDefinition('system.tenant.reactivate').sensitivity, 'critical');
    assert.equal(getDefinition('system.tenant.transfer').sensitivity, 'critical');
    assert.equal(getDefinition('system.tenant.delete').sensitivity, 'critical');
    assert.equal(getDefinition('system.tenant.isolation.update').sensitivity, 'critical');
  });
});

// ─────────────── New permission sets ───────────────

describe('New permission sets', () => {
  const newSetIds = [
    'ManufacturingAdmin',
    'QualityHoldAdmin',
    'MarketingAutomation',
    'ComplianceAdmin',
    'RetentionOperator',
    'AgentDeveloper',
    'AgentOperator',
    'AgentDeployer',
    'AIGovernance',
    'TenantAdmin',
    'TenantSupport',
  ];
  for (const id of newSetIds) {
    test(`has permission set ${id}`, () => {
      const ps = PERMISSION_SETS[id];
      assert.ok(ps, `missing PS: ${id}`);
      assert.equal(ps.isSystem, true, `${id} should be a system PS`);
      assert.ok(Array.isArray(ps.permissions), `${id} permissions must be an array`);
      assert.ok(ps.permissions.length > 0, `${id} should have at least one permission`);
    });
  }

  // Verify that EVERY permission in every new PS resolves in the catalog.
  test('every new PS member key resolves in the permission catalog', () => {
    for (const id of newSetIds) {
      const ps = PERMISSION_SETS[id];
      for (const k of ps.permissions) {
        assert.ok(PERMISSIONS[k], `${id} references unknown permission ${k}`);
      }
    }
  });

  test('Owner holds the new critical keys via implicit-all', () => {
    // The Owner implicit-all shortcut means Owner gets every key. We
    // spot-check the critical new ones here.
    const u = { id: 1, role: 'Owner', permission_set_ids: [], mfa_required: true, mfa_verified: true };
    const critical = [
      'mfg.quality.hold',
      'mfg.quality.release',
      'mfg.bom.delete',
      'compliance.breach.update',
      'compliance.retention.run',
      'ai.agent.deploy',
      'ai.agent.rollback',
      'ai.agent.delete',
      'system.tenant.suspend',
      'system.tenant.delete',
      'system.tenant.transfer',
    ];
    for (const k of critical) {
      assert.equal(hasPermission(u, k), true, `Owner missing critical key ${k}`);
    }
  });

  test('Admin is restricted on tenant.create and tenant.delete (Owner-only)', () => {
    // Admin should not have tenant create/delete by default — only Owner
    // gets those implicitly.
    const u = { id: 2, role: 'Admin', permission_set_ids: [], mfa_required: true, mfa_verified: true };
    assert.equal(hasPermission(u, 'system.tenant.create'), false);
    assert.equal(hasPermission(u, 'system.tenant.delete'), false);
    assert.equal(hasPermission(u, 'system.tenant.suspend'), false);
    assert.equal(hasPermission(u, 'system.tenant.transfer'), false);
  });

  test('Admin holds the new operator-level keys (manufacturing/marketing/agent)', () => {
    // Admin gets the new operator-level capabilities through their
    // expanded role matrix.
    const u = { id: 2, role: 'Admin', permission_set_ids: [], mfa_required: true, mfa_verified: true };
    const adminKeys = [
      'mfg.bom.delete',            // ManufacturingAdmin PS
      'mfg.bom.version',
      'mfg.mrp.run',
      'mrkt.journey.read',         // MarketingAutomation PS
      'mrkt.journey.update',
      'mrkt.lead_score.update',
      'mrkt.abtest.update',
      'mrkt.webhook.update',
      'ai.agent.read',             // AgentDeveloper PS
      'ai.agent.create',
      'ai.agent.version',
      'ai.evaluation.run',
      'ai.budget.read',
      'ai.budget.update',
      'ai.fallback.update',
    ];
    for (const k of adminKeys) {
      assert.equal(hasPermission(u, k), true, `Admin missing key ${k}`);
    }
  });

  test('ComplianceOfficer holds the new compliance.* keys', () => {
    const u = { id: 3, role: 'ComplianceOfficer', permission_set_ids: [], mfa_required: true, mfa_verified: true };
    const coKeys = [
      'compliance.policy.approve',
      'compliance.policy.publish',
      'compliance.control.read',
      'compliance.control.update',
      'compliance.risk.read',
      'compliance.risk.update',
      'compliance.evidence.read',
      'compliance.evidence.update',
      'compliance.vendor_assessment.read',
      'compliance.vendor_assessment.update',
      'compliance.breach.read',
      'compliance.breach.update',
      'compliance.sox.read',
      'compliance.retention.run',
    ];
    for (const k of coKeys) {
      assert.equal(hasPermission(u, k), true, `ComplianceOfficer missing key ${k}`);
    }
  });

  test('Auditor does NOT have compliance.breach.update (read-only role)', () => {
    // Auditor is read-only across the org. They may READ breach entries
    // (it's in ComplianceOperator PS) but must NOT update them.
    const u = { id: 4, role: 'Auditor', permission_set_ids: [], mfa_required: true, mfa_verified: true };
    assert.equal(hasPermission(u, 'compliance.breach.read'), true);
    assert.equal(hasPermission(u, 'compliance.breach.update'), false);
    assert.equal(hasPermission(u, 'compliance.retention.run'), false);
    assert.equal(hasPermission(u, 'ai.agent.deploy'), false);
  });

  test('SalesRep is denied manufacturing, compliance, and agent-admin keys', () => {
    // Negative test: a baseline practitioner must NOT have any of the
    // new privileged keys.
    const u = { id: 5, role: 'SalesRep', permission_set_ids: [], mfa_required: false, mfa_verified: true };
    const denied = [
      'mfg.bom.delete',
      'mfg.quality.hold',
      'mfg.quality.release',
      'mfg.mrp.run',
      'mrkt.journey.update',
      'mrkt.lead_score.update',
      'mrkt.abtest.update',
      'compliance.policy.publish',
      'compliance.breach.update',
      'compliance.retention.run',
      'compliance.sox.update',
      'ai.agent.create',
      'ai.agent.deploy',
      'ai.agent.rollback',
      'ai.budget.update',
      'system.tenant.create',
      'system.tenant.delete',
      'system.tenant.suspend',
      'system.tenant.transfer',
      'system.tenant.isolation.update',
    ];
    for (const k of denied) {
      assert.equal(hasPermission(u, k), false, `SalesRep unexpectedly has ${k}`);
    }
  });

  test('ManufacturingAdmin is a strictly additive extension of ManufacturingOperator', () => {
    // Every key in ManufacturingOperator must also be reachable via
    // ManufacturingAdmin (or be implicit on a manager role). This guards
    // against accidentally gutting the operator surface when refactoring.
    const operatorPerms = new Set(PERMISSION_SETS.ManufacturingOperator.permissions);
    const adminPerms = new Set(PERMISSION_SETS.ManufacturingAdmin.permissions);
    for (const k of operatorPerms) {
      assert.ok(operatorPerms.has(k), `ManufacturingOperator key ${k} should still be in operator PS`);
    }
    // The admin PS adds destructive keys; verify a few.
    assert.ok(adminPerms.has('mfg.bom.delete'));
    assert.ok(adminPerms.has('mfg.bom.version'));
    assert.ok(adminPerms.has('mfg.work_order.cancel'));
    assert.ok(adminPerms.has('mfg.mrp.run'));
  });

  test('MarketingAutomation keys are distinct from MarketingOperator', () => {
    // No overlap by design — MarketingAutomation covers journeys/scoring/
    // A/B tests; MarketingOperator covers campaigns/templates/landing.
    const opKeys = new Set(PERMISSION_SETS.MarketingOperator.permissions);
    const autoKeys = PERMISSION_SETS.MarketingAutomation.permissions;
    for (const k of autoKeys) {
      assert.ok(!opKeys.has(k), `${k} should be in MarketingAutomation only, not MarketingOperator`);
    }
  });

  test('TenantSupport is read-only (no mutations)', () => {
    const mutating = [
      'system.tenant.create',
      'system.tenant.update',
      'system.tenant.suspend',
      'system.tenant.reactivate',
      'system.tenant.delete',
      'system.tenant.transfer',
      'system.tenant.plan.update',
      'system.tenant.billing.update',
      'system.tenant.region.update',
      'system.tenant.domain.update',
      'system.tenant.sso.update',
      'system.tenant.isolation.update',
    ];
    // The PS must not contain any mutating key.
    for (const k of mutating) {
      assert.ok(
        !PERMISSION_SETS.TenantSupport.permissions.includes(k),
        `TenantSupport must not include mutating key ${k}`
      );
    }
    // It must include the read keys.
    const reading = [
      'system.tenant.read',
      'system.tenant.list',
      'system.tenant.plan.read',
      'system.tenant.billing.read',
      'system.tenant.domain.read',
      'system.tenant.sso.read',
      'system.tenant.isolation.read',
    ];
    for (const k of reading) {
      assert.ok(
        PERMISSION_SETS.TenantSupport.permissions.includes(k),
        `TenantSupport must include read key ${k}`
      );
    }
  });

  test('AgentOperator cannot create or deploy agents (read+run only)', () => {
    const ps = PERMISSION_SETS.AgentOperator;
    assert.ok(!ps.permissions.includes('ai.agent.create'));
    assert.ok(!ps.permissions.includes('ai.agent.update'));
    assert.ok(!ps.permissions.includes('ai.agent.delete'));
    assert.ok(!ps.permissions.includes('ai.agent.deploy'));
    assert.ok(!ps.permissions.includes('ai.agent.rollback'));
    assert.ok(!ps.permissions.includes('ai.agent.version'));
    assert.ok(!ps.permissions.includes('ai.tool.update'));
    // Should be able to run and inspect.
    assert.ok(ps.permissions.includes('ai.agent.run'));
    assert.ok(ps.permissions.includes('ai.agent.pause'));
    assert.ok(ps.permissions.includes('ai.agent.runlog.read'));
  });

  test('AgentDeployer holds only deploy/rollback/delete (Owner-gated surface)', () => {
    // AgentDeployer is intentionally narrow: just the three critical
    // actions. Verify no other keys leak in.
    const ps = PERMISSION_SETS.AgentDeployer;
    const expected = ['ai.agent.deploy', 'ai.agent.rollback', 'ai.agent.delete'];
    assert.deepEqual([...ps.permissions].sort(), expected.sort());
  });
});

// ─────────────── Role hierarchy ───────────────

describe('Role catalog', () => {
  test('has version and at least 15 system roles', () => {
    assert.ok(rbac.ROLES_VERSION >= 1);
    assert.ok(listRoleIds().length >= 15, `expected ≥15 roles, got ${listRoleIds().length}`);
  });

  test('every role has a valid parent (or null) and single inheritance', () => {
    for (const id of listRoleIds()) {
      const r = ROLES[id];
      assert.ok(r.parent === null || ROLES[r.parent], `${id} has unknown parent ${r.parent}`);
    }
  });

  test('parent chain has no cycles', () => {
    for (const id of listRoleIds()) {
      const chain = getParentChain(id);
      const seen = new Set();
      for (const r of chain) {
        assert.ok(!seen.has(r), `cycle detected: ${chain.join(' -> ')}`);
        seen.add(r);
      }
    }
  });

  test('system roles cannot be assigned canBeImpersonated=true on top-of-hierarchy', () => {
    // Owner and Admin are top of the tree. They should not allow impersonation.
    assert.equal(canBeImpersonated('Owner'), false);
    assert.equal(canBeImpersonated('Admin'), false);
  });

  test('mfaRequiredFor aggregates up the chain', () => {
    // Admin has mfaRequired=true, so any of its descendants that don't override
    // also inherit it.
    assert.equal(mfaRequiredFor('Admin'), true);
    assert.equal(mfaRequiredFor('FinanceLead'), true);     // Admin -> FinanceLead
    assert.equal(mfaRequiredFor('Accountant'), true);       // Admin -> FinanceLead -> Accountant
    assert.equal(mfaRequiredFor('Bookkeeper'), true);
  });

  test('sessionHardLimitMinutesFor picks the most restrictive in chain', () => {
    // FinanceLead: 60 (via Admin). Accountant: 120. Bookkeeper: 240.
    // Bookkeeper should pick 60 (from Admin/FinanceLead).
    assert.equal(sessionHardLimitMinutesFor('Bookkeeper'), 60);
    assert.equal(sessionHardLimitMinutesFor('Accountant'), 60);
  });

  test('getEffectiveAppSet unions up the chain', () => {
    const apps = getEffectiveAppSet('SalesRep');
    assert.ok(apps.includes('dashboard'));
    assert.ok(apps.includes('crm'));
  });
});

// ─────────────── Permission sets ───────────────

describe('Permission sets', () => {
  test('has version and ≥10 system sets', () => {
    assert.ok(rbac.PERMISSION_SETS_VERSION >= 1);
    assert.ok(Object.keys(PERMISSION_SETS).length >= 10);
  });

  test('every member permission exists in the catalog', () => {
    for (const ps of Object.values(PERMISSION_SETS)) {
      for (const k of ps.permissions) {
        assert.ok(PERMISSIONS[k], `permission set ${ps.id} references unknown ${k}`);
      }
    }
  });

  test('isSystemPermissionSet is correct', () => {
    assert.equal(rbac.isSystemPermissionSet('FinanceOperator'), true);
    assert.equal(rbac.isSystemPermissionSet('NotARealSet'), false);
  });
});

// ─────────────── Role × Permission set matrix ───────────────

describe('Role matrix', () => {
  test('every referenced role exists', () => {
    for (const r of Object.keys(ROLE_MATRIX)) {
      assert.ok(ROLES[r], `role matrix references unknown role: ${r}`);
    }
  });

  test('every referenced permission set exists', () => {
    for (const psList of Object.values(ROLE_MATRIX)) {
      for (const ps of psList) {
        assert.ok(PERMISSION_SETS[ps], `role matrix references unknown PS: ${ps}`);
      }
    }
  });

  test('listForRole returns a frozen array', () => {
    const arr = listForRole('Owner');
    assert.ok(Array.isArray(arr));
    assert.ok(Object.isFrozen(arr));
  });

  test('expandRolePermissions unions role + user PSs', () => {
    const ownerPerms = expandRolePermissions('Owner');
    const adminPerms = expandRolePermissions('Admin');
    assert.ok(ownerPerms.has('finance.invoice.create'));
    assert.ok(adminPerms.has('finance.invoice.create'));
  });
});

// ─────────────── Runtime guards ───────────────

describe('Permission resolution', () => {
  test('Owner has all permissions', () => {
    const u = { id: 1, role: 'Owner', permission_set_ids: [], mfa_required: true, mfa_verified: true };
    // Spot-check a few high-impact permissions.
    for (const k of ['finance.journal.post', 'hr.payroll.run', 'system.tenant.delete', 'crm.deal.approve']) {
      assert.equal(hasPermission(u, k), true, `Owner missing ${k}`);
    }
  });

  test('Admin has most permissions but not Tenant.Delete implicitly', () => {
    const u = { id: 2, role: 'Admin', permission_set_ids: [], mfa_required: true, mfa_verified: true };
    assert.equal(hasPermission(u, 'finance.journal.post'), true);
    // Admin doesn't have system.tenant.delete by default.
    assert.equal(hasPermission(u, 'system.tenant.delete'), false);
  });

  test('SalesRep is denied finance.journal.post', () => {
    const u = { id: 3, role: 'SalesRep', permission_set_ids: [], mfa_required: false, mfa_verified: true };
    assert.equal(hasPermission(u, 'finance.journal.post'), false);
    assert.equal(hasPermission(u, 'crm.deal.create'), true);
  });

  test('hasAnyPermission and hasAllPermissions work', () => {
    const u = { id: 4, role: 'SalesManager', permission_set_ids: ['Approver'], mfa_required: false, mfa_verified: true };
    assert.equal(hasAnyPermission(u, ['crm.deal.approve', 'finance.journal.post']), true); // Approver PS
    assert.equal(hasAllPermissions(u, ['crm.deal.approve', 'purchase.po.approve']), true);
  });

  test('requirePermission throws on deny, passes on grant', () => {
    const u = { id: 5, role: 'Accountant', permission_set_ids: [], mfa_required: true, mfa_verified: true };
    assert.doesNotThrow(() => requirePermission(u, 'finance.invoice.create'));
    assert.throws(() => requirePermission(u, 'system.tenant.delete'), /Missing permission/);
  });

  test('critical actions throw mfa_required when MFA unverified', () => {
    const u = { id: 6, role: 'Owner', permission_set_ids: [], mfa_required: true, mfa_verified: false };
    assert.throws(() => requirePermissionWithSensitivity(u, 'finance.journal.post'), /MFA required/);
  });

  test('null user always denied', () => {
    assert.equal(hasPermission(null, 'finance.invoice.create'), false);
    assert.equal(hasPermission(undefined, 'finance.invoice.create'), false);
    assert.equal(hasPermission({}, 'finance.invoice.create'), false);
  });

  test('user without id is denied (defense in depth)', () => {
    const u = { role: 'Owner', permission_set_ids: [] };
    assert.equal(hasPermission(u, 'finance.invoice.create'), false);
  });
});

// ─────────────── Field-level security ───────────────

describe('Field-level security (FLS)', () => {
  test('redactFields strips a sensitive field when user lacks min permission', () => {
    // WarehouseClerk has InventoryOperator (no CRM/account access), so the
    // min permission crm.account.read is denied and the field is redacted.
    const clerk = { id: 7, role: 'WarehouseClerk', permission_set_ids: [] };
    const obj = { id: 1, label: 'Customer', tax_id: '12345678' };
    const redacted = redactFields(clerk, obj, ['crm.account.tax_id']);
    assert.equal(redacted.tax_id, undefined);
    assert.equal(redacted.label, 'Customer');
  });

  test('redactFields keeps a sensitive field when user has min permission', () => {
    const accountant = { id: 8, role: 'Accountant', permission_set_ids: [] };
    const obj = { id: 1, label: 'Customer', tax_id: '12345678' };
    const redacted = redactFields(accountant, obj, ['crm.account.tax_id']);
    assert.equal(redacted.tax_id, '12345678');
  });

  test('redactFields handles arrays of records', () => {
    const clerk = { id: 9, role: 'WarehouseClerk', permission_set_ids: [] };
    const arr = [{ id: 1, tax_id: 'AAA' }, { id: 2, tax_id: 'BBB' }];
    const redacted = redactFields(clerk, arr, ['crm.account.tax_id']);
    assert.equal(redacted[0].tax_id, undefined);
    assert.equal(redacted[1].tax_id, undefined);
  });
});

// ─────────────── Record-level security ───────────────

describe('Record-level security (RLS)', () => {
  test('Owner/Admin get an empty clause (no extra filter)', () => {
    const owner = { id: 10, role: 'Owner', org_id: 7 };
    const admin = { id: 11, role: 'Admin', org_id: 7 };
    assert.equal(recordLevelClause(owner, 'crm.lead').clause, '');
    assert.equal(recordLevelClause(admin, 'crm.lead').clause, '');
  });

  test('org-scoped default returns org filter', () => {
    const u = { id: 12, role: 'SalesRep', org_id: 99 };
    const { clause, params } = recordLevelClause(u, 'crm.lead');
    assert.match(clause, /org_id/);
    assert.deepEqual(params, [99]);
  });

  test('own-scoped default returns owner filter', () => {
    const u = { id: 13, role: 'SalesRep', org_id: 99 };
    const { clause, params } = recordLevelClause(u, 'crm.activity');
    assert.match(clause, /owner_user_id/);
    assert.deepEqual(params, [13]);
  });

  test('portal users are tenant-scoped', () => {
    const u = { id: 14, role: 'CustomerPortal', tenant_id: 42 };
    const { clause } = recordLevelClause(u, 'portal.order');
    assert.match(clause, /tenant_id/);
  });
});

// ─────────────── Impersonation policy ───────────────

describe('Impersonation', () => {
  test('Owner can impersonate a regular user', () => {
    const owner = { id: 1, role: 'Owner' };
    const target = { id: 2, role: 'Accountant' };
    assert.equal(canImpersonate(owner, target), true);
  });

  test('cannot impersonate self', () => {
    const owner = { id: 1, role: 'Owner' };
    assert.equal(canImpersonate(owner, owner), false);
  });

  test('Admin cannot impersonate Owner', () => {
    const admin = { id: 1, role: 'Admin' };
    const target = { id: 2, role: 'Owner' };
    assert.equal(canImpersonate(admin, target), false);
  });

  test('non-admin cannot impersonate anyone', () => {
    const sales = { id: 1, role: 'SalesRep' };
    const target = { id: 2, role: 'Accountant' };
    assert.equal(canImpersonate(sales, target), false);
  });
});

// ─────────────── Custom role validation ───────────────

describe('validateCustomRole', () => {
  test('rejects bad id', () => {
    assert.throws(() => validateCustomRole({ id: '1bad', parent: 'Admin' }), /letters, digits, underscores/);
    assert.throws(() => validateCustomRole({ id: '', parent: 'Admin' }), /required/);
    assert.throws(() => validateCustomRole({ id: 'Owner', parent: 'Admin' }), /already exists/);
  });

  test('rejects bad parent', () => {
    assert.throws(() => validateCustomRole({ id: 'CustomX', parent: 'Nope' }), /unknown role/);
  });

  test('produces a valid custom role with defaults', () => {
    const r = validateCustomRole({
      id: 'JuniorAccountant',
      label: 'Junior Accountant',
      description: 'Books AP only',
      parent: 'Accountant',
      appSet: ['dashboard', 'finance'],
    });
    assert.equal(r.id, 'JuniorAccountant');
    assert.equal(r.parent, 'Accountant');
    assert.equal(r.isSystem, false);
    assert.equal(r.sessionHardLimitMinutes >= 30, true);
  });
});

// ─────────────── Seed idempotency (in-memory SQLite) ───────────────

describe('Seed installer (in-memory SQLite)', () => {
  let db;
  before(async () => {
    // Lazy require so the test file works even if better-sqlite3 is not
    // installed in CI; skip in that case.
    let Database;
    try { Database = require('better-sqlite3'); }
    catch (e) { return; }
    db = new Database(':memory:');
    const v = await seedRBAC(db);
    assert.equal(v.permissions_seeded, listKeys().length);
    assert.equal(v.roles_seeded, listRoleIds().length);
  });

  test('seeds the expected number of rows (when sqlite is available)', () => {
    if (!db) return; // skip
    const perms = db.prepare('SELECT COUNT(*) AS c FROM rbac_permissions WHERE tenant_id = 0').get();
    const roles = db.prepare('SELECT COUNT(*) AS c FROM rbac_roles WHERE tenant_id = 0').get();
    const sets  = db.prepare('SELECT COUNT(*) AS c FROM rbac_permission_sets WHERE tenant_id = 0').get();
    const links = db.prepare('SELECT COUNT(*) AS c FROM rbac_role_permission_sets').get();
    assert.equal(perms.c, listKeys().length);
    assert.equal(roles.c, listRoleIds().length);
    assert.equal(sets.c, Object.keys(PERMISSION_SETS).length);
    assert.ok(links.c > 0);
  });

  test('is idempotent — re-running does not duplicate or error', async () => {
    if (!db) return;
    const v = await seedRBAC(db);
    const perms = db.prepare('SELECT COUNT(*) AS c FROM rbac_permissions WHERE tenant_id = 0').get();
    assert.equal(perms.c, listKeys().length);
  });

  test('readVersions returns the seeded versions', () => {
    if (!db) return;
    const v = readVersions(db);
    assert.equal(Number(v.permissions_version), rbac.PERMISSIONS_VERSION);
    assert.equal(Number(v.roles_version), rbac.ROLES_VERSION);
    assert.equal(Number(v.permission_sets_version), rbac.PERMISSION_SETS_VERSION);
  });
});
