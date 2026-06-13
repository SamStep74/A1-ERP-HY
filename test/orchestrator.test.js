'use strict';

// Tests for the dmux-style orchestration scaffolding.
//
// Coverage targets:
//   - validatePlan: rejects every malformed plan shape
//   - parseArgs:    handles --dry-run, --execute, --no-tmux, --help
//   - createWorktree: idempotent (re-running returns same path)
//   - overlaySeedPaths: copies files, silently skips missing sources
//   - writeWorkerFiles: writes task.md; preserves existing handoff/status
//   - executePlan: --dry-run and --no-tmux short-circuit destructive ops
//
// The I/O functions are tested against the real repo, but each test
// uses a unique branch / session name and cleans up after itself so
// repeated runs (CI, local dev) remain green.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const orch = require('../scripts/tmux-worktree-orchestrator');
const { validatePlan, parseArgs, executePlan } = require('../scripts/orchestrate-worktrees');

// ───── validatePlan ─────

test('validatePlan: accepts a minimal valid plan', () => {
  const plan = {
    sessionName: 's1',
    workers: [{ name: 'w1', task: 'do the thing' }],
  };
  assert.doesNotThrow(() => validatePlan(plan));
});

test('validatePlan: rejects non-object input', () => {
  assert.throws(() => validatePlan(null), /plan must be a JSON object/);
  assert.throws(() => validatePlan('hello'), /plan must be a JSON object/);
  assert.throws(() => validatePlan(42), /plan must be a JSON object/);
});

test('validatePlan: rejects missing sessionName', () => {
  const plan = { workers: [{ name: 'w1', task: 'x' }] };
  assert.throws(() => validatePlan(plan), /sessionName is required/);
});

test('validatePlan: rejects non-string sessionName', () => {
  const plan = { sessionName: 42, workers: [{ name: 'w1', task: 'x' }] };
  assert.throws(() => validatePlan(plan), /sessionName is required/);
});

test('validatePlan: rejects empty workers array', () => {
  const plan = { sessionName: 's1', workers: [] };
  assert.throws(() => validatePlan(plan), /workers must be a non-empty array/);
});

test('validatePlan: rejects missing worker.name', () => {
  const plan = { sessionName: 's1', workers: [{ task: 'x' }] };
  assert.throws(() => validatePlan(plan), /each worker must have a \.name/);
});

test('validatePlan: rejects non-string worker.task', () => {
  const plan = { sessionName: 's1', workers: [{ name: 'w1', task: 42 }] };
  assert.throws(() => validatePlan(plan), /\.task must be a non-empty string/);
});

test('validatePlan: rejects empty worker.task', () => {
  const plan = { sessionName: 's1', workers: [{ name: 'w1', task: '' }] };
  assert.throws(() => validatePlan(plan), /\.task must be a non-empty string/);
});

test('validatePlan: rejects duplicate worker names', () => {
  const plan = {
    sessionName: 's1',
    workers: [
      { name: 'w1', task: 'a' },
      { name: 'w1', task: 'b' },
    ],
  };
  assert.throws(() => validatePlan(plan), /duplicate worker name: w1/);
});

test('validatePlan: accepts a valid baseRef', () => {
  const plan = {
    sessionName: 's1',
    baseRef: 'main',
    workers: [{ name: 'w1', task: 'x' }],
  };
  assert.doesNotThrow(() => validatePlan(plan));
});

test('validatePlan: rejects a malformed baseRef', () => {
  const plan = {
    sessionName: 's1',
    baseRef: 'evil;rm -rf /',
    workers: [{ name: 'w1', task: 'x' }],
  };
  assert.throws(() => validatePlan(plan), /plan\.baseRef must be a git ref/);
});

test('validatePlan: rejects non-string baseRef', () => {
  const plan = {
    sessionName: 's1',
    baseRef: 42,
    workers: [{ name: 'w1', task: 'x' }],
  };
  assert.throws(() => validatePlan(plan), /plan\.baseRef must be a git ref/);
});

