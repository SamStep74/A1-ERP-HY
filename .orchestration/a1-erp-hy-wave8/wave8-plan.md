# Wave 8 Plan — Mop up the RBAC catalog

**Goal:** drive the linter to **39 PASS / 0 BROAD / 0 UNKNOWN / 9 NO LEGACY (or fewer)**.

**Starting state (on `d5a3f28`):**

| Metric | Count | Notes |
|---|---|---|
| PASS | 37 | grants ⊆ legacy allow-list |
| BROAD GRANT | 2 | `crm.deal.create` + `crm.quote.send` |
| NO LEGACY | 9 | 1 helper + 8 pilot routes |
| UNKNOWN | 0 | no out-of-catalog perm keys |

**Target state after Wave 8 merge:**

| Metric | Target | How |
|---|---|---|
| PASS | 39 | 2 new routes pass (Worker A converts wide-helper routes) |
| BROAD | 0 | Worker A |
| NO LEGACY | 0–9 | Worker B annotates 9 sites; linter can compute allow-list for non-empty annotations |
| UNKNOWN | 0 | Worker C registers inventory perm keys (no change vs current 0, but defensive) |

## Worker breakdown

### Worker A — `narrow-crm-broad-grants` (BEFORE Worker B/C, in case A and B both touch app.js)

**Scope:** convert 2 routes to `preHandler: requirePerm('crm.deal.create')` / `preHandler: requirePerm('crm.quote.send')` using the existing Wave 5 narrow perm sets `DealCreator` and `QuoteSender`.

**Files touched:** `server/app.js` (the 2 routes + import `requirePerm` if not already imported), possibly `server/rbac/roleMatrix.js` (if a role is missing from a narrow set's allow-list — verify first by reading the matrix.js description comments).

**Conflict risk:** both A and B touch `server/app.js`. To minimize merge conflict, the worker should:
- Use `--theirs` strategy on the route-annotation lines B added (or vice versa)
- Keep code-blocks (the route handlers themselves) unchanged
- A's changes are on CRM/collection route declarations; B's are on pilot route declarations. Line ranges are disjoint.

**Verification:**
- `lint-rbac-broad-grants.js` → 39 PASS / 0 BROAD / 9 NO LEGACY / 0 UNKNOWN
- `api.test.js` → 233/233
- `rbac-broad-grants.test.js rbac-migration.test.js` → 71/71

### Worker B — `annotate-no-legacy-sites`

**Scope:** add 9 `// rbac-audit: expected-roles X, Y, Z` annotation lines. 1 inside the body of `requireAnalyticsReportReader` in `server/rbac/guards.js`. 8 above the pilot route declarations in `server/app.js`.

**Files touched:** `server/rbac/guards.js` (or wherever `requireAnalyticsReportReader` lives), `server/app.js`.

**Annotation format (per the lint script's expectations):**
```js
// rbac-audit: expected-roles Owner, Admin, Auditor
function requireAnalyticsReportReader(req, reply, done) { ... }
```

For routes:
```js
// rbac-audit: expected-roles Owner, Accountant, Auditor
app.get('/api/pilots/clinic-wellness/accountant-reviews', { ... }, handler);
```

**Suggested role lists** (verify by reading the handler — these are inferences from the route URLs):
- `requireAnalyticsReportReader` → `Owner, Admin, Auditor`
- `/api/pilots/templates/clinic-wellness` (GET) → `Owner, Admin, Operator` (template browsing)
- `/api/pilots/templates/clinic-wellness/install` (POST) → `Owner, Admin` (installation is sensitive)
- `/api/pilots/clinic-wellness/owner-briefs` (GET/POST) → `Owner, Admin`
- `/api/pilots/clinic-wellness/operator-workbenches` (GET/POST) → `Owner, Admin, Operator`
- `/api/pilots/clinic-wellness/accountant-reviews` (GET/POST) → `Owner, Admin, Accountant, Auditor`

**Verification:**
- `lint-rbac-broad-grants.js` → NO LEGACY count drops (to 0 if all 9 annotations are non-empty, or to a smaller number if any are empty)
- All other metrics unchanged
- All tests still pass (no behavior change, so this is just a sanity check)

### Worker C — `add-inventory-adjust-perms`

**Scope:** defensive — register the 7 inventory perm keys in `server/rbac/permissions.js` if any are missing. (UNKNOWN is currently 0, so this may be a no-op or only catch a regression.)

**Perm keys to check:**
- `inv.stock.adjust`
- `inv.stock.deliver`
- `inv.stock.transfer`
- `inv.stock.scrap`
- `inv.stock.count`
- `inv.product.delete`
- `inv.valuation.run`

**Files touched:** `server/rbac/permissions.js` only.

**Verification:**
- `lint-rbac-broad-grants.js` → UNKNOWN stays 0
- `api.test.js` → 233/233
- `rbac-broad-grants.test.js` → 0 fail

## Merge order

1. Worker C (touches only `permissions.js` — no overlap with anyone)
2. Worker A (touches `app.js` — overlap with B on disjoint lines)
3. Worker B (touches `app.js` last, so A's conversions are in main when B's annotations merge on top)

If A and B conflict on app.js, the resolution is: keep A's route conversions AND keep B's annotation comments. They're additive (A changes the `preHandler:` line; B adds a comment line above it).

## What Wave 8 unblocks

After Wave 8:
- The RBAC catalog is **complete and lint-clean** (0 BROAD, 0 UNKNOWN, NO LEGACY = 0 or just the unavoidable sites).
- All future perm/route additions will be caught by the linter before merge.
- Phase 1 (Inventory) can ship — the inventory perm keys are registered and the catalog knows about them.

## What comes after Wave 8 (Wave 9+)

See the bottom of `docs/PROJECT_STATUS.md` for the full Wave 9+ plan: Inventory, Purchasing, Manufacturing, Reports, Three-level hierarchy, RBAC UI, Deal↔Inventory↔Vendor foreign keys.
