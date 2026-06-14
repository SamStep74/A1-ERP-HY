#!/usr/bin/env node
// scripts/snapshot-catalog-grant-audit.js
//
// Regenerate the lock-in snapshot for the catalog-grant audit.
//
// Usage:
//   node scripts/snapshot-catalog-grant-audit.js
//   node scripts/snapshot-catalog-grant-audit.js --output=path/to/file.json
//
// The snapshot is the source of truth for the test/rbac-broad-grants.test.js
// lock-in test. Refresh it only when an intentional catalog change moves
// findings between sections (e.g. a new perm key is added to the catalog
// and a previously-unknown route moves from 'unknown-key' to 'pass').
//
// The script prints a summary so a reviewer can sanity-check the diff
// before committing the refreshed snapshot.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { audit } = require('./lint-rbac-broad-grants.js');

const args = process.argv.slice(2);
const flag = (name) => {
  const m = args.find((a) => a.startsWith(`--${name}=`));
  return m ? m.slice(name.length + 3) : null;
};

const repoRoot = path.resolve(__dirname, '..');
const outputPath = flag('output') || path.join(repoRoot, 'test/fixtures/catalog-grant-audit-snapshot.json');

const result = audit();
const snapshot = {
  version: 1,
  capturedAt: 'LOCKED',
  note:
    'Lock-in snapshot for scripts/lint-rbac-broad-grants.js. ' +
    'Refresh with: node scripts/snapshot-catalog-grant-audit.js',
  counts: {
    pass: result.findings.filter((f) => f.kind === 'pass').length,
    broad: result.findings.filter((f) => f.kind === 'broad').length,
    'no-legacy': result.findings.filter((f) => f.kind === 'no-legacy').length,
    'unknown-key': result.findings.filter((f) => f.kind === 'unknown-key').length,
    total: result.findings.length,
  },
  findings: result.findings,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));

console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
console.log(`Counts: ${JSON.stringify(snapshot.counts)}`);
console.log('');
console.log('To verify the diff is intentional, run:');
console.log('  node scripts/lint-rbac-broad-grants.js');
console.log('  node --test test/rbac-broad-grants.test.js');
