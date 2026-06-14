# Wave 7 Plan — Narrow 23 BROAD GRANTs

> Generated after Wave 5 (commit 71b8c21) + status doc (0995df3). The `// rbac-audit: expected-roles Owner, Admin, ...` annotations on 23 inline routes exposed 16 unique permKeys where the catalog grants more roles than the legacy allow-list expects.

## Current state (post Wave 5 merge)

| Verdict | Count |
|---------|-------|
| PASS | 16 |
| BROAD GRANT | **23** ← target |
| NO LEGACY | 9 |
| UNKNOWN | 0 |
| **Total** | **48** |

Wave 7 goal: **0 BROAD GRANT, 0 UNKNOWN**, all 23 newly-annotated sites moved to PASS, and NO LEGACY (9) either narrowed or annotated.

## Per-permKey breakdown

Each row gives the legacy `expected` set (from `// rbac-audit: expected-roles` annotations) and the extra roles that must be excluded via a new narrow perm set.

### Worker A scope: catalog + inventory (10 BROAD GRANTs)

| permKey | expected roles | extras to exclude | sites |
|---------|----------------|-------------------|-------|
| `crm.deal.create` | Owner, Admin, Operator, Owner, Salesperson, Service Manager | SalesLead, SalesManager, SalesRep, ServiceManager | 1 (requireCrmEditor) |
| `inv.product.read` | Owner, Admin, Accountant, Operator, Salesperson, Service Manager | Auditor, FinanceLead, InventoryLead, PurchaseLead, Purchaser, SalesLead, SalesManager, SalesRep, WarehouseClerk | 6 (catalog GETs) |
| `inv.product.create` | Owner, Admin, Operator, Salesperson | Accountant, FinanceLead, InventoryLead, PurchaseLead, Purchaser, SalesLead, SalesManager, SalesRep, WarehouseClerk | 1 |
| `inv.product.update` | same as create | same | 1 |
| `inv.stock.read` | Owner, Admin, Accountant, Auditor, Operator | FinanceLead, InventoryLead, PurchaseLead, Purchaser, SalesLead, SalesManager, SalesRep, WarehouseClerk | 3 |
| `inv.stock.receive` | Owner, Admin, Accountant, Operator | FinanceLead, InventoryLead, PurchaseLead, Purchaser, SalesLead, SalesManager, SalesRep, WarehouseClerk | 1 |

**Narrow perm sets Worker A creates:**

| Perm set | perm | grant_to_roles |
|----------|------|----------------|
| `CatalogReader` | `inv.product.read` | Owner, Admin, Accountant, Auditor, Operator, SalesLead, SalesManager, SalesRep, ServiceManager |
| `CatalogEditor` | `inv.product.create`, `inv.product.update` | Owner, Admin, Operator, SalesLead, SalesManager, SalesRep, ServiceManager |
| `StockReader` | `inv.stock.read` | Owner, Admin, Accountant, Auditor, Operator, FinanceLead, InventoryLead, PurchaseLead, Purchaser, WarehouseClerk |
| `StockReceiver` | `inv.stock.receive` | Owner, Admin, Accountant, Operator, InventoryLead, PurchaseLead, Purchaser, WarehouseClerk |

(Note: `crm.deal.create` was already addressed in Wave 5 by `DealCreator`. Re-verify and skip if so.)

### Worker C scope: purchase + finance (8 BROAD GRANTs)

| permKey | expected roles | extras to exclude | sites |
|---------|----------------|-------------------|-------|
| `purchase.po.read` | Owner, Admin, Accountant, Auditor, Operator | FinanceLead, InventoryLead, PurchaseLead, Purchaser, VendorPortal | 1 |
| `purchase.vendor.read` | same | FinanceLead, InventoryLead, PurchaseLead, Purchaser | 1 |
| `purchase.analytics.read` | same | FinanceLead, InventoryLead, PurchaseLead, Purchaser | 1 |
| `purchase.vendor.create` | Owner, Admin, Accountant, Operator | FinanceLead, InventoryLead, PurchaseLead, Purchaser | 1 |
| `purchase.po.create` | same | same | 1 |
| `purchase.po.update` | same | same | 1 |
| `purchase.receipt.create` | same | same | 1 |
| `purchase.return.create` | same | same | 1 |
| `finance.bill.create` | Owner, Admin, Accountant | Bookkeeper, FinanceLead, PayrollClerk, PurchaseLead | 1 |

