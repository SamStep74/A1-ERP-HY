# Mapping the `inventory-worker` skill to Wave 9 + Wave 10

**Companion to** `SKILL.md` (in the same folder). This file is the
*wiring diagram* — it shows how the skill would be referenced by the
existing wave JSON, the worker task files, and a future wave. Nothing
here is merged; it's a draft for review.

---

## 1. Where the skill lives

Proposed path: **`.claude/skills/inventory-worker/SKILL.md`**

This matches the Claude-Code convention used by the
`shanraisshan/claude-code-best-practice` orchestration pattern:
`.claude/skills/<skill-name>/SKILL.md` with YAML frontmatter. The
`metadata: preload: true` flag in the frontmatter is the
"preloaded-into-agent" marker from that pattern.

**Status:** not yet installed. The skill is drafted in
`.orchestration/a1-erp-hy-wave10/skill-draft/SKILL.md` and would be
copied to `.claude/skills/inventory-worker/SKILL.md` once approved.

---

## 2. Preload mapping (Wave 9 + Wave 10)

The `applies-to` list in the skill's frontmatter names six workers.
For each, the wave JSON gets a new optional field
`"preloadSkills": ["inventory-worker"]`. The orchestrator script
(`scripts/orchestrate-codex-worker.sh`) would read it and inject the
skill's full content into the worker's launch context.

| Worker (wave) | Plan file | Preload? | Why |
|---|---|---|---|
| `inventory-valuation` (W9 A) | `wave9-plan.md` § A | yes | DB append, app.js append, valuation lib, **48/0/0/0 + 233/233 invariants apply** |
| `inventory-reservations` (W9 B) | `wave9-plan.md` § B | yes | DB append, app.js append + sales-order hook, **same invariants** |
| `inventory-cycle-counts` (W9 C) | `wave9-plan.md` § C | yes | DB append, app.js append, count-engine lib, **same invariants** |
| `purchase-reorder-suggester` (W10 A) | `wave10-plan.md` § A | yes | First non-inventory worker — uses the purchasing subset of the skill |
| `purchase-three-way-match` (W10 B) | `wave10-plan.md` § B | yes | Two new tables + possible ALTER; same verification protocol |
| `purchase-vendor-360` (W10 C) | `wave10-plan.md` § C | yes | Read-only, no schema; verification still requires 48/0/0/0 |

**Workers that should NOT preload it** (cross-domain or non-specialist):
the wave orchestrator itself, the planner that authors the wave JSON,
the merge-review agent, and any general-purpose agent. The
`description` field in the frontmatter is intentionally narrow so the
planner won't auto-attach it to the wrong worker.

---

## 3. What each worker can delete from its current task spec

