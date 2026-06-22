# Wave 10 Plan — Phase 2 Purchasing (auto-reorder + three-way match)

**Goal:** close the deal ↔ inventory ↔ vendor loop. A `stock_shortages`
row (from Wave 9) should be able to drive an auto-generated
`reorder_suggestion` which a Purchaser can convert into a
`purchase_order` in one click. And the existing PO/receipt/bill
handlers should grow a **three-way match** engine that flags mismatches
(ordered qty ≠ received qty ≠ billed qty).

**Starting state (on Wave 9 merge):**

| Metric | Expected |
|---|---|
| Linter | still 48/0/0/0 (catalog must stay clean) |
| `api.test.js` | 233/233 + ~30 new (Wave 9) |
| `stock_shortages` table | new (Wave 9 Worker B) |
| `purchase_orders` + `purchase_order_lines` | existing (line 733 / 761) |
| `purchase_vendors` + `purchase_vendor_prices` | existing (line 692 / 712) |
| `createPurchaseOrder` + `receivePurchaseOrder` + `billPurchaseOrder` | existing handlers (line 50286+) |

**Target state after Wave 10 merge:**

| Metric | Target |
|---|---|
| Linter | still 48/0/0/0 |
| `api.test.js` | 233/233 + ~30 (Wave 9) + ~25 (Wave 10) |
| New tables | `reorder_suggestions`, `po_receipt_matches`, `po_bill_matches` |
| New endpoints | 2 (A: reorder suggester) + 4 (B: three-way match) + 3 (C: vendor 360 / RFQ list) = 9 new routes |
| New libs | `server/purchasing/reorder-suggester.js` (A), `server/purchasing/three-way-match.js` (B) |
| New perm keys | 0 (all purchase.* keys already registered) |

## Worker breakdown

### Worker A — `purchase-reorder-suggester`

**Scope:** When a `stock_shortages` row is `status='open'`, generate
a `reorder_suggestion` row. The suggestion picks the
`purchase_vendor_prices` row with the lowest unit_price for that
item (falling back to the most recent vendor). Purchaser sees the
suggestion in the UI, clicks "Create PO", and the system
auto-populates a `purchase_order` draft from the suggestion.

**New table (`reorder_suggestions`):**
- `id INTEGER PK`
- `org_id INTEGER NOT NULL`
- `shortage_id INTEGER NOT NULL REFERENCES stock_shortages(id)`
- `suggested_vendor_id INTEGER REFERENCES purchase_vendors(id)`
- `suggested_unit_cost REAL`
- `suggested_quantity REAL`
- `currency TEXT DEFAULT 'AMD'`
- `status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','expired')) DEFAULT 'pending'`
- `created_purchase_order_id INTEGER REFERENCES purchase_orders(id)`
- `created_at TEXT DEFAULT CURRENT_TIMESTAMP`
- `resolved_at TEXT`

**New endpoints:**
- `GET /api/purchase/reorder-suggestions?status=pending` — list pending suggestions. `requirePerm('purchase.analytics.read')`
- `POST /api/purchase/reorder-suggestions/:id/accept` — convert to a draft PO. `requirePerm('purchase.po.create')`. Body: `{ vendor_id?, quantity?, unit_cost? }`. Creates a `purchase_orders` row with one `purchase_order_lines` row referencing the shortage's `item_id`. Sets the suggestion's `status='accepted'` and `created_purchase_order_id`.
- `POST /api/purchase/reorder-suggestions/:id/reject` — mark suggestion rejected with optional reason. `requirePerm('purchase.po.create')`.

**Files touched:**
- `server/db.js` — append `reorder_suggestions` table
- `server/app.js` — 3 new routes (after the existing purchase block, line ~830)
- `server/purchasing/reorder-suggester.js` — new pure-function library
- `server/rbac/permissions.js` — only if a perm is missing (none should be)

**Pure function signature:**
```js
// picks best vendor from purchase_vendor_prices for the given item
// returns { vendorId, unitCost, currency } | null
function pickBestVendor(prices, itemId, quantity)

// composes a draft PO body from a shortage + chosen vendor
// returns { vendor_id, lines: [{ item_id, quantity, unit_cost }] }
function suggestionToPoBody(suggestion, shortage)
```

### Worker B — `purchase-three-way-match`

**Scope:** After Wave 9, a `purchase_order` has
`confirmPurchaseOrder` → `receivePurchaseOrder` → `billPurchaseOrder`.
Three-way matching compares the **ordered** qty (in
`purchase_order_lines`), the **received** qty (in
`purchase_order_lines.received_qty`, updated by
`receivePurchaseOrder`), and the **billed** qty (in
`finance_bills.line_items` JSON or a new column). Mismatches
become alertable rows.

**New tables:**
- `po_receipt_matches`:
  - `id INTEGER PK`
  - `purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id)`
  - `purchase_order_line_id INTEGER NOT NULL REFERENCES purchase_order_lines(id)`
  - `ordered_qty REAL NOT NULL`
  - `received_qty REAL NOT NULL`
  - `variance_qty REAL NOT NULL` (received - ordered)
  - `status TEXT NOT NULL CHECK (status IN ('matched','under_received','over_received'))`
  - `created_at TEXT DEFAULT CURRENT_TIMESTAMP`
