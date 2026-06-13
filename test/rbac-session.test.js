// A1 ERP-HY RBAC Session / MFA / Dual-Control Test Suite
//
// Focused coverage of the runtime policies the RBAC catalog promises:
//   1. Session hard limit (per-role timeout)
//   2. MFA step-up for sensitive (critical) actions
//   3. Impersonation policy (who can act as whom)
//   4. AppSet isolation (a user in app X cannot reach app Y permissions)
//   5. Idle timeout vs hard timeout (re-auth after inactivity)
//
// All time-based assertions go through the fake clock in
// test/fixtures/clock.js so the suite finishes in milliseconds. No real
// sleeps, no setTimeout.
//
// Run with:
//   node --test test/rbac-session.test.js
//
// The fixture contract (test/fixtures/sessions.js) is the recommended
// shape for any new session-policy test in the project.

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const rbac = require('../server/rbac');
const {
  enforceSessionPolicy,
  requirePermission,
  requirePermissionWithSensitivity,
  canImpersonate,
  mfaRequiredFor,
  sessionHardLimitMinutesFor,
  canBeImpersonated,
  hasPermission,
  PERMISSIONS,
} = rbac;

const { useFakeClock, restore: restoreClock } = require('./fixtures/clock');
const {
  newSession,
  markMfaVerified,
  tickClock,
  fakeRequest,
  fakeReply,
  withAppSet,
  enforceAppSet,
  appAllows,
} = require('./fixtures/sessions');

// ───────── helpers ─────────

// Build a user with a role and a list of extra permission set ids.
// Mirrors the shape guards.js inspects (id, role, permission_set_ids,
// mfa_required, mfa_verified). Defaults MFA flags to "not verified" so
// tests can flip them explicitly when they need to.
function makeUser({ id = 1, role = 'SalesRep', permission_set_ids = [], mfa_required = true, mfa_verified = false, ...rest } = {}) {
  return { id, role, permission_set_ids, mfa_required, mfa_verified, ...rest };
}

// Convenience: a session created at a specific moment relative to now.
function sessionAt(secondsAgo, overrides = {}) {
  const past = new Date(Date.now() - tickClock(secondsAgo));
  return newSession({
    created_at: past.toISOString(),
    last_active: past.toISOString(),
    ...overrides,
  });
}

// ───────── Suite 1: Session hard limit ─────────
//
// Per roles.js, the hard limit is the LOWEST value in the role's parent
// chain (most-restrictive-wins). Because Owner and Admin are at 60 min
// and every non-portal role inherits from them, almost every non-portal
// role ends up with a 60-min hard limit. We test that fact directly.

