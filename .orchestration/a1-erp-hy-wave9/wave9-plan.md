# Wave 9 Plan — Phase 1 Inventory (functional work begins)

**Goal:** ship the 3 foundational features that make the inventory system feature-complete: **valuation**, **reservations**, **cycle counts**. The catalog schema (3 stock tables) and the RBAC perms (all stock-related perm keys) are already in place from Waves 6-8.

**Starting state (on `46db222`):**

| Metric | Count |
|---|---|
| Linter PASS / BROAD / UNKNOWN / NO LEGACY | 48 / 0 / 0 / 0 |
| `api.test.js` | 233/233 |
| `rbac-broad-grants.test.js + rbac-migration.test.js` | 71/71 |

**Target state after Wave 9 merge:**

| Metric | Target |
|---|---|
| Linter | still 48/0/0/0 (catalog must stay clean) |
| `api.test.js` | 233/233 + ~30 new tests across the 3 worker test files |
| `stock_locations` / `stock_quants` / `stock_moves` | unchanged |
| New tables | `stock_valuation_layers` (A), `stock_reservations` + `stock_shortages` (B), `stock_counts` + `stock_count_lines` (C) |
| New endpoints | 2 (A) + 4 (B) + 5 (C) = 11 new routes |
| New perm keys | 1 (B: `inv.stock.reserve`) — if missing |
| New libs | `server/inventory/valuation.js` (A), `server/inventory/count-engine.js` (C) |

## Worker breakdown

### Worker A — `inventory-valuation` (BIGGEST)

**Scope:** FIFO/LIFO/WAC valuation. Adds `stock_valuation_layers` table, hooks into `stock_moves` to write layers, adds `GET /api/inventory/valuation` + `POST /api/inventory/valuation/recompute`, adds `catalog_items.valuation_method` column, creates the consumption engine library.

**Files touched:** `server/db.js` (append valuation table + alter catalog_items), `server/app.js` (2 new routes), `server/inventory/valuation.js` (new), `server/rbac/permissions.js` (only if `inv.valuation.read` or `inv.valuation.run` is missing — both are registered).

**Conflict surface:** db.js (append new section at end of initSchema), app.js (add 2 routes — line range not in B/C's scope).

### Worker B — `inventory-reservations`

**Scope:** reserve stock against a sales_order; auto-reserve on order creation; record shortages for partial reservations. Adds `stock_reservations` + `stock_shortages` tables, 4 new endpoints, sales-order hook.

**Files touched:** `server/db.js` (append reservation + shortage tables), `server/app.js` (4 new routes + modify POST /api/sales/orders to fire reservation hook), `server/rbac/permissions.js` (register `inv.stock.reserve` if missing — almost certainly missing).

**Conflict surface:** db.js (append new section, separate from A's), app.js (4 new routes + 1 modification to sales-order handler — line range not in A/C's scope).

### Worker C — `inventory-cycle-counts`

**Scope:** periodic physical stock counts, variance reconciliation. Adds `stock_counts` + `stock_count_lines` tables, 5 new endpoints, count-engine library.

**Files touched:** `server/db.js` (append count tables + possibly extend stock_moves CHECK constraint for 'adjustment' type), `server/app.js` (5 new routes), `server/inventory/count-engine.js` (new), `server/rbac/permissions.js` (no new keys needed; all stock perms are registered).

**Conflict surface:** db.js (append new section, separate from A's and B's), app.js (5 new routes — disjoint from A and B).

## Merge order

1. Worker A (db.js + app.js, no overlap with B/C)
2. Worker B (db.js + app.js, possibly modifies sales-order handler)
3. Worker C (db.js + app.js, possibly modifies stock_moves CHECK constraint)

If two workers add new tables in the same db.js region, conflicts are minor (just where the new CREATE TABLE statements interleave). Resolution: keep all of both.

## What Wave 9 unblocks

After Wave 9, the inventory module is **feature-complete for the basics**:
- You can move stock in/out (existing)
- You can value that stock under FIFO/LIFO/WAC (Worker A)
- You can reserve stock against a sales order and see shortages (Worker B)
- You can take a physical count and reconcile variances (Worker C)

The next step would be either:
- **Phase 2 Purchasing** (Wave 10+): vendor POs, three-way matching (PO ↔ receipt ↔ invoice) using the reservation system
- **Deal ↔ Inventory ↔ Vendor foreign keys** (Wave 11+): a sales_order drives stock reservation + auto-reorder when shortages are recorded
- **Reports** (Wave 12+): inventory valuation report, shortage dashboard, count variance trend

## What comes after Wave 9 (Wave 10+)

See the bottom of `docs/PROJECT_STATUS.md` for the full plan. With the RBAC catalog clean and the inventory module feature-complete, the project can pivot to either deeper functional work (purchasing, manufacturing) or building out the UI/admin layer.
