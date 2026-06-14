#!/usr/bin/env node
// scripts/lint-rbac-broad-grants.js
//
// RBAC "broad-grant" lint. The companion to scripts/lint-rbac.js.
//
// The pre-existing lint rejects direct role checks in handlers. This lint
// rejects the more subtle failure mode where a *catalog-driven* migration
// silently widens access: e.g. a Wave 3 worker maps a helper that used to
// allow only ["Owner", "Admin"] to a perm key whose role matrix grants
// that perm to a dozen roles. The end result is that a role like SalesRep
// — which had no business editing period-close journals — suddenly can.
//
// The invariant: for every requireXxx helper and every preHandler: requirePerm
// route, the set of roles that hold the perm key (computed by inverting
// roles → roleMatrix → permission sets → permission keys) must be a SUBSET
// of the legacy allow-list the original code enforced.
//
// Outputs:
//   - stdout: pass/fail summary, exit 0 if no broad grants
//   - docs/CATALOG_GRANT_AUDIT.md: machine-readable report with PASS /
//     BROAD GRANT / NO LEGACY ALLOW-LIST sections
//   - the audit is also exposed as a library (require('./lint-rbac-broad-grants'))
//     so test/rbac-broad-grants.test.js can lock in the snapshot.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { PERMISSIONS, isValidKey, listKeys } = require('../server/rbac/permissions');
const { ROLES, listRoleIds } = require('../server/rbac/roles');
const { PERMISSION_SETS } = require('../server/rbac/matrix');
const { ROLE_MATRIX, listForRole, expandRolePermissions } = require('../server/rbac/roleMatrix');
const auditMap = require('../server/rbac/helper-audit-map.json');

// ────────────────────────── Catalog: roles → permissions ──────────────────────────
//
// The catalog itself defines which permission sets a role holds by default
// (roleMatrix.js). The runtime also lets a user carry extra permission
// sets via `user.permission_set_ids` (additive). For the audit we ask:
// "for the *default* state of every system role, which roles hold the
// given perm key?" That is the question that matters for the migration:
// the catalog must not grant the perm to any role that the legacy code
// did not allow.
function rolesWithPermission(permKey) {
  if (!isValidKey(permKey)) {
    return Object.freeze([]);
  }
  const holders = [];
  for (const roleId of listRoleIds()) {
    const perms = expandRolePermissions(roleId, []);
    if (perms.has(permKey)) holders.push(roleId);
  }
  return Object.freeze(holders.sort());
}

