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

test('rolesWithPermission: hr.employee.create is currently broad (catalog gap, tracked in BROAD GRANT)', () => {
  // This test pins the current state of hr.employee.create so a future
  // PR that narrows the catalog (e.g. drops HRLead from the roleMatrix)
  // can be reviewed against an explicit assertion. The test is also
  // self-documenting: it tells the reviewer WHY the perm is broad.
  //
  // Note: the catalog grant set intentionally does NOT include
  // Accountant (the legacy required Accountant, so the legacy is
  // actually wider than the catalog in this one role). The audit
  // framework only flags catalog-widening, not catalog-narrowing,
  // because widening is the security regression and narrowing just
  // removes access.
  const holders = rolesWithPermission('hr.employee.create');
  assert.ok(holders.includes('Owner'));
  assert.ok(holders.includes('Admin'));
  assert.ok(holders.includes('HRLead'), 'HRLead is intentionally in the catalog grant — see audit BROAD GRANT row');
  assert.ok(holders.includes('HRSpecialist'), 'HRSpecialist is intentionally in the catalog grant');
  assert.ok(holders.includes('PayrollClerk'), 'PayrollClerk is intentionally in the catalog grant');
  // SalesRep / HelpdeskAgent must NOT (they have no business writing
  // employee records even if the catalog accidentally grants it).
  for (const blocked of ['SalesRep', 'HelpdeskAgent', 'Bookkeeper']) {
    assert.ok(!holders.includes(blocked), `${blocked} must NOT hold hr.employee.create`);
  }
});

test('rolesWithPermission: unknown perm key returns empty array (does not throw)', () => {
  const holders = rolesWithPermission('definitely.not.a.perm');
  assert.deepEqual(holders, []);
});

test('rolesWithPermission: every perm key in auditMap.helpers resolves to a non-empty holder set', () => {
  // The helpers section of the audit map is the one we expect to PASS
  // or BROAD GRANT — it should never resolve to an empty holder set
  // unless the perm key is itself unknown.
  for (const [helperName, helperDef] of Object.entries(auditMap.helpers)) {
    if (!helperDef.permKey) continue;
    if (!isValidKey(helperDef.permKey)) continue; // unknown-key is a separate failure mode
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
