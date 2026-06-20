#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testFiles = [
  "test/rbac.test.js",
  "test/open-endpoints-rbac.test.js",
  "test/finance-rbac.test.js",
  "test/rbac-broad-grants.test.js",
  "test/auditor-readonly-coverage.test.js",
];
const expectedTestCount = 71;
const requiredTitles = [
  "finance RBAC: a read-only Auditor cannot post to the ledger (403 on all 4 write endpoints)",
  "finance RBAC: an Accountant (finance operator) can still post to the ledger (200)",
  "auditor-readonly: the read-only Auditor is denied (403) on every core-domain write",
  "auditor-readonly: the same Auditor CAN still read (sanity — it is read-only, not locked out)",
  "open endpoints: a non-privileged Support agent can open a service case (200, not 403)",
  "open endpoints: a Salesperson can file a privacy request (200, not 403)",
  "open endpoints: an Operator can ask a legal question (not 403)",
  "audit output matches the lock-in snapshot",
  "audit exit code is 0 when no BROAD GRANT findings are present",
  "rolesWithPermission: system.tenant.create is Owner-only (Owner escape hatch)",
  "narrow: requireFinanceOperator → finance.journal.create ⊆ [Owner, Admin, Accountant]",
  "Permission catalog",
  "Role matrix",
  "Permission resolution",
  "Seed installer (in-memory SQLite)",
];

function validateTapReport(reportPath) {
  if (!existsSync(reportPath)) return "missing Node TAP report";
  const tap = readFileSync(reportPath, "utf8");
  if (!tap.includes(`1..${expectedTestCount}`)) {
    return `missing TAP plan 1..${expectedTestCount}`;
  }
  if (/^not ok\s+\d+/m.test(tap)) return "TAP report contains failing tests";
  if (/^ok\s+\d+\s+-\s+.+#\s*(SKIP|TODO)\b/im.test(tap)) {
    return "TAP report contains skipped or TODO tests";
  }
  const okTitles = Array.from(tap.matchAll(/^ok\s+\d+\s+-\s+(.+)$/gm), (match) => match[1].trim());
  if (okTitles.length !== expectedTestCount) {
    return `expected ${expectedTestCount} passing tests, got ${okTitles.length}`;
  }
  const titleSet = new Set(okTitles);
  for (const title of requiredTitles) {
    if (!titleSet.has(title)) return `missing expected test title: ${title}`;
  }
  return "";
}

function testEnv(env) {
  return {
    CI: "1",
    NODE_ENV: "test",
    DOTENV_CONFIG_PATH: path.join(repoRoot, ".env.disabled"),
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    PATH: env.PATH || "",
    TMPDIR: env.TMPDIR || "",
    TMP: env.TMP || "",
    TEMP: env.TEMP || "",
    SystemRoot: env.SystemRoot || "",
    ComSpec: env.ComSpec || "",
    PATHEXT: env.PATHEXT || "",
  };
}

function createEvalRoot() {
  const evalRoot = mkdtempSync(path.join(os.tmpdir(), "a1-erp-hy-rbac-"));
  for (const entry of ["server", "scripts", "test", "docs", "package.json"]) {
    cpSync(path.join(repoRoot, entry), path.join(evalRoot, entry), { recursive: true });
  }
  const nodeModules = path.join(repoRoot, "node_modules");
  if (existsSync(nodeModules)) {
    symlinkSync(nodeModules, path.join(evalRoot, "node_modules"), "dir");
  }
  return evalRoot;
}

let evalRoot = "";
let result = { status: 1, stdout: "", stderr: "", error: null };
let reportError = "";
try {
  evalRoot = createEvalRoot();
  const reportPath = path.join(evalRoot, "rbac-contract-report.tap");
  result = spawnSync(process.execPath, [
    "--test",
    "--test-concurrency=4",
    "--test-timeout=60000",
    "--test-reporter=tap",
    `--test-reporter-destination=${reportPath}`,
    ...testFiles,
  ], {
    cwd: evalRoot,
    encoding: "utf8",
    env: testEnv(process.env),
    shell: false,
  });
  reportError = validateTapReport(reportPath);
} catch (error) {
  reportError = error && error.message ? error.message : String(error);
} finally {
  if (evalRoot) rmSync(evalRoot, { recursive: true, force: true });
}

const failed = result.error || result.status !== 0 || reportError;
console.log(`failing_checks=${failed ? 1 : 0}`);

if (reportError) console.error(`report_validation_error=${reportError}`);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error.message);

process.exitCode = failed ? 1 : 0;