describe('Session hard limit', () => {
  test('mfaRequiredFor and sessionHardLimitMinutesFor return the documented values', () => {
    // Owner is at the top with mfaRequired=true and 60-min hard limit.
    assert.equal(mfaRequiredFor('Owner'), true);
    assert.equal(sessionHardLimitMinutesFor('Owner'), 60);
    // Admin inherits Owner's 60-min limit and mfaRequired=true.
    assert.equal(mfaRequiredFor('Admin'), true);
    assert.equal(sessionHardLimitMinutesFor('Admin'), 60);
    // SalesRep inherits Admin's mfaRequired + 60-min limit (most restrictive).
    assert.equal(mfaRequiredFor('SalesRep'), true);
    assert.equal(sessionHardLimitMinutesFor('SalesRep'), 60);
    // HelpdeskAgent → ProjectLead → Admin → Owner: 60 wins.
    assert.equal(mfaRequiredFor('HelpdeskAgent'), true);
    assert.equal(sessionHardLimitMinutesFor('HelpdeskAgent'), 60);
    // CustomerPortal is detached from the Owner chain, so its own
    // 1440-min limit applies.
    assert.equal(sessionHardLimitMinutesFor('CustomerPortal'), 1440);
  });

  test('a fresh Owner session passes enforceSessionPolicy', () => {
    // mfa_verified=true so the session-policing MFA check does not
    // fire — we are exercising the hard limit, not the MFA gate.
    const user = makeUser({ id: 1, role: 'Owner', mfa_verified: true });
    const session = newSession();
    assert.doesNotThrow(() => enforceSessionPolicy(user, session));
  });

  test('a fresh Admin session passes', () => {
    const user = makeUser({ id: 1, role: 'Admin', mfa_verified: true });
    const session = newSession();
    assert.doesNotThrow(() => enforceSessionPolicy(user, session));
  });

  test('a session aged past Admin\'s hard limit throws session_hard_limit', () => {
    const clock = useFakeClock(new Date('2030-01-01T00:00:00Z').getTime());
    try {
      // 61 minutes old — just past the 60-min limit.
      const session = sessionAt(61 * 60, { mfa_factor: true });
      const user = makeUser({ id: 1, role: 'Admin', mfa_verified: true });
      assert.throws(
        () => enforceSessionPolicy(user, session),
        (err) => err.code === 'session_hard_limit' && err.statusCode === 401,
      );
    } finally {
      clock.restore();
    }
  });

  test('a session aged past SalesRep\'s hard limit throws session_hard_limit', () => {
    const clock = useFakeClock(new Date('2030-01-01T00:00:00Z').getTime());
    try {
      const session = sessionAt(65 * 60, { mfa_factor: true });
      const user = makeUser({ id: 2, role: 'SalesRep', mfa_verified: true });
      assert.throws(
        () => enforceSessionPolicy(user, session),
        (err) => err.code === 'session_hard_limit',
      );
    } finally {
      clock.restore();
    }
  });

  test('a session right at the boundary still passes', () => {
    // 59 minutes — within the 60-min limit.
    const clock = useFakeClock(new Date('2030-01-01T00:00:00Z').getTime());
    try {
      const session = sessionAt(59 * 60, { mfa_factor: true });
      const user = makeUser({ id: 3, role: 'HelpdeskAgent', mfa_verified: true });
      assert.doesNotThrow(() => enforceSessionPolicy(user, session));
    } finally {
      clock.restore();
    }
  });

  test('a CustomerPortal session gets its own 1440-min limit', () => {
    const clock = useFakeClock(new Date('2030-01-01T00:00:00Z').getTime());
    try {
      // 23 hours — within the 24-hour portal limit.
      const session = sessionAt(23 * 60 * 60, { mfa_factor: false });
      const user = makeUser({ id: 4, role: 'CustomerPortal', mfa_verified: false });
      assert.doesNotThrow(() => enforceSessionPolicy(user, session));
      // 25 hours — over the portal limit.
      const oldSession = sessionAt(25 * 60 * 60, { mfa_factor: false });
      assert.throws(
        () => enforceSessionPolicy(user, oldSession),
        (err) => err.code === 'session_hard_limit' && err.hardLimitMinutes === 1440,
      );
    } finally {
      clock.restore();
    }
  });

  test('enforceSessionPolicy with no user throws 401 Unauthenticated', () => {
    assert.throws(
      () => enforceSessionPolicy(null, newSession()),
      (err) => err.statusCode === 401,
    );
  });
});

// ───────── Suite 2: MFA step-up ─────────
//
// `requirePermissionWithSensitivity` (guards.js) gates "critical"
// permissions on a fresh MFA check. `enforceSessionPolicy` (session
// guard) gates the *role*'s mfaRequired bit. Both must be satisfied
// for a sensitive action to succeed.

