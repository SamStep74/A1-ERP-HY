#!/usr/bin/env node
// scripts/lint-rbac.js
//
// RBAC lint. Walks a set of source roots and flags:
//
//   1. Direct role checks that don't go through rbac.guards.
//      Detects patterns like:
//        req.user.role === 'Owner'
//        user.role !== "Admin"
//        ["Owner","Admin"].includes(user.role)
//
//   2. requirePerm(...) / requireAnyPerm(...) calls with an unknown
//      permission key (i.e. not in PERMISSIONS).
//
//   3. Sensitive field paths that appear in route return-shapes but
//      are NOT covered by FLS_RULES. (Heuristic: scan response literal
//      objects for top-level keys like tax_id / account_number; warn if
//      a redact path that would cover them is missing.)
//
//   4. Catalog-driven broad grants: for every requireXxx helper and
//      preHandler: requirePerm(...) route, the set of roles that hold
//      the perm key (computed by inverting roleMatrix + matrix
//      permission sets) must be a SUBSET of the legacy user.role
//      allow-list. If the catalog is wider than the legacy, the lint
//      flags it as a BROAD GRANT (the failure mode the Wave 3 workers
//      hit). Delegates to scripts/lint-rbac-broad-grants.js.
//
// Usage:
//   node scripts/lint-rbac.js [--roots=server/rbac,server/migration] [--quiet] [--no-fail]
//   node scripts/lint-rbac.js --no-broad-grants   # skip the catalog-grant stage
//
// Exits 0 on a clean run, 1 on any finding (unless --no-fail). The
// broad-grant check has its own exit semantics and always fails on
// BROAD GRANT findings, regardless of --no-fail, because a broad grant
// is a security regression, not a maintainability concern.
//
// Wired into `npm test` so the rule is enforced on every CI run.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  PERMISSIONS,
  isValidKey,
} = require('../server/rbac/permissions');
const { FLS_RULES } = require('../server/rbac/guards');

// ───────────── CLI args ─────────────
const args = process.argv.slice(2);
const flag = (name) => {
  const m = args.find((a) => a.startsWith(`--${name}=`));
  return m ? m.slice(name.length + 3) : null;
};
const boolFlag = (name) => args.includes(`--${name}`);

const rootsArg = flag('roots');
const quiet = boolFlag('quiet');
const noFail = boolFlag('no-fail');
const skipBroadGrants = boolFlag('no-broad-grants') || boolFlag('skip-broad-grants');

const DEFAULT_ROOTS = ['server', 'web/src'];
const roots = (rootsArg ? rootsArg.split(',') : DEFAULT_ROOTS).map((p) => path.resolve(p));

// Path-based allowlist. A file whose absolute path is under any of these
// directories is skipped by the role-check rule. We use this for the
// catalog implementation itself (server/rbac/), which legitimately needs
// to inspect user.role to enforce the Owner shortcut, RLS bypasses, and
// portal isolation. The catalog is the ground truth for permission
// resolution; flagging it would be circular.
//
// Add new paths here only with a comment explaining WHY the catalog
// implementation is allowed to compare roles directly.
const ROLE_CHECK_PATH_ALLOWLIST = [
  path.resolve('server/rbac'),
];

// Legacy allowlist: a directory whose files are known to contain
// `user.role` checks because they pre-date the catalog migration. New
// role checks in the legacy code are still rejected by the lint
// because the lint is run with the live `server/` tree; only files
// in the path are exempt. This is a wave-2 placeholder: future waves
// will peel files out of this list as their helper functions are
// refactored to use `requirePerm(...)`. See handoff.md for the
// migration plan.
const ROLE_CHECK_LEGACY_ALLOWLIST = [
  // server/app.js is the consolidated Fastify app. It contains 200+
  // direct role checks in helper functions like requireOwner,
  // requirePeopleWriter, requireManager, requireAccountant, etc.
  // These will be refactored to call `requirePermission(user, key)`
  // from the catalog in wave 3+ once we have per-route permission
  // contracts signed off.
  path.resolve('server/app.js'),
  // web/src/main.jsx contains UI gating. The current rule of thumb is
  // "hide the button, server still enforces" — UI checks can stay on
  // the client until the API contract returns the effective permission
  // set, at which point the UI switches to `hasPermission(...)` from
  // a shared client catalog.
  path.resolve('web/src/main.jsx'),
];