**Narrow perm sets Worker C creates:**

| Perm set | perm | grant_to_roles |
|----------|------|----------------|
| `PurchaseVendorReader` | `purchase.vendor.read` | Owner, Admin, Accountant, Auditor, Operator, FinanceLead, InventoryLead, PurchaseLead, Purchaser, VendorPortal |
| `PurchaseOrderReader` | `purchase.po.read` | Owner, Admin, Accountant, Auditor, Operator, FinanceLead, InventoryLead, PurchaseLead, Purchaser, VendorPortal |
| `PurchaseAnalyticsReader` | `purchase.analytics.read` | Owner, Admin, Accountant, Auditor, Operator, FinanceLead, InventoryLead, PurchaseLead, Purchaser |
| `PurchaseVendorWriter` | `purchase.vendor.create` | Owner, Admin, Accountant, Operator, FinanceLead, InventoryLead, PurchaseLead, Purchaser |
| `PurchaseOrderWriter` | `purchase.po.create`, `purchase.po.update` | same |
| `PurchaseReceiptWriter` | `purchase.receipt.create` | same |
| `PurchaseReturnWriter` | `purchase.return.create` | same |
| `FinanceBillWriter` | `finance.bill.create` | Owner, Admin, Accountant, Bookkeeper, FinanceLead, PayrollClerk, PurchaseLead |

## NO LEGACY (9 sites, not in scope for Wave 7)

These are routes with NO `// rbac-audit:` annotation. Wave 7 does NOT touch them. They'll be annotated in Wave 8 or marked as NO LEGACY in the snapshot.

## Files edited by Wave 7 workers

- `server/rbac/matrix.js` — add narrow perm sets (under `Wave 7 narrow grant sets` header)
- `server/rbac/roleMatrix.js` — grant new perm sets to roles
- `server/rbac/permissions.js` — register any missing perm keys (Worker B)
- `server/app.js` — replace wide preHandler with `requirePerm('<permKey>')` on annotated routes
- `test/fixtures/catalog-grant-audit-snapshot.json` — regenerated by snapshot script

## Verification contract

After ALL three workers commit and merge to main:

```bash
node scripts/lint-rbac-broad-grants.js
# Expected: 0 BROAD, 0 UNKNOWN. 39 PASS, 9 NO LEGACY.

node --test test/api.test.js
# Expected: 0 fail (was 233/233)

node --test test/rbac-broad-grants.test.js test/rbac-migration.test.js test/pre-existing-failures.test.js
# Expected: 0 fail across all 3 files
```

## Worker isolation

| Worker | Branch | Owns | Conflicts with |
|--------|--------|------|----------------|
| A: narrow-catalog-permissions | narrow-catalog-permissions | matrix.js (Catalog* + Stock*), roleMatrix.js (Catalog* + Stock*), app.js (catalog + inventory routes) | None on file content; merge --ours is safe on matrix.js (different perm sets) |
| B: add-inventory-adjust-perms | add-inventory-adjust-perms | permissions.js only | None (no app.js, no roleMatrix.js) |
| C: extract-purchase-narrow-sets | extract-purchase-narrow-sets | matrix.js (Purchase* + FinanceBill*), roleMatrix.js (Purchase* + FinanceBill*), app.js (purchase + finance routes) | Worker A edits matrix.js earlier; if C is on a different commit base, merge --theirs for matrix.js after A merges |

## Out of scope (Wave 8+)

- 9 NO LEGACY sites: annotate them
- Legacy `requireXxx` helpers: keep until all routes are migrated
- Matrix drift detection on the `inv.*` perm keyset vs `InventoryOperator.permissions` array