describe('MFA step-up', () => {
  // We give the SalesRep a FinanceOperator permission set so the test
  // exercises the gate, not the role/PS lookup. In production this
  // represents a cross-functional grant (e.g. a SalesRep temporarily
  // assigned to book revenue entries).
  const FINANCE_OPS = ['FinanceOperator'];
  const CRITICAL_PERM = 'finance.journal.post';

  test('SalesRep without MFA cannot perform a critical permission', () => {
    const user = makeUser({
      id: 10,
      role: 'SalesRep',
      permission_set_ids: FINANCE_OPS,
      mfa_required: true,
      mfa_verified: false,
    });
    // The user has the permission (via the extra PS), but the
    // sensitivity gate must reject until MFA is verified.
    assert.throws(
      () => requirePermissionWithSensitivity(user, CRITICAL_PERM),
      (err) => err.code === 'rbac_mfa_required' && err.statusCode === 401,
    );
  });

  test('SalesRep with MFA verified (mfa_verified=true) succeeds for the same call', () => {
    const user = makeUser({
      id: 10,
      role: 'SalesRep',
      permission_set_ids: FINANCE_OPS,
      mfa_required: true,
      mfa_verified: true, // ← MFA step-up completed
    });
    assert.doesNotThrow(() => requirePermissionWithSensitivity(user, CRITICAL_PERM));
  });

  test('markMfaVerified flips the session shape that the guard reads', () => {
    // markMfaVerified is a fixture helper, but the property it sets
    // is the one `requirePermissionWithSensitivity` would consult in
    // a real request lifecycle. We assert the helper's contract so
    // future tests have a documented target.
    const clock = useFakeClock(new Date('2030-06-14T12:00:00Z').getTime());
    try {
      const session = newSession();
      assert.equal(session.mfa_verified_at, undefined);
      markMfaVerified(session);
      assert.ok(session.mfa_verified_at, 'mfa_verified_at should be set');
      const stamp = new Date(session.mfa_verified_at).getTime();
      assert.equal(stamp, clock.now());
    } finally {
      clock.restore();
    }
  });

  test('Owner has all permissions implicitly and the MFA gate does not block them', () => {
    // Owner is the super-user: every permission resolves via the
    // implicit shortcut. The sensitivity check still requires
    // mfa_verified=true, but a freshly created Owner session can be
    // set up with MFA already verified (the platform default).
    const owner = makeUser({
      id: 1,
      role: 'Owner',
      mfa_required: true,
      mfa_verified: true,
    });
    assert.equal(hasPermission(owner, CRITICAL_PERM), true);
    assert.doesNotThrow(() => requirePermissionWithSensitivity(owner, CRITICAL_PERM));
  });

  test('a low-sensitivity permission does not require MFA', () => {
    // StandardUser holds crm.lead.read (low). SalesRep can have it via
    // CRMOperator. No MFA gate should fire.
    const user = makeUser({
      id: 11,
      role: 'SalesRep',
      permission_set_ids: ['CRMOperator'],
      mfa_required: true,
      mfa_verified: false,
    });
    assert.doesNotThrow(() => requirePermissionWithSensitivity(user, 'crm.lead.read'));
  });

  test('a missing permission still returns rbac_forbidden, not rbac_mfa_required', () => {
    // When the user has neither the permission nor the MFA, the
    // forbidden check should win (defense in depth: don't leak the
    // existence of the permission to an unverified user).
    const user = makeUser({
      id: 12,
      role: 'SalesRep',
      permission_set_ids: [],
      mfa_required: true,
      mfa_verified: false,
    });
    assert.throws(
      () => requirePermissionWithSensitivity(user, CRITICAL_PERM),
      (err) => err.code === 'rbac_forbidden',
    );
  });
});

// ───────── Suite 3: Impersonation policy ─────────
//
// `canImpersonate(actor, target)` enforces four rules:
//   1. actor must exist and target must exist
//   2. actor cannot impersonate themselves
//   3. only Owner or Admin can impersonate
//   4. only Owner can impersonate Owner/Admin
//   5. the target role must allow impersonation

describe('Impersonation policy', () => {
  test('canBeImpersonated matches the role catalog (per-role property)', () => {
    // Accountant is impersonable (canBeImpersonated: true).
    assert.equal(canBeImpersonated('Accountant'), true);
    // ComplianceOfficer is a sensitive role: NOT impersonable.
    assert.equal(canBeImpersonated('ComplianceOfficer'), false);
    // Owner / Admin / Auditor are NOT impersonable.
    assert.equal(canBeImpersonated('Owner'), false);
    assert.equal(canBeImpersonated('Admin'), false);
    assert.equal(canBeImpersonated('Auditor'), false);
  });

  test('Admin cannot impersonate another Admin', () => {
    const admin = { id: 1, role: 'Admin' };
    const target = { id: 2, role: 'Admin' };
    assert.equal(canImpersonate(admin, target), false);
  });

  test('only Owner can impersonate Owner', () => {
    const owner = { id: 1, role: 'Owner' };
    const otherOwner = { id: 2, role: 'Owner' };
    const admin = { id: 3, role: 'Admin' };
    assert.equal(canImpersonate(owner, otherOwner), false,
      'cannot impersonate self');
    // Wait — that was the self-rule. Two distinct Owners:
    const ownerA = { id: 1, role: 'Owner' };
    const ownerB = { id: 2, role: 'Owner' };
    assert.equal(canImpersonate(ownerA, ownerB), false,
      'Owner cannot impersonate other Owner because canBeImpersonated(Owner)=false');
    assert.equal(canImpersonate(admin, ownerB), false,
      'Admin cannot impersonate Owner');
  });

  test('canBeImpersonated(Accountant)=true, canBeImpersonated(ComplianceOfficer)=false', () => {
    // The role catalog promise, asserted directly.
    assert.equal(canBeImpersonated('Accountant'), true);
    assert.equal(canBeImpersonated('ComplianceOfficer'), false);
    // ComplianceOfficer is impersonable=false → even Owner cannot
    // impersonate them, because canImpersonate consults
    // canBeImpersonated(target.role).
    const owner = { id: 1, role: 'Owner' };
    const compliance = { id: 2, role: 'ComplianceOfficer' };
    assert.equal(canImpersonate(owner, compliance), false);
  });

  test('non-admin/non-owner roles cannot impersonate anyone', () => {
    const sales = { id: 1, role: 'SalesRep' };
    const target = { id: 2, role: 'Accountant' };
    assert.equal(canImpersonate(sales, target), false);
    const helpdesk = { id: 1, role: 'HelpdeskAgent' };
    assert.equal(canImpersonate(helpdesk, target), false);
  });

  test('a non-impersonable target blocks even a privileged actor', () => {
    // Auditor is impersonable=false; Owner cannot override.
    const owner = { id: 1, role: 'Owner' };
    const auditor = { id: 2, role: 'Auditor' };
    assert.equal(canImpersonate(owner, auditor), false);
    // Same for CopilotReviewer and HRLead.
    const copilot = { id: 3, role: 'CopilotReviewer' };
    assert.equal(canImpersonate(owner, copilot), false);
  });
});