test('validatePlan: rejects non-object workers', () => {
  const plan = { sessionName: 's1', workers: ['not-an-object'] };
  assert.throws(() => validatePlan(plan), /each worker must be an object/);
});

// ───── parseArgs ─────

test('parseArgs: defaults to execute mode (dryRun=false), tmux on', () => {
  const opts = parseArgs(['plan.json']);
  assert.equal(opts.dryRun, false);
  assert.equal(opts.noTmux, false);
  assert.equal(opts.planPath, 'plan.json');
});

test('parseArgs: --dry-run sets dryRun=true', () => {
  const opts = parseArgs(['plan.json', '--dry-run']);
  assert.equal(opts.dryRun, true);
  assert.equal(opts.noTmux, false);
});

test('parseArgs: --execute overrides --dry-run', () => {
  const opts = parseArgs(['plan.json', '--dry-run', '--execute']);
  assert.equal(opts.dryRun, false);
});

test('parseArgs: --no-tmux sets noTmux=true', () => {
  const opts = parseArgs(['plan.json', '--no-tmux']);
  assert.equal(opts.noTmux, true);
});

test('parseArgs: combines --dry-run and --no-tmux', () => {
  const opts = parseArgs(['plan.json', '--dry-run', '--no-tmux']);
  assert.equal(opts.dryRun, true);
  assert.equal(opts.noTmux, true);
});

// ───── createWorktree (integration; cleans up after itself) ─────

function uniqueBranchName(prefix) {
  return `${prefix}-${Date.now()}-${process.pid}-${Math.floor(Math.random() * 1e6)}`;
}

function cleanupWorktree(branchName) {
  const wtPath = path.join(orch.WORKTREES_DIR, branchName);
  try {
    execFileSync('git', ['worktree', 'remove', '--force', wtPath], { cwd: orch.REPO_ROOT, stdio: 'ignore' });
  } catch (_) { /* already gone */ }
  try {
    execFileSync('git', ['branch', '-D', branchName], { cwd: orch.REPO_ROOT, stdio: 'ignore' });
  } catch (_) { /* already gone */ }
  try { fs.rmSync(wtPath, { recursive: true, force: true }); } catch (_) { /* */ }
}

test('createWorktree: creates a new worktree and returns its path', () => {
  const branch = uniqueBranchName('orch-test');
  try {
    const wtPath = orch.createWorktree(branch, 'HEAD');
    assert.equal(wtPath, path.join(orch.WORKTREES_DIR, branch));
    assert.ok(fs.existsSync(wtPath), 'worktree directory should exist');
    assert.ok(fs.existsSync(path.join(wtPath, '.git')), 'worktree should have a .git file/link');
  } finally {
    cleanupWorktree(branch);
  }
});

test('createWorktree: is idempotent — second call returns the same path', () => {
  const branch = uniqueBranchName('orch-test');
  try {
    const first = orch.createWorktree(branch, 'HEAD');
    const second = orch.createWorktree(branch, 'HEAD');
    assert.equal(first, second);
  } finally {
    cleanupWorktree(branch);
  }
});

// ───── overlaySeedPaths ─────