// ────────────────────────── App.js allow-list extraction ──────────────────────────
//
// Two sources of the legacy allow-list, in priority order:
//   1. An inline annotation inside the helper body of the CURRENT app.js,
//      in the form: // rbac-audit: expected-roles Owner, Admin, Auditor
//   2. A regex parse of the legacy 0da6676:server/app.js pulled from git.
//      (The Wave 3 revert is the *current* state, so a static role list
//       in the current helper body is still the source of truth.)
//
// Returns { expectedRoles: string[] | null, source: 'annotation' | 'parsed' | 'unmappable' }
const ALLOWLIST_ANNOTATION_RE = /rbac-audit:\s*expected-roles\s+([A-Za-z][A-Za-z _,\-0-9]*)/;
const ROLE_ARRAY_RE = /\[([^\]]+)\]\.includes\(\s*user\.role\b/;

function parseAllowListFromHelperBody(body) {
  // Honor the inline annotation first.
  const ann = body.match(ALLOWLIST_ANNOTATION_RE);
  if (ann) {
    const names = ann[1].split(',').map((s) => s.trim()).filter(Boolean);
    return { expectedRoles: names, source: 'annotation' };
  }
  // Try to find [...].includes(user.role)
  const m = body.match(ROLE_ARRAY_RE);
  if (m) {
    const arrayText = m[1];
    const qm = arrayText.match(/['"]([^'"]+)['"]/g) || [];
    const roles = qm.map((q) => q.replace(/['"]/g, ''));
    if (roles.length > 0) {
      return { expectedRoles: roles, source: 'parsed' };
    }
  }
  // Single-compare: user.role !== "X" means "deny everyone except X" — treat as a single-role allow-list.
  const neq = body.match(/user\.role\s*[!=]==?\s*['"]([^'"]+)['"]/);
  if (neq) {
    return { expectedRoles: [neq[1]], source: 'parsed' };
  }
  return { expectedRoles: null, source: 'unmappable' };
}

// Read the helper bodies from the current (post-Wave-3-revert) app.js.
// We could pull them from the legacy commit, but using the current tree
// means the audit also picks up the inline `// rbac-audit: expected-roles`
// annotations as they get added in future waves.
function loadHelperBodies(appJsText) {
  const fnRe = /function\s+(require[A-Z][a-zA-Z]+)\s*\(\s*user\s*\)\s*\{/g;
  const out = {};
  let m;
  while ((m = fnRe.exec(appJsText)) !== null) {
    const name = m[1];
    let i = m.index + m[0].length;
    let depth = 1;
    const start = i;
    while (i < appJsText.length && depth > 0) {
      const ch = appJsText[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    out[name] = appJsText.slice(start, i - 1);
  }
  return out;
}

// ────────────────────────── Audit core ──────────────────────────
function audit() {
  const repoRoot = path.resolve(__dirname, '..');
  const appJsPath = path.join(repoRoot, 'server/app.js');
  const appJsText = fs.readFileSync(appJsPath, 'utf8');
  const helperBodies = loadHelperBodies(appJsText);

  const findings = [];
  // Shape: { kind, source, permKey, expectedRoles, actualRoles, extraRoles }
  //   kind: 'pass' | 'broad' | 'no-legacy'
  //   source: helper name or route path
  //   actualRoles: rolesWithPermission(permKey) at the time of the run
  //   extraRoles: actualRoles \ expectedRoles (only when kind === 'broad')
  //   expectedRoles: legacy allow-list, or null

  function recordPass(source, permKey, expectedRoles, actualRoles) {
    findings.push({ kind: 'pass', source, permKey, expectedRoles, actualRoles, extraRoles: [] });
  }
  function recordBroad(source, permKey, expectedRoles, actualRoles, extraRoles) {
    findings.push({ kind: 'broad', source, permKey, expectedRoles, actualRoles, extraRoles });
  }
  function recordNoLegacy(source, permKey, actualRoles) {
    findings.push({
      kind: 'no-legacy',
      source,
      permKey,
      expectedRoles: null,
      actualRoles,
      extraRoles: [],
    });
  }

  // 1. Audit every requireXxx helper that's named in the audit map.
  for (const [helperName, helperDef] of Object.entries(auditMap.helpers)) {
    const { permKey } = helperDef;
    if (!permKey) continue;
    if (!isValidKey(permKey)) {
      // Catalog gap — the migration targeted a perm key that doesn't exist
      // in the catalog. This is a different failure mode (UNKNOWN PERM KEY),
      // not a broad grant, so the lint flags it under its own section.
      findings.push({
        kind: 'unknown-key',
        source: helperName,
        permKey,
        expectedRoles: null,
        actualRoles: [],
        extraRoles: [],
        note: `permKey '${permKey}' is not in the PERMISSIONS catalog`,
      });
      continue;
    }
    const actual = rolesWithPermission(permKey);
    // Pull the legacy allow-list from the helper body (annotation first,
    // then parsed). The map only covers the migrated helpers; the rest
    // are in auditMap.unmappable and reported as 'no-legacy'.
    const body = helperBodies[helperName] || '';
    const { expectedRoles } = parseAllowListFromHelperBody(body);
    if (expectedRoles === null) {
      recordNoLegacy(helperName, permKey, actual);
      continue;
    }
    const expected = new Set(expectedRoles);
    const extras = actual.filter((r) => !expected.has(r));
    if (extras.length > 0) {
      recordBroad(helperName, permKey, expectedRoles, actual, extras);
    } else {
      recordPass(helperName, permKey, expectedRoles, actual);
    }
  }

  // 2. Audit the Wave 3 auth-security preHandler routes (the only slice
  //    the Wave 4 migrate-preHandlers-only worker re-applies). For each,
  //    we already have a static legacyAllowList in the map.
  const authSecRoutes = auditMap.routes['auth-security-slice'] || [];
  for (const r of authSecRoutes) {
    if (!isValidKey(r.permKey)) {
      findings.push({
        kind: 'unknown-key',
        source: `${r.method} ${r.path}`,
        permKey: r.permKey,
        expectedRoles: r.legacyAllowList || null,
        actualRoles: [],
        extraRoles: [],
        note: `permKey '${r.permKey}' is not in the PERMISSIONS catalog`,
      });
      continue;
    }
    const actual = rolesWithPermission(r.permKey);
    if (!r.legacyAllowList || r.legacyAllowList.length === 0) {
      recordNoLegacy(`${r.method} ${r.path}`, r.permKey, actual);
      continue;
    }
    const expected = new Set(r.legacyAllowList);
    const extras = actual.filter((role) => !expected.has(role));
    if (extras.length > 0) {
      recordBroad(`${r.method} ${r.path}`, r.permKey, r.legacyAllowList, actual, extras);
    } else {
      recordPass(`${r.method} ${r.path}`, r.permKey, r.legacyAllowList, actual);
    }
  }

  // 3. Audit the wider catalog slice (the Wave 3 routes the Wave 4
  //    migrate-preHandlers-only worker does NOT re-apply). These were
  //    the bulk of the wave 3 conversion; the audit proves the catalog
  //    grants today are correct for the legacy allow-lists in scope.
  //    If a route in the slice has been annotated (legacyAllowList set),
  //    the audit uses it as expectedRoles and reports PASS / BROAD GRANT
  //    exactly like the auth-security slice. Routes without
  //    legacyAllowList are reported as 'no-legacy' so a future wave can
  //    fill in the annotation.
  const widerSlice = (auditMap.routes['catalog-inventory-purchase-pilots-slice'] || {}).routes || [];
  for (const r of widerSlice) {
    if (!isValidKey(r.permKey)) {
      findings.push({
        kind: 'unknown-key',
        source: `${r.method} ${r.path}`,
        permKey: r.permKey,
        expectedRoles: null,
        actualRoles: [],
        extraRoles: [],
        note: `permKey '${r.permKey}' is not in the PERMISSIONS catalog`,
      });
      continue;
    }
    const actual = rolesWithPermission(r.permKey);
    if (!r.legacyAllowList || r.legacyAllowList.length === 0) {
      recordNoLegacy(`${r.method} ${r.path}`, r.permKey, actual);
      continue;
    }
    const expected = new Set(r.legacyAllowList);
    const extras = actual.filter((role) => !expected.has(role));
    if (extras.length > 0) {
      recordBroad(`${r.method} ${r.path}`, r.permKey, r.legacyAllowList, actual, extras);
    } else {
      recordPass(`${r.method} ${r.path}`, r.permKey, r.legacyAllowList, actual);
    }
  }

  return { findings, generatedAt: new Date().toISOString() };
}

// ────────────────────────── Report writers ──────────────────────────
function renderMarkdownReport(auditResult) {
  const { findings, generatedAt } = auditResult;
  const passes = findings.filter((f) => f.kind === 'pass');
  const broads = findings.filter((f) => f.kind === 'broad');
  const noLegacys = findings.filter((f) => f.kind === 'no-legacy');
  const unknowns = findings.filter((f) => f.kind === 'unknown-key');

  const lines = [];
  lines.push('# Catalog Grant Audit');
  lines.push('');
  lines.push(`Generated: \`${generatedAt}\``);
  lines.push('');
  lines.push('This report is the output of `scripts/lint-rbac-broad-grants.js`.');
  lines.push('It proves the invariant the Wave 3 migration workers violated:');
  lines.push('');
  lines.push('> For every `requireXxx` helper and every `preHandler: requirePerm(...)`');
  lines.push('> route, the set of roles that hold the corresponding permission key');
  lines.push('> (computed by inverting `roleMatrix` + matrix permission sets) is a');
  lines.push('> **subset of** the legacy allow-list the original code enforced.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Section | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| PASS — perm grants ⊆ legacy allow-list | ${passes.length} |`);
  lines.push(`| BROAD GRANT — perm grants ⊃ legacy allow-list | ${broads.length} |`);
  lines.push(`| NO LEGACY ALLOW-LIST — needs manual annotation | ${noLegacys.length} |`);
  lines.push(`| UNKNOWN PERM KEY — not in current catalog | ${unknowns.length} |`);
  lines.push('');
  lines.push(`Total entries audited: **${findings.length}**`);
  lines.push('');

  // PASS section
  lines.push('## PASS — perm grants ⊆ legacy allow-list');
  lines.push('');
  if (passes.length === 0) {
    lines.push('_No findings._');
  } else {
    lines.push('| Source | Perm key | Legacy allow-list | Catalog grant |');
    lines.push('|---|---|---|---|');
    for (const f of passes) {
      lines.push(`| \`${f.source}\` | \`${f.permKey}\` | ${formatRoles(f.expectedRoles)} | ${formatRoles(f.actualRoles)} |`);
    }
  }
  lines.push('');

  // BROAD GRANT section
  lines.push('## BROAD GRANT — perm grants ⊃ legacy allow-list');
  lines.push('');
  if (broads.length === 0) {
    lines.push('_No findings._ **The catalog is correctly scoped for every audited site.**');
  } else {
    lines.push('A broad grant means the catalog grants the permission to roles that the');
    lines.push('legacy `user.role` allow-list explicitly did NOT. The migration cannot be');
    lines.push('re-applied until the catalog is narrowed (or the allow-list is widened,');
    lines.push('which requires product sign-off).');
    lines.push('');
    lines.push('| Source | Perm key | Legacy allow-list | Catalog grant | Extra roles |');
    lines.push('|---|---|---|---|---|');
    for (const f of broads) {
      lines.push(`| \`${f.source}\` | \`${f.permKey}\` | ${formatRoles(f.expectedRoles)} | ${formatRoles(f.actualRoles)} | ${formatRoles(f.extraRoles)} |`);
    }
  }
  lines.push('');

  // NO LEGACY ALLOW-LIST section
  lines.push('## NO LEGACY ALLOW-LIST — could not find a requireXxx helper for this perm');
  lines.push('');
  if (noLegacys.length === 0) {
    lines.push('_No findings._');
  } else {
    lines.push('These are perm keys the Wave 3 migration targeted (or the audit map');
    lines.push('catalogued) for which the legacy code did not use a static role list.');
    lines.push('Each row is either a route that had no in-handler check (just `app.auth`),');
    lines.push('or a helper that delegated to a compound predicate (`mfaRequiredForRole`,');
    lines.push('`canAccessInvoiceOverdueExplanation`, etc.). They are reported so that a');
    lines.push('future wave can add a `// rbac-audit: expected-roles Owner, Admin, ...`');
    lines.push('annotation inside the helper body and the lint will pick it up automatically.');
    lines.push('');
    lines.push('| Source | Perm key | Catalog grant |');
    lines.push('|---|---|---|');
    for (const f of noLegacys) {
      lines.push(`| \`${f.source}\` | \`${f.permKey}\` | ${formatRoles(f.actualRoles)} |`);
    }
  }
  lines.push('');

  // UNKNOWN PERM KEY section
  if (unknowns.length > 0) {
    lines.push('## UNKNOWN PERM KEY — not in current catalog');
    lines.push('');
    lines.push('These perm keys were targeted by Wave 3 (or catalogued in the audit');
    lines.push('map) but do not exist in the current `server/rbac/permissions.js`');
    lines.push('catalog. The audit cannot compute the role grant set for them, so');
    lines.push('they are reported separately from BROAD GRANT. Treat each row as a');
    lines.push('catalog gap: either the perm key was renamed in a later wave, or it');
    lines.push('was added to the route without being added to the catalog. Resolve');
    lines.push('by updating either the route or the catalog to match.');
    lines.push('');
    lines.push('| Source | Perm key | Note |');
    lines.push('|---|---|---|');
    for (const f of unknowns) {
      lines.push(`| \`${f.source}\` | \`${f.permKey}\` | ${f.note || '_(not in catalog)_'} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('Regenerate with:');
  lines.push('');
  lines.push('```bash');
  lines.push('node scripts/lint-rbac-broad-grants.js');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function formatRoles(roles) {
  if (roles === null || roles === undefined) return '_(none)_';
  if (roles.length === 0) return '_(empty)_';
  return roles.map((r) => '`' + r + '`').join(', ');
}

function renderStdoutSummary(auditResult) {
  const { findings } = auditResult;
  const passes = findings.filter((f) => f.kind === 'pass');
  const broads = findings.filter((f) => f.kind === 'broad');
  const noLegacys = findings.filter((f) => f.kind === 'no-legacy');
  const unknowns = findings.filter((f) => f.kind === 'unknown-key');
  const lines = [];
  lines.push(`RBAC broad-grant audit: scanned ${findings.length} site(s).`);
  lines.push(`  ✓ ${passes.length} PASS — catalog grants ⊆ legacy allow-list`);
  if (broads.length > 0) {
    lines.push(`  ✗ ${broads.length} BROAD GRANT — catalog grants ⊃ legacy allow-list`);
    for (const f of broads) {
      lines.push(`    - ${f.source} → ${f.permKey}: extra roles ${formatRoles(f.extraRoles)}`);
    }
  } else {
    lines.push(`  ✓ 0 BROAD GRANT — catalog is correctly scoped`);
  }
  lines.push(`  ? ${noLegacys.length} NO LEGACY ALLOW-LIST — needs manual annotation`);
  if (unknowns.length > 0) {
    lines.push(`  ! ${unknowns.length} UNKNOWN PERM KEY — not in current catalog`);
    for (const f of unknowns) {
      lines.push(`    - ${f.source} → ${f.permKey}`);
    }
  }
  return lines.join('\n');
}

// ────────────────────────── CLI entry point ──────────────────────────
function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const m = args.find((a) => a.startsWith(`--${name}=`));
    return m ? m.slice(name.length + 3) : null;
  };
  const writeReport = !args.includes('--no-write');
  const quiet = args.includes('--quiet');
  const jsonOut = flag('json');
  const reportPath = flag('report') || path.join(__dirname, '..', 'docs/CATALOG_GRANT_AUDIT.md');

  const result = audit();

  if (jsonOut) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (!quiet) {
    process.stdout.write(renderStdoutSummary(result) + '\n');
  }

  if (writeReport) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, renderMarkdownReport(result), 'utf8');
    if (!quiet && !jsonOut) {
      process.stdout.write(`Wrote ${path.relative(process.cwd(), reportPath)}\n`);
    }
  }

  const broadCount = result.findings.filter((f) => f.kind === 'broad').length;
  process.exit(broadCount > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  audit,
  rolesWithPermission,
  parseAllowListFromHelperBody,
  loadHelperBodies,
  renderMarkdownReport,
  renderStdoutSummary,
  // Expose the map for downstream tools / tests.
  auditMap,
};