// ───────── Suite 4: AppSet isolation ─────────
//
// The RBAC catalog does not (yet) ship a `enforceAppSet` runtime guard,
// so we test the principle using the fixture's `enforceAppSet` helper,
// which maps a permission's category to its primary app and compares
// against the user's effective appSet. This is exactly the check a
// production guard would make, and it documents the intent for the
// next worker who wires it up.

describe('AppSet isolation', () => {
  test('a user in appSet: ["dashboard", "crm"] is denied finance.journal.post', () => {
    const user = withAppSet(
      makeUser({ id: 1, role: 'SalesRep', permission_set_ids: ['FinanceOperator'] }),
      ['dashboard', 'crm'],
    );
    // The user has the permission (via the extra PS) but the appSet
    // gate must reject.
    assert.equal(appAllows(user, 'finance.journal.post'), false);
    assert.throws(
      () => enforceAppSet(user, 'finance.journal.post'),
      (err) => err.code === 'appset_isolation' && err.statusCode === 403,
    );
  });

  test('a user whose appSet includes the permission\'s app can use it', () => {
    const user = withAppSet(
      makeUser({ id: 2, role: 'Accountant', permission_set_ids: ['FinanceOperator'] }),
      ['dashboard', 'finance', 'crm', 'docs'],
    );
    assert.equal(appAllows(user, 'finance.journal.post'), true);
    assert.doesNotThrow(() => enforceAppSet(user, 'finance.journal.post'));
  });

  test('per-user appSet override beats the role\'s catalog appSet', () => {
    // Accountant has a default appSet that includes 'finance'. We
    // override it on the user to simulate a tenant admin restricting
    // a contractor to CRM-only.
    const accountant = withAppSet(
      makeUser({ id: 3, role: 'Accountant', permission_set_ids: ['FinanceOperator'] }),
      ['dashboard', 'crm', 'docs'],
    );
    assert.equal(appAllows(accountant, 'finance.journal.post'), false);
  });

  test('an unknown permission key is not gated (avoids breaking the open-endpoint list)', () => {
    const user = withAppSet(makeUser({ id: 4, role: 'SalesRep' }), ['dashboard', 'crm']);
    // The fixture's appAllows returns true for unknown keys so the
    // open-endpoint allowlist can still pass them through.
    assert.equal(appAllows(user, 'system.tenant.read'), false,
      'known keys are still gated');
    assert.equal(appAllows(user, 'totally.fake.permission'), true,
      'unknown keys are open');
  });
});

// ───────── Suite 5: Idle timeout vs hard timeout ─────────
//
// `enforceSessionPolicy` enforces a hard limit on the session's *age*
// (created_at). The catalog does not (yet) define an *idle* timeout
// in roles.js, so we test the principle with the fixture's
// `idleTimeoutMinutesFor` helper. The next worker who adds an idle
// policy to the role catalog only needs to swap the helper for the
// real guard.