test('overlaySeedPaths: copies a real file from the repo into a target dir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-overlay-'));
  try {
    orch.overlaySeedPaths(tmp, ['package.json']);
    const dst = path.join(tmp, 'package.json');
    assert.ok(fs.existsSync(dst), 'seed file should be copied to dst');
    const src = JSON.parse(fs.readFileSync(path.join(orch.REPO_ROOT, 'package.json'), 'utf8'));
    const copied = JSON.parse(fs.readFileSync(dst, 'utf8'));
    assert.equal(copied.name, src.name);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('overlaySeedPaths: silently skips missing source paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-overlay-'));
  try {
    // Should not throw even though the path doesn't exist in REPO_ROOT.
    assert.doesNotThrow(() => orch.overlaySeedPaths(tmp, ['does/not/exist.md', 'also/missing.txt']));
    assert.deepEqual(fs.readdirSync(tmp), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('overlaySeedPaths: handles an empty seedPaths list', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-overlay-'));
  try {
    assert.doesNotThrow(() => orch.overlaySeedPaths(tmp, []));
    assert.deepEqual(fs.readdirSync(tmp), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ───── writeWorkerFiles ─────

test('writeWorkerFiles: writes task.md, handoff.md, status.md; returns paths', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-write-'));
  try {
    // writeWorkerFiles uses ORCH_DIR (not the worktree), so just need a name.
    // The worktree path arg is only used as a return value marker; it does
    // not need to exist for this test.
    const { taskPath, handoffPath, statusPath } = orch.writeWorkerFiles(
      tmp, 'orch-test-session', 'unit-write', 'do something useful'
    );
    assert.ok(fs.existsSync(taskPath));
    assert.ok(fs.existsSync(handoffPath));
    assert.ok(fs.existsSync(statusPath));
    const taskBody = fs.readFileSync(taskPath, 'utf8');
    assert.match(taskBody, /do something useful/);
  } finally {
    fs.rmSync(path.join(orch.ORCH_DIR, 'orch-test-session'), { recursive: true, force: true });
  }
});

test('writeWorkerFiles: overwrites task.md but preserves existing handoff.md', () => {
  // Use a fresh session name to avoid colliding with other tests.
  const session = `orch-test-preserve-${Date.now()}-${process.pid}`;
  const worker = 'w1';
  const dir = path.join(orch.ORCH_DIR, session, worker);
  try {
    // First call: seed all three.
    orch.writeWorkerFiles('/tmp/dummy', session, worker, 'first task');
    // Manually edit handoff.md to a known sentinel.
    const handoffPath = path.join(dir, 'handoff.md');
    fs.writeFileSync(handoffPath, 'PRESERVED-CONTENT');
    // Second call with a different task — handoff should not be touched.
    orch.writeWorkerFiles('/tmp/dummy', session, worker, 'second task');
    assert.equal(fs.readFileSync(handoffPath, 'utf8'), 'PRESERVED-CONTENT');
    // task.md should reflect the new task.
    assert.match(fs.readFileSync(path.join(dir, 'task.md'), 'utf8'), /second task/);
  } finally {
    fs.rmSync(path.join(orch.ORCH_DIR, session), { recursive: true, force: true });
  }
});

// ───── executePlan (dry-run + --no-tmux paths) ─────

test('executePlan --dry-run: returns a plan summary, no filesystem writes', () => {
  const plan = {
    sessionName: 'orch-dry-run-test',
    workers: [{ name: 'wA', task: 'do A' }, { name: 'wB', task: 'do B' }],
  };
  const summary = executePlan(plan, { dryRun: true, noTmux: false });
  assert.equal(summary.sessionName, 'orch-dry-run-test');
  assert.equal(summary.workers.length, 2);
  for (const w of summary.workers) {
    assert.equal(w.dryRun, true);
    assert.match(w.worktree, /w[AB]$/);
  }
  // Confirm nothing was actually written to the orchestration dir.
  const sessionDir = path.join(orch.ORCH_DIR, 'orch-dry-run-test');
  assert.ok(!fs.existsSync(sessionDir), 'dry-run must not create files');
});

test('executePlan --no-tmux: creates worktree + files, no tmux launched', () => {
  const session = `orch-notmux-${Date.now()}-${process.pid}`;
  const branch = `orch-notmux-branch-${Date.now()}-${process.pid}`;
  const plan = {
    sessionName: session,
    workers: [{ name: branch, task: 'work without tmux' }],
  };
  try {
    const summary = executePlan(plan, { dryRun: false, noTmux: true });
    assert.equal(summary.workers.length, 1);
    const w = summary.workers[0];
    assert.ok(w.worktree && fs.existsSync(w.worktree), 'worktree should exist');
    assert.ok(w.files && fs.existsSync(w.files.taskPath), 'task.md should exist');
    assert.equal(w.tmux, null, '--no-tmux must skip tmux');
  } finally {
    cleanupWorktree(branch);
    fs.rmSync(path.join(orch.ORCH_DIR, session), { recursive: true, force: true });
  }
});
