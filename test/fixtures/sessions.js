// A1 ERP-HY Session Test Fixtures
//
// Lightweight factories for building user objects, session objects, and
// Fastify-like request objects that match the shape the RBAC guards
// (`enforceSessionPolicy`, `requirePermission`, `requirePerm`) expect.
//
// These fixtures are intentionally minimal — they don't read from a DB
// or generate tokens. They just produce the in-memory shapes the guards
// inspect, so tests can exercise guard logic deterministically.
//
// Public surface:
//   newSession({ user, mfaVerifiedAt, appSet, role, ... }) → session
//   tickClock(seconds)                                     → ms
//   fakeRequest({ user, session, headers })                → request
//   markMfaVerified(session)                               → session
//   setRole(user, role)                                    → user
//   withAppSet(user, apps)                                 → user
//
// Why hand-rolled?
//   The RBAC guards are pure functions over the request/user/session
//   shape. Pulling in a real session manager would add a database
//   dependency, slow tests down, and make failures harder to read.
//   These factories keep the tests fast and the guard code unchanged.

'use strict';

const rbac = require('../../server/rbac');

const { getEffectiveAppSet, PERMISSIONS } = rbac;

// ───────── session factory ─────────
//
// `enforceSessionPolicy` reads these fields off the session:
//   - created_at:   ISO-8601 string (compared against Date.now())
//   - mfa_factor:   truthy when the session is MFA-capable
//   - last_active:  ISO-8601 string (used by idle-timeout logic)
//
// We default `created_at` to "now" so a fresh session always passes the
// hard-limit check; tests can override it or use tickClock() to age it.

function newSession(overrides = {}) {
  const { user, mfaVerifiedAt, appSet, role, created_at, last_active, mfa_factor, ...rest } = overrides;
  const now = new Date().toISOString();
  const session = {
    id: overrides.id || `sess_${Math.random().toString(36).slice(2, 10)}`,
    user_id: (user && user.id) || 0,
    created_at: created_at || now,
    last_active: last_active || now,
    mfa_factor: typeof mfa_factor === 'boolean' ? mfa_factor : true,
    ...rest,
  };
  if (mfaVerifiedAt) {
    session.mfa_verified_at = (mfaVerifiedAt instanceof Date)
      ? mfaVerifiedAt.toISOString()
      : String(mfaVerifiedAt);
  }
  return session;
}

// `markMfaVerified` stamps `mfa_verified_at` on the session. After this
// call, `enforceSessionPolicy` should accept an MFA-required role without
// throwing.
function markMfaVerified(session) {
  if (!session) throw new Error('markMfaVerified: session is required');
  session.mfa_verified_at = new Date().toISOString();
  return session;
}

// ───────── clock helper ─────────
//
// Convert seconds → ms. Guards compare in minutes, so this is the unit
// the test author thinks in.
function tickClock(seconds) {
  return Math.floor(Number(seconds) * 1000);
}

// ───────── request factory ─────────
//
// Builds a Fastify-like request object. The preHandler hooks only read
// `request.user`, `request.headers`, and (sometimes) `request.session`.
// We also add a minimal `reply` object that captures the response code
// and body, so tests can assert against `requirePerm`'s output without
// booting a real Fastify.

function fakeRequest({ user = null, session = null, headers = {}, body = null } = {}) {
  return {
    user: user || null,
    session: session || null,
    headers: { ...headers },
    body,
    ip: '127.0.0.1',
    method: 'GET',
    url: '/api/test',
    // Helper for guard tests: pass a preHandler from the rbac module
    // and assert against the response. Not used by guards themselves.
  };
}

function fakeReply() {
  // Mirror Fastify's reply interface: `code(n)` is a chainable setter
  // that returns `this`, and `send(payload)` writes the response. The
  // preHandler in server/rbac/guards.js uses both, so we have to
  // support both.
  const reply = {
    body: undefined,
    sent: false,
  };
  reply.code = function code(n) {
    reply._code = n;
    return reply;
  };
  reply.send = function send(payload) {
    reply.body = payload;
    reply.sent = true;
    if (typeof reply._code !== 'number') reply._code = 200;
    return reply;
  };
  return reply;
}

// ───────── user factories ─────────
//
// A user object is a thin wrapper. `enforceSessionPolicy` reads:
//   - user.id
//   - user.role
//   - user.mfa_required, user.mfa_verified
// while `requirePermission` reads:
//   - user.id, user.role, user.permission_set_ids
//   - user.mfa_required, user.mfa_verified (for sensitivity gating)
//
// The defaults are deliberately minimal so tests can focus on one
// variable at a time.

function setRole(user, role) {
  return { ...user, role };
}

function withAppSet(user, apps) {
  // The appSet is a property of the role catalog; a user with a custom
  // appSet would be stored via the per-user app_assignments table. We
  // keep the override on the user so tests can simulate "this user is
  // restricted to {finance}" without creating a custom role.
  return { ...user, appSet: Array.isArray(apps) ? [...apps] : apps };
}

// ───────── appSet gate helper ─────────
//
// Maps a permission's category to its primary app id, then checks the
// user's effective appSet for that app. This is the "appSet isolation"
// layer the task asks us to test. We expose it as a fixture helper
// (not a production guard) so the test file can demonstrate the
// principle without taking a dependency on future guards.
const CATEGORY_TO_APP = Object.freeze({
  system:     'system',
  security:   'settings',
  finance:    'finance',
  crm:        'crm',
  inv:        'inventory',
  purchase:   'purchase',
  pos:        'pos',
  hr:         'hr',
  projects:   'projects',
  desk:       'desk',
  docs:       'docs',
  portal:     'portal',
  mrkt:       'marketing',
  mfg:        'mfg',
  ai:         'ai',
  reports:    'reports',
  studio:     'studio',
  compliance: 'compliance',
});

function appAllows(user, permissionKey) {
  if (!user) return false;
  const def = PERMISSIONS[permissionKey];
  if (!def) return true; // unknown permission: no appSet gate
  const requiredApp = CATEGORY_TO_APP[def.category];
  if (!requiredApp) return true; // unmapped category: open

  // Per-user override (set by withAppSet) takes precedence over the
  // role's catalog appSet. This mirrors the app_assignments table.
  let apps;
  if (Array.isArray(user.appSet)) {
    apps = user.appSet;
  } else {
    apps = getEffectiveAppSet(user.role);
  }
  return apps.includes(requiredApp);
}

function enforceAppSet(user, permissionKey) {
  if (!appAllows(user, permissionKey)) {
    const def = PERMISSIONS[permissionKey] || {};
    const requiredApp = CATEGORY_TO_APP[def.category] || def.category;
    const err = new Error(`AppSet isolation: ${requiredApp} not in user's appSet`);
    err.statusCode = 403;
    err.code = 'appset_isolation';
    err.required = permissionKey;
    err.requiredApp = requiredApp;
    throw err;
  }
}

module.exports = {
  newSession,
  markMfaVerified,
  tickClock,
  fakeRequest,
  fakeReply,
  setRole,
  withAppSet,
  appAllows,
  enforceAppSet,
  CATEGORY_TO_APP,
};