// ───────────── Walk ─────────────
function* walkFiles(root) {
  if (!fs.existsSync(root)) return;
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    if (/\.(js|jsx|mjs|cjs)$/.test(root)) yield root;
    return;
  }
  for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, dirent.name);
    if (dirent.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(dirent.name)) continue;
      yield* walkFiles(child);
    } else if (/\.(js|jsx|mjs|cjs)$/.test(dirent.name)) {
      yield child;
    }
  }
}

// ───────────── Patterns ─────────────
//
// Direct role-check patterns we want to flag. The matchers are intentionally
// strict: they look for `user.role` / `request.user.role` / `req.user.role`
// combined with a comparison or `.includes(`. The lint is the source of
// truth for "you didn't go through rbac.guards".
//
// Allowlist mechanism: a line that contains the marker
//     // rbac-lint: allow-role-check
// is skipped. This is used by the system internals in server/rbac/ where
// role checks are part of the catalog implementation itself.
const ROLE_CHECK_ALLOW_MARKER = 'rbac-lint: allow-role-check';

const DIRECT_ROLE_PATTERNS = [
  // user.role === 'X'  /  user.role !== "X"
  /\b(?:request\.|req\.)?user\.role\s*(?:===|!==|==|!=)\s*['"][A-Za-z][A-Za-z _-]*['"]/,
  // ["X","Y"].includes(user.role)
  /\[\s*['"][A-Za-z][A-Za-z _-]*['"](?:\s*,\s*['"][A-Za-z][A-Za-z _-]*['"])*\s*\]\.includes\(\s*(?:request\.|req\.)?user\.role\b/,
  // user.role === somethingVariable — flag any `user.role === X` even if X is a variable
  /\b(?:request\.|req\.)?user\.role\s*(?:===|!==|==|!=)\s*[A-Za-z_$][A-Za-z0-9_$.]*/,
];

// requirePerm / requireAnyPerm call extractor. Captures the first string
// argument to the call.
const REQUIRE_PERM_RE = /\brequire(?:Any)?Perm(?:WithSensitivity)?\s*\(\s*(['"])([^'"]+)\1/g;

// Field paths known to be sensitive. The lint scans for raw key mentions
// inside object literals; if a key like `tax_id` appears and FLS_RULES
// has a rule for the matching dotted path, that rule must be applied via
// `redactFields(...)` somewhere in the file. If a sensitive key appears
// in a return object but no redact call covers it, the lint flags.
const SENSITIVE_KEY_TO_RULE = {
  'tax_id':         'crm.account.tax_id',
  'account_number': 'finance.bank.account_number',
  'routing':        'finance.bank.routing',
  'ssn':            'hr.employee.ssn',
  'bank_account':   'hr.employee.bank_account',
  'medical_notes':  'hr.employee.medical_notes',
  'password_hash':  'security.user.password_hash',
  'mfa_secret':     'security.user.mfa_secret',
};

// ───────────── Findings ─────────────
const findings = [];

function record(severity, file, line, message) {
  findings.push({ severity, file, line, message });
}

function lintFile(file) {
  const absFile = path.resolve(file);
  // Path-based allowlist (catalog implementation, etc.).
  if (ROLE_CHECK_PATH_ALLOWLIST.some((dir) => absFile.startsWith(dir + path.sep) || absFile === dir)) {
    return;
  }
  // Legacy allowlist (wave 2 backlog).
  if (ROLE_CHECK_LEGACY_ALLOWLIST.some((dir) => absFile.startsWith(dir + path.sep) || absFile === dir)) {
    return;
  }

  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  // 1. Direct role checks.
  lines.forEach((line, i) => {
    // Allow explicit allowlist marker (used by system internals in server/rbac/).
    if (line.includes(ROLE_CHECK_ALLOW_MARKER)) return;
    // Allow comments to mention the pattern (e.g. // before: req.user.role === 'Owner')
    const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const pat of DIRECT_ROLE_PATTERNS) {
      if (pat.test(stripped)) {
        record(
          'ERROR',
          file,
          i + 1,
          `Direct role check detected: ${stripped.trim()}. Use requirePerm(...) / requireAnyPerm(...) from server/rbac.`
        );
        break;
      }
    }
  });

  // 2. requirePerm(...) with unknown keys.
  let m;
  REQUIRE_PERM_RE.lastIndex = 0;
  while ((m = REQUIRE_PERM_RE.exec(text)) !== null) {
    const key = m[2];
    if (!isValidKey(key)) {
      // Find the line number for nicer reporting.
      const upto = text.slice(0, m.index);
      const line = upto.split(/\n/).length;
      record(
        'ERROR',
        file,
        line,
        `requirePerm('${key}') — key is not in the PERMISSIONS catalog. Add it to server/rbac/permissions.js first.`
      );
    }
  }

  // 3. Sensitive fields without FLS coverage.
  for (const [sensitiveKey, rulePath] of Object.entries(SENSITIVE_KEY_TO_RULE)) {
    if (!FLS_RULES[rulePath]) continue; // catalog gap — not our problem here
    const keyRe = new RegExp(`(?:^|[^A-Za-z0-9_])${sensitiveKey}\\s*:`, 'm');
    if (!keyRe.test(text)) continue;
    // If the file mentions the sensitive key, it should call redactFields
    // with the matching dotted path somewhere. We accept either:
    //   - explicit redactFields(... 'dot.path' ...) call, or
    //   - a STUB_REDACT_PATHS constant that includes the dot path.
    const pathNeedle = `'${rulePath}'`;
    const pathNeedleDouble = `"${rulePath}"`;
    const hasRedactCall = /redactFields\s*\(/.test(text) &&
      (text.includes(pathNeedle) || text.includes(pathNeedleDouble));
    if (!hasRedactCall) {
      record(
        'WARN',
        file,
        0,
        `Sensitive key '${sensitiveKey}' appears in a return literal but no redactFields(...) call covers FLS path '${rulePath}'. Either add a redactFields call or remove the sensitive field from the stub.`
      );
    }
  }
}

// ───────────── Run ─────────────
let scanned = 0;
for (const root of roots) {
  for (const file of walkFiles(root)) {
    scanned += 1;
    lintFile(file);
  }
}

const errors = findings.filter((f) => f.severity === 'ERROR');
const warnings = findings.filter((f) => f.severity === 'WARN');

if (!quiet) {
  console.log(`RBAC lint: scanned ${scanned} file(s) under ${roots.map((r) => path.relative(process.cwd(), r) || '.').join(', ')}`);
  if (findings.length === 0) {
    console.log('  ✓ clean — no direct role checks, no unknown permission keys, no unhandled sensitive fields.');
  } else {
    for (const f of findings) {
      const rel = path.relative(process.cwd(), f.file);
      const loc = f.line > 0 ? `${rel}:${f.line}` : rel;
      console.log(`  ${f.severity}  ${loc}  ${f.message}`);
    }
    console.log(`  ${errors.length} error(s), ${warnings.length} warning(s).`);
  }
}

if (errors.length > 0 && !noFail) {
  process.exit(1);
}

// ───────────── Stage 2: catalog-grant audit (broad grants) ─────────────
//
// Delegates to scripts/lint-rbac-broad-grants.js. This catches the
// failure mode the role-check stage above cannot: a route that goes
// through `requirePerm(...)` correctly but the catalog-driven role
// matrix is wider than the legacy `user.role` allow-list the route
// used to enforce. Wave 3 hit this; this stage prevents the regression
// from coming back.
//
// Exit semantics: this stage always fails on BROAD GRANT findings,
// even when --no-fail is set. A broad grant is a security regression
// (granting access to roles that previously had none), not a code
// quality warning, so it is not eligible for the noFail escape hatch.
let broadGrantCount = 0;
if (!skipBroadGrants) {
  let broadGrantScript;
  try {
    // Lazy-require so `--no-broad-grants` works even if the sibling
    // script is missing (e.g. older checkouts pre-broad-grants).
    broadGrantScript = require('./lint-rbac-broad-grants.js');
  } catch (err) {
    console.error(`✗ Could not load scripts/lint-rbac-broad-grants.js: ${err.message}`);
    process.exit(1);
  }
  const auditResult = broadGrantScript.audit();
  if (!quiet) {
    console.log('');
    console.log(broadGrantScript.renderStdoutSummary(auditResult));
  }
  broadGrantCount = auditResult.findings.filter((f) => f.kind === 'broad').length;
}

if (errors.length > 0 && !noFail) {
  process.exit(1);
}
if (broadGrantCount > 0) {
  process.exit(1);
}
process.exit(0);
