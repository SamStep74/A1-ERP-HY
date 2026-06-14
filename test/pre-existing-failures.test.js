/**
 * Lock-in test for the 6 pre-existing api.test.js failures that were resolved
 * in Wave 4. These tests assert that the api.test.js suite still contains
 * (and passes) each of the 6 canary tests documented in
 * `docs/PROJECT_STATUS.md` § Pre-existing test failures. The canaries are:
 *
 *   TAP #8   — dashboard launcher source wiring covers every seeded login role app
 *   TAP #23  — integration connector rejects malformed path keys before mutation
 *   TAP #130 — customer 360 joins CRM, finance, service, automation, and legal sources
 *   TAP #168 — failed webhook delivery can be retried manually
 *   TAP #182 — service case mutations reject malformed metadata before persistence
 *   TAP #199 — workflow rule state and rollback reject malformed metadata before persistence
 *
 * If a future migration drops one of these names, the static test count
 * check will fail. The actual pass/fail assertion is verified by the
 * standard CI invocation of `node --test test/api.test.js` (which prints
 * a TAP summary that humans/CI can read); we deliberately do not spawn
 * the api.test.js file from this lock-in because node 22's test runner
 * refuses to nest (`node:test run() is being called recursively within a
 * test file. skipping running files.`) when a `node --test` process is
 * already active in the parent.
 */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const API_TEST_PATH = path.join(__dirname, "api.test.js");
// Wave 4 raised the api.test.js test count from 227 → 233 by resolving
// the 6 pre-existing failures. Future migrations must keep the count
// stable; a regression in any of the 6 canaries will surface as either
// a missing canary name (test 1 below) or a count delta (test 2 below).
const BASELINE_TEST_COUNT = 233;
const EXPECTED_CANARY_NAMES = Object.freeze([
  "dashboard launcher source wiring covers every seeded login role app",
  "integration connector rejects malformed path keys before mutation",
  "customer 360 joins CRM, finance, service, automation, and legal sources",
  "failed webhook delivery can be retried manually",
  "service case mutations reject malformed metadata before persistence",
  "workflow rule state and rollback reject malformed metadata before persistence"
]);

function readApiTestSource() {
  return fs.readFileSync(API_TEST_PATH, "utf8");
}

function findTestBodies(source, testName) {
  // Match `test("name", ...)` where the name appears in a string literal that
  // may be a double-quoted or single-quoted string. The match is anchored on
  // the test name itself; this deliberately ignores comments and unrelated
  // identifiers.
  const escaped = testName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `test\\(\\s*["']${escaped}["']\\s*,`,
    "g"
  );
  return source.match(re) || [];
}

function countTestInvocations(source) {
  // Count top-level `test("..." , ...)` invocations only. The pattern
  // ignores string-literal names, so a renamed test will not match if the
  // rename changes the test name. We also ignore `it(`, `describe(`, and
  // other helpers because the api.test.js suite is intentionally flat.
  const re = /\btest\s*\(\s*["'][^"']+["']/g;
  return (source.match(re) || []).length;
}

test("pre-existing failures: api.test.js still defines all 6 canary tests", () => {
  const source = readApiTestSource();
  const missing = EXPECTED_CANARY_NAMES.filter(name => findTestBodies(source, name).length === 0);
  assert.deepEqual(
    missing,
    [],
    `api.test.js is missing ${missing.length} canary test(s): ${missing.join(", ")}. ` +
      "These are the pre-existing failures resolved in Wave 4; do not remove or rename them."
  );
  // Each canary should be defined exactly once. Duplicates are a sign of an
  // accidental copy-paste during a migration.
  for (const name of EXPECTED_CANARY_NAMES) {
    const count = findTestBodies(source, name).length;
    assert.equal(count, 1, `Expected exactly one test("${name}") in api.test.js, found ${count}.`);
  }
});

test("pre-existing failures: api.test.js test count matches the 233 baseline", () => {
  // The Wave 4 fix raised the api.test.js test count from 227 to 233 by
  // resolving the 6 pre-existing failures. We assert the test() invocation
  // count (which is identical to the test runner's pass count when all
  // tests pass) to catch any future migration that silently drops a
  // canary test. The actual pass/fail assertion is verified externally by
  // the standard CI invocation of `node --test test/api.test.js`.
  const source = readApiTestSource();
  const testCount = countTestInvocations(source);
  assert.equal(
    testCount,
    BASELINE_TEST_COUNT,
    `api.test.js has ${testCount} top-level test() invocations, expected ${BASELINE_TEST_COUNT}. ` +
      "This usually means a canary test was dropped or renamed during a migration."
  );
});

test("pre-existing failures: server/app.js setNotFoundHandler is sanitizing", () => {
  // The 5 of 6 canaries that previously failed all shared a single root
  // cause: Fastify's default 404 handler echoed the request URL (which
  // contained the test's "secret" markers) into the JSON body. The fix
  // installs a custom `setNotFoundHandler` in `registerStatic()` that
  // returns `{ ok: false, error: "NOT_FOUND" }` for `/api/*` paths and
  // falls back to the SPA entry point for non-API deep-links. We assert
  // that the production code still installs this sanitizing handler so
  // a future refactor that regresses to Fastify's default 404 (which
  // leaks the URL) is caught here rather than as 5 mysterious canary
  // failures in api.test.js.
  const appSource = fs.readFileSync(path.join(__dirname, "..", "server", "app.js"), "utf8");
  assert.match(
    appSource,
    /setNotFoundHandler\(/,
    "server/app.js no longer calls setNotFoundHandler; the URL-leaking default 404 handler is back."
  );
  // The sanitizer must emit the `NOT_FOUND` sentinel — not the request URL.
  assert.match(
    appSource,
    /NOT_FOUND/,
    "server/app.js 404 handler no longer emits the NOT_FOUND sentinel; check for URL leaks."
  );
});