- `po_bill_matches`:
  - `id INTEGER PK`
  - `purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id)`
  - `purchase_order_line_id INTEGER NOT NULL REFERENCES purchase_order_lines(id)`
  - `ordered_unit_cost REAL NOT NULL`
  - `billed_unit_cost REAL NOT NULL`
  - `variance_pct REAL NOT NULL`
  - `status TEXT NOT NULL CHECK (status IN ('matched','price_increase','price_decrease'))`
  - `created_at TEXT DEFAULT CURRENT_TIMESTAMP`

**New endpoints:**
- `GET /api/purchase/orders/:id/match` — read the latest receipt + bill match for an order. `requirePerm('purchase.po.read')`
- `POST /api/purchase/orders/:id/match/recompute` — recompute the matches (called after `receivePurchaseOrder` or `billPurchaseOrder`). `requirePerm('purchase.po.update')`
- `GET /api/purchase/matches/receipts?variance_min=0.05` — list under/over received POs. `requirePerm('purchase.analytics.read')`
- `GET /api/purchase/matches/bills?variance_min=0.05` — list price-mismatched POs. `requirePerm('purchase.analytics.read')`

**Files touched:**
- `server/db.js` — append 2 new tables + possibly add `received_qty` column to `purchase_order_lines` (check first; if not present, ALTER TABLE)
- `server/app.js` — 4 new routes
- `server/purchasing/three-way-match.js` — new pure-function library
- `server/purchasing/` — possibly hook into `receivePurchaseOrder` and `billPurchaseOrder` (which are in `server/app.js` around line 50412+) to write match rows on success. If that creates a worker merge conflict with C, defer the hook to Wave 11.

**Pure function signature:**
```js
// returns { variance, status: 'matched'|'under_received'|'over_received' }
function matchReceipt(orderedQty, receivedQty, tolerance = 0.01)

// returns { variancePct, status: 'matched'|'price_increase'|'price_decrease' }
function matchPrice(orderedUnitCost, billedUnitCost, tolerance = 0.01)
```

### Worker C — `purchase-vendor-360` (lightest worker)

**Scope:** Build the "Vendor 360" view — a per-vendor summary
combining vendor info, recent POs, open receipts, open bills, and
spend analytics. The route is read-only and uses existing tables
plus the new Wave 10 tables.

**New endpoints:**
- `GET /api/purchase/vendors/:id/360` — vendor 360 dashboard. `requirePerm('purchase.vendor_360.read')` (already registered). Returns: vendor info + count of open POs + count of open receipts + total spend YTD + last PO date + open reorder suggestions.
- `GET /api/purchase/vendors/:id/recent-orders` — last 10 POs for vendor. `requirePerm('purchase.po.read')`
- `GET /api/purchase/vendors/:id/price-history` — recent price history from `purchase_vendor_prices`. `requirePerm('purchase.pricelist.read')`

**Files touched:**
- `server/app.js` — 3 new routes only
- `server/purchasing/vendor-360.js` — new read-only aggregation library (no DB writes)

**Pure function signature:**
```js
// composes the 360 view from a vendor + arrays of POs/receipts/bills/suggestions
function buildVendor360(vendor, pos, receipts, bills, suggestions)
```

## Merge order

1. **Worker A** — appends `reorder_suggestions` table to db.js. No overlap with B or C.
2. **Worker B** — appends 2 new tables + possibly ALTER purchase_order_lines. Possible conflict with A on db.js if both append near the same line — resolve by hand-merging.
3. **Worker C** — only adds routes, no schema changes. Last to merge, so A's/B's hook into `receivePurchaseOrder` (if any) is already in main.

## What Wave 10 unblocks

After Wave 10:
- A shortage recorded in Wave 9 can drive a PO draft in one click
- Three-way match flags receipt/bill mismatches for review
- Vendor 360 gives a single-page view of a vendor relationship
- The deal ↔ inventory ↔ vendor loop is closed

Next waves could be:
- **Wave 11** — `Vendor RFQ` flow (request-for-quotation, vendor bids, award) — uses the Wave 10 perm set
- **Wave 12** — Manufacturing (BOMs, work orders)
- **Wave 13** — Three-level hierarchy (if needed for multi-company)
- **Wave 14** — RBAC UI (frontend for managing roles)
- **Wave 15** — Reports & analytics pivot tables

## Constraints (all workers)

- Touch only the files listed for your scope.
- Do NOT modify `purchase_orders` / `purchase_order_lines` / `purchase_vendors` schema beyond what the task spec requires.
- Do NOT touch the sales_orders, inventory stock_*, or Wave 9 code.
- Lint must stay 48/0/0/0.
- All existing tests must pass.
- Add 8+ new tests per worker.
- One commit per worker, pushed to its branch.
- Write `handoff.md` listing tables, endpoints, perm keys, and test counts.