Today, every worker task.md repeats the same five-line block
("Touch only these files…", "VERIFICATION: 1. lint 2. api.test
3. tests…", "DELIVERABLE: one commit, push, handoff.md"). With the
skill preloaded, the worker's `task.md` shrinks:

**Before (current Wave 9 worker task, ~3.6 KB / ~80 lines):**

```md
CONSTRAINTS:
- ... (5-6 bullets)
- Touch only: server/db.js, server/app.js, server/inventory/<x>.js, ...

VERIFICATION:
1. node scripts/lint-rbac-broad-grants.js — still 48/0/0/0
2. node --test test/api.test.js 2>&1 | tail -5 — 233/233
3. Add 10+ tests in test/<worker>.test.js covering: ...

DELIVERABLE: One commit titled "Wave 9: Phase 1 Inventory — ...". Push.
Write handoff.md listing the new tables, endpoints, and test counts.
```

**After (with skill preloaded, ~1.8 KB / ~40 lines):**

```md
# inventory-valuation

The inventory-worker skill is preloaded. Hard invariants (48/0/0/0,
233/233, narrow-perm discipline, immutable patterns, attribution
disabled, no chrome MCP) are project law — see SKILL.md.

## This worker's slice

SCOPE:
1. Add `stock_valuation_layers` table (db.js, append at end of
   initSchema) ... [schema spec]
2. On every INSERT into `stock_moves`, write a matching layer.
   Outbound consumption per the item's `valuation_method`
   (FIFO/LIFO/WAC). Server-authoritative unit_cost lookup.
3. Add `valuation_method` column to `catalog_items`, default 'WAC'.
4. Add `GET /api/inventory/valuation` (perm: inv.valuation.read) and
   `POST /api/inventory/valuation/recompute` (perm: inv.valuation.run).
5. Create `server/inventory/valuation.js` with `consumeFifo`,
   `consumeLifo`, `computeWac` (pure functions, no DB calls).

DO NOT TOUCH: stock_moves schema, stock_quants schema, sales_orders,
purchase_orders, any other worker's slice in this wave.

TESTS: 10+ in `test/inventory-valuation.test.js` (FIFO order, LIFO
order, WAC recompute, on-hand aggregation, recompute rebuild,
negative-stock prevention).

COMMIT TITLE: `Wave 9: Phase 1 Inventory — valuation engine (FIFO/LIFO/WAC)`
```

The skill absorbs the 30-line invariant block; the task spec keeps
only the worker-unique schema/routes/pure-function signatures.

---

## 4. Proposed Wave 10 JSON delta

The current `a1-erp-hy-wave10.json` follows the same shape as Wave 9
— `workers[].task` is a giant multi-paragraph string. With the skill
preloaded, each worker's `task` field can drop the same 30 lines and
keep the worker-specific scope.

**Proposed field addition** (top-level, before `workers[]`):

```json
{
  "sessionName": "a1-erp-hy-wave10",
  "baseRef": "origin/main",
  "launcherCommand": "bash {repo_root}/scripts/orchestrate-codex-worker.sh ...",
  "preloadSkills": ["inventory-worker"],
  "workers": [
    { "name": "purchase-reorder-suggester", "task": "..." },
    { "name": "purchase-three-way-match",   "task": "..." },
    { "name": "purchase-vendor-360",        "task": "..." }
  ]
}
```

The `orchestrate-codex-worker.sh` script would read `preloadSkills`
and concatenate the corresponding SKILL.md files into the worker's
launch prompt, after the worker-specific `task` string. This is the
mechanism that turns the skill from "documentation in a file" into
"context injected at worker startup."

---

## 5. What the orchestrator script needs to change

A small diff in `scripts/orchestrate-codex-worker.sh`:

```diff
- # build worker prompt from task file
- WORKER_PROMPT="$(cat "$TASK_FILE")"
+ # build worker prompt: preloaded skills first, then worker task
+ SKILLS=""
+ for s in $PRELOAD_SKILLS; do
+   SKILL_PATH=".claude/skills/$s/SKILL.md"
+   if [ -f "$SKILL_PATH" ]; then
+     SKILLS="$SKILLS$(cat "$SKILL_PATH")"$'\n\n'
+   else
+     echo "warn: preload skill not found: $SKILL_PATH" >&2
+   fi
+ done
+ WORKER_PROMPT="$SKILLS$(cat "$TASK_FILE")"
```

This is the **only code change** needed to make the skill actually
preload. The wave JSON change above is the only data change. No
changes to the worker task files are required to start — they keep
working as-is, the skill just becomes redundant context for them.

---

## 6. Rollout plan (3 steps, each independently reversible)

1. **Install the skill** — copy `SKILL.md` from
   `.orchestration/a1-erp-hy-wave10/skill-draft/SKILL.md` to
   `.claude/skills/inventory-worker/SKILL.md`. No other files change.
   Result: skill exists but isn't referenced by any wave yet.

2. **Wire the orchestrator** — add the `for s in $PRELOAD_SKILLS` loop
   to `orchestrate-codex-worker.sh`. Empty `PRELOAD_SKILLS` keeps the
   old behavior. No wave JSON changes yet.

3. **Reference the skill from Wave 10** — add
   `"preloadSkills": ["inventory-worker"]` to
   `a1-erp-hy-wave10.json` and shrink the worker `task` strings. Run
   one worker (Wave 10 A is the easiest) and compare handoff.md to a
   Wave 9 handoff.md — they should be structurally identical.

Wave 9 stays untouched for now. If Wave 10's three workers all
produce handoffs that look right, Wave 11+ can be authored against
the skill from day one.

---

## 7. What this does NOT solve

- **No automated test for the skill itself.** The skill is just a
  prompt; its correctness is judged by whether workers that load it
  stop violating invariants. If Wave 10 A breaks the linter, the
  skill's invariant #1 is wrong or incomplete — fix the skill, not
  the worker.
- **No automatic conflict detection between workers.** Wave 9's merge
  order is still manual. The skill tells a worker to "append, not
  edit" — it does not run a pre-merge check.
- **No cross-wave skill versioning.** A future "v2" of the skill
  would be a new file (`inventory-worker-v2/SKILL.md`) referenced by
  later waves, not a mutation of the existing one. This matches the
  shanraisshan pattern but means the wave JSON must opt in to a
  specific version.