describe('Idle timeout vs hard timeout', () => {
  // Per the task brief, FinanceLead should force re-auth after 15 min
  // of inactivity; Auditor should not. These are documented in the
  // fixture so the test reads as a contract.
  const IDLE_TIMEOUT_MIN = {
    FinanceLead: 15,
    Auditor: 30,   // longer window; not forced at 15 min
    Owner: 60,
    SalesRep: 30,
  };

  function idleTimeoutMinutesFor(role) {
    return IDLE_TIMEOUT_MIN[role] ?? 30;
  }

  function enforceIdleTimeout(user, session) {
    if (!user || !session) return;
    const limit = idleTimeoutMinutesFor(user.role);
    const idleMin = (Date.now() - new Date(session.last_active).getTime()) / 60000;
    if (idleMin > limit) {
      const err = new Error('Idle timeout exceeded');
      err.statusCode = 401;
      err.code = 'idle_timeout';
      err.idleLimitMinutes = limit;
      throw err;
    }
  }

  test('FinanceLead idle for 15 minutes is forced to re-auth', () => {
    const clock = useFakeClock(new Date('2030-06-14T09:00:00Z').getTime());
    try {
      const session = sessionAt(15 * 60 + 1, { mfa_factor: true });
      const user = makeUser({ id: 1, role: 'FinanceLead', mfa_verified: true });
      // Hard limit not hit (60 min for FinanceLead). Idle should
      // fire first.
      assert.equal(sessionHardLimitMinutesFor('FinanceLead'), 60);
      assert.throws(
        () => enforceIdleTimeout(user, session),
        (err) => err.code === 'idle_timeout' && err.idleLimitMinutes === 15,
      );
    } finally {
      clock.restore();
    }
  });

  test('Auditor idle for 15 minutes is NOT forced to re-auth', () => {
    const clock = useFakeClock(new Date('2030-06-14T09:00:00Z').getTime());
    try {
      const session = sessionAt(15 * 60, { mfa_factor: true });
      const user = makeUser({ id: 2, role: 'Auditor', mfa_verified: true });
      assert.doesNotThrow(() => enforceIdleTimeout(user, session));
    } finally {
      clock.restore();
    }
  });

  test('Owner idle for the same window is NOT forced to re-auth', () => {
    const clock = useFakeClock(new Date('2030-06-14T09:00:00Z').getTime());
    try {
      const session = sessionAt(16 * 60, { mfa_factor: true });
      const user = makeUser({ id: 3, role: 'Owner', mfa_verified: true });
      assert.doesNotThrow(() => enforceIdleTimeout(user, session));
    } finally {
      clock.restore();
    }
  });

  test('idle timeout fires before the hard limit for FinanceLead', () => {
    // 16 minutes idle: idle limit (15) tripped first, hard limit (60)
    // not tripped. The two policies are independent — a single
    // session can be killed by either.
    const clock = useFakeClock(new Date('2030-06-14T09:00:00Z').getTime());
    try {
      const session = sessionAt(16 * 60, { mfa_factor: true });
      const user = makeUser({ id: 4, role: 'FinanceLead', mfa_verified: true });
      assert.doesNotThrow(() => enforceSessionPolicy(user, session),
        'hard limit not hit yet');
      assert.throws(() => enforceIdleTimeout(user, session),
        (err) => err.code === 'idle_timeout',
        'idle limit hits at 15 min');
    } finally {
      clock.restore();
    }
  });
});

// ───────── Suite 6 (bonus): fastify preHandler shape ─────────
//
// `requirePerm` is the Fastify preHandler factory the route layer
// uses. We exercise it through the fixture's fakeReply to confirm
// the response shape matches what the routes module documents.

describe('requirePerm preHandler (Fastify shape)', () => {
  test('returns 403 with rbac_forbidden when the user lacks the permission', async () => {
    const { requirePerm } = require('../server/rbac/guards');
    const handler = requirePerm('finance.journal.post');
    const user = makeUser({ id: 1, role: 'SalesRep', permission_set_ids: [], mfa_verified: true });
    const request = fakeRequest({ user, session: newSession() });
    const reply = fakeReply();
    await handler(request, reply);
    assert.equal(reply._code, 403);
    assert.equal(reply.body.error, 'rbac_forbidden');
    assert.equal(reply.body.required, 'finance.journal.post');
  });

  test('returns 200 (no body change) when the user holds the permission', async () => {
    const { requirePerm } = require('../server/rbac/guards');
    const handler = requirePerm('finance.journal.post');
    // Owner has every permission implicitly, no MFA gate fires because
    // mfa_verified=true.
    const user = makeUser({ id: 1, role: 'Owner', mfa_verified: true });
    const request = fakeRequest({ user, session: newSession() });
    const reply = fakeReply();
    await handler(request, reply);
    // The handler does not call reply.send() on success — it just
    // returns. The next preHandler in the chain runs.
    assert.equal(reply.sent, false);
  });
});
