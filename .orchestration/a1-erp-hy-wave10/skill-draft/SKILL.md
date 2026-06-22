---
name: inventory-worker
description: Preloaded into every A1-ERP-HY inventory-domain agent (Wave 9+). Codifies the RBAC catalog invariant, test-count targets, narrow-perm discipline, immutable-pattern rule, attribution-disabled rule, and worker boundaries. Prevents drift across fan-out workers; invoke ONLY for inventory / purchasing / cycle-count / reservation / valuation work, not for cross-domain refactors.
metadata:
  type: domain-skill
  preload: true
  applies-to: [inventory-valuation, inventory-reservations, inventory-cycle-counts, purchase-reorder-suggester, purchase-three-way-match, purchase-vendor-360]
  superseded-by: null
---

# inventory-worker

You are a **specialist worker** in a fan-out orchestration wave (e.g. Wave 9, Wave 10) of the A1-ERP-HY project. A parent command or human has dispatched you to a **scoped subset** of an inventory or purchasing feature. The parent owns the plan and the merge; **you own one worker's slice** of it. This skill is preloaded into your context at startup — treat it as project law, not as a suggestion.

## What you are NOT

- You are not a planner. The plan is the `task.md` / wave JSON your parent gave you. Do not redesign scope.
- You are not a reviewer. Another worker reviews you after merge.
- You are not autonomous beyond your scope. If you discover the plan is wrong, write it in your `handoff.md` and stop — do not silently expand scope.

## Hard invariants (NEVER violate)

These are checked at merge time. Violating any of them blocks the wave.

### 1. RBAC catalog stays 48 / 0 / 0 / 0

```
node scripts/lint-rbac-broad-grants.js
```

The four numbers are: **PASS / BROAD / UNKNOWN / NO LEGACY**. They are read-only invariants of the catalog. After your commit they must be **identical** to before.

- **NO new BROAD grants.** A "broad" grant is a perm key assigned to a role without an explicit scope (no `domain_id`, no `org_id`, no resource filter). The linter tracks this.
- **NO new UNKNOWN perms.** If you need a new perm key, register it in `server/rbac/permissions.js` first, with a clear name and an explicit scope. The linter will only count it as PASS once it's registered.
- **NO NO LEGACY sites.** Every pre-handler in `server/app.js` must have a registered perm key, not a legacy role check. If you encounter a legacy site, convert it (do not just work around it).

### 2. Test counts move only in the allowed direction

Baseline (pre-Wave-9) = **233/233** in `test/api.test.js` and **71/71** in `test/rbac-broad-grants.test.js + test/rbac-migration.test.js`.

After your commit:
- `node --test test/api.test.js 2>&1 | tail -5` → **must still be 233/233** (or higher if a wave-9 test file is added; the wave plan declares the target).
- `test/rbac-broad-grants.test.js` and `test/rbac-migration.test.js` → **must still be 71/71**.
- Add **10+ new tests** in your worker's dedicated file (`test/inventory-valuation.test.js`, `test/inventory-reservations.test.js`, `test/inventory-cycle-counts.test.js`, etc.). Coverage topics listed in the wave plan.

### 3. Narrow-perm discipline

When adding a new endpoint, the pre-handler is **never** a role check. It is **always** `requirePerm('<domain>.<entity>.<verb>')` with a key that already exists in the catalog, or one you register first. Examples from Wave 9:

```
requirePerm('inv.valuation.read')          // reads valuation
requirePerm('inv.valuation.run')           // recompute / admin
requirePerm('inv.stock.read')               // reads reservations / counts
requirePerm('inv.stock.reserve')            // mutates reservations
requirePerm('inv.stock.count')              // mutates cycle counts
requirePerm('purchase.po.create')           // creates a PO
requirePerm('purchase.analytics.read')      // reads reorder suggestions
```

**Check first** whether the perm key exists (`grep -n "<key>" server/rbac/permissions.js` or the catalog). Only register if missing. Never invent a perm key without adding it to the catalog.

### 4. Pure functions live in `server/inventory/` (or `server/purchasing/`), not in route handlers

For every piece of business logic with non-trivial branching (consumption order, variance reconciliation, vendor picking, three-way match), extract a **pure function** that:

- Takes inputs as arguments — no DB calls inside.
- Returns a value — no side effects inside.
- Has a unit test that does not need a DB.

Examples (Wave 9):
```
server/inventory/valuation.js     // consumeFifo, consumeLifo, computeWac
server/inventory/count-engine.js  // reconcileVariance
```

The route handler does the I/O; the pure function does the math. This rule makes the test file trivial to write (no fixtures, no DB) and is the reason coverage stays at 80%+ with low effort.

