#!/usr/bin/env node
// scripts/run-tests.js
//
// Test runner wrapper. Runs the RBAC lint first (enforces catalog-driven
// authorization on the migrated route code), then delegates to `node --test`
// for the actual unit + integration suites.
//
// Why a wrapper: npm `test` should be a single command. The lint catches
// regressions in the migration; the unit tests cover behavior. Either
// failing fails the overall run.

'use strict';

const { spawnSync } = require('node:child_process');

function run(label, cmd, args) {
  const t0 = Date.now();
  const res = spawnSync(cmd, args, { stdio: 'inherit' });
  const ms = Date.now() - t0;
  if (res.status !== 0) {
    console.error(`\n✗ ${label} failed (${ms}ms, exit ${res.status})`);
    process.exit(res.status || 1);
  }
  console.log(`\n✓ ${label} passed (${ms}ms)`);
}

run('RBAC lint', process.execPath, [require('path').resolve(__dirname, 'lint-rbac.js')]);
run('Unit + integration tests', process.execPath, [
  '--test', '--test-concurrency=4', '--test-timeout=60000',
]);