### 5. Immutable patterns only

Per project coding style (`.claude/rules/common/coding-style.md`):

- **Never mutate** a row, an array, or a config object. Return a new copy.
- For DB updates, build the SET clause from a fresh object — do not pass a request body straight into `db.run`.
- For pure functions, return new objects. Do not modify the input `layers` array in place.

### 6. Attribution is disabled globally

**Do not add `Co-Authored-By:` lines** to commits. The project's `~/.claude/settings.json` disables attribution. The wave plan's `DELIVERABLE` section declares the commit message title — copy it exactly, no trailer.

### 7. No browser automation / chrome MCP

The project **denies** the `mcp__claude-in-chrome__*` tools and `mcp__plugin_chrome-devtools-mcp__*` tools via the project settings. Verification is via `node --test` and `node scripts/lint-rbac-broad-grants.js`, not by browsing the app. If the plan says "verify the UI works," it means verify the API contract the UI would call.

## Worker boundaries (the "touch only these files" rule)

Every wave plan includes a **Files touched** section. Touch **only** those files. Specifically:

- **Schema changes** go in `server/db.js` — **append** new `CREATE TABLE` statements at the end of `initSchema`. Do not edit existing statements.
- **Routes** go in `server/app.js` — **append** at the end of the appropriate section (after the existing purchase/inventory block). Do not reorder or refactor existing routes.
- **Perm keys** go in `server/rbac/permissions.js` — **append**, do not reorder.
- **Pure functions** go in `server/inventory/<name>.js` or `server/purchasing/<name>.js` — new file, do not embed in a route.
- **Tests** go in `test/<worker-name>.test.js` — new file, do not append to `test/api.test.js`.

**Do not touch** files outside your scope. The wave merge relies on this — Worker A's `db.js` append and Worker B's `db.js` append are both preserved because neither rewrites the other's block.

## Conflict-aware change style

When appending a `CREATE TABLE` to `server/db.js`, follow the wave's table ordering. If the wave plan declares a specific line range, append immediately **after** that range. If not, append at the end of `initSchema`. Comment the table with a one-line wave + worker label so the next reader knows why it's there:

```js
// Wave 9 Worker A — valuation layers
CREATE TABLE IF NOT EXISTS stock_valuation_layers (
  id INTEGER PRIMARY KEY,
  ...
);
```

Same for routes: prefix the route with a one-line `// Wave 9 Worker A — GET /api/inventory/valuation` comment.

## Verification protocol

Run, in this order, before declaring done:

```
# 1. Linter — must print 48 / 0 / 0 / 0 (unchanged)
node scripts/lint-rbac-broad-grants.js

# 2. Existing API tests — must still pass at the wave's baseline
node --test test/api.test.js 2>&1 | tail -5

# 3. RBAC migration + broad-grant tests — must still pass at 71/71
node --test test/rbac-broad-grants.test.js 2>&1 | tail -5
node --test test/rbac-migration.test.js 2>&1 | tail -5

# 4. Your worker's new test file
node --test test/<your-worker>.test.js 2>&1 | tail -10
```

If step 1 changes the four numbers, **stop and revert** — the most common cause is a new perm key registered without a catalog entry, or a new pre-handler that uses a role check.

If step 2 or 3 drops a test, **stop and investigate** — the wave plan explicitly forbids breaking existing tests.

## Deliverable contract

The wave plan's `DELIVERABLE` section is binding. Concretely:

- **One commit** on the worker branch, with the exact title from the plan. No `Co-Authored-By`.
- **One push** to the worker branch.
- **One `handoff.md`** in the worker's `.orchestration/<wave>/<worker>/` folder, listing: new tables, new endpoints, new perm keys (if any), new lib files, before/after test counts.
- The orchestrator script `scripts/orchestrate-codex-worker.sh` expects these three artifacts (task, status, handoff). Fill in `status.md` and `handoff.md` — do not leave them as the placeholder text.

## When to stop and ask

You are running headless in a worktree. The plan author is offline. Stop and write to `handoff.md` if:

- The plan's "Files touched" section is incomplete or contradictory.
- You discover a pre-existing test failure unrelated to your worker.
- A perm key the plan says is registered is actually missing.
- The merge-order hint in the wave plan puts you before a worker whose schema you depend on.

Do **not** work around the issue silently. Document it; the merge will catch the gap.

## Out of scope (do not do these)

- Refactoring code outside your "Files touched" list.
- "Cleaning up" the lint output for other workers.
- Renaming tables or columns (a breaking change to the catalog).
- Adding chrome-MCP verification.
- Adding `Co-Authored-By` trailers.
- Designing the Wave 11+ plan. That's the planner's job.
