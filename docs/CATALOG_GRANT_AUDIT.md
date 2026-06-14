# Catalog Grant Audit

Generated: `2026-06-14T10:23:02.767Z`

This report is the output of `scripts/lint-rbac-broad-grants.js`.
It proves the invariant the Wave 3 migration workers violated:

> For every `requireXxx` helper and every `preHandler: requirePerm(...)`
> route, the set of roles that hold the corresponding permission key
> (computed by inverting `roleMatrix` + matrix permission sets) is a
> **subset of** the legacy allow-list the original code enforced.

## Summary

| Section | Count |
|---|---|
| PASS — perm grants ⊆ legacy allow-list | 15 |
| BROAD GRANT — perm grants ⊃ legacy allow-list | 0 |
| NO LEGACY ALLOW-LIST — needs manual annotation | 23 |
| UNKNOWN PERM KEY — not in current catalog | 10 |

Total entries audited: **48**

## PASS — perm grants ⊆ legacy allow-list

| Source | Perm key | Legacy allow-list | Catalog grant |
|---|---|---|---|
| `requireOwner` | `system.tenant.create` | `Owner` | `Owner` |
| `requirePeopleWriter` | `hr.employee.create` | `Owner`, `Admin`, `Accountant` | `Accountant`, `Admin`, `Owner` |
| `requireAccessReviewer` | `security.access.review` | `Owner`, `Admin`, `Auditor` | `Admin`, `Auditor`, `Owner` |
| `requireSessionReviewer` | `security.session.list` | `Owner`, `Admin`, `Auditor` | `Admin`, `Auditor`, `Owner` |
| `requireSessionAdmin` | `security.session.revoke` | `Owner`, `Admin` | `Admin`, `Owner` |
| `requireAuditExportReader` | `security.audit.read` | `Owner`, `Admin`, `Auditor` | `Admin`, `Auditor`, `Owner` |
| `requireAuditReader` | `security.audit.read` | `Owner`, `Admin`, `Auditor` | `Admin`, `Auditor`, `Owner` |
| `requireAuditExportWriter` | `security.audit.export` | `Owner`, `Admin` | `Admin`, `Owner` |
| `requireCrmEditor` | `crm.deal.create` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager` | `Admin`, `Operator`, `Owner`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager` |
| `requireCollectionEditor` | `crm.quote.send` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `Accountant` | `Accountant`, `Admin`, `Operator`, `Owner`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager` |
| `requireFinanceOperator` | `finance.journal.create` | `Owner`, `Admin`, `Accountant` | `Accountant`, `Admin`, `Owner` |
| `GET /api/platform/tenant` | `system.tenant.read` | `Owner`, `Admin`, `Auditor` | `Admin`, `Owner` |
| `GET /api/integrations/connectors` | `system.integrations.read` | `Owner`, `Admin`, `Auditor` | `Admin`, `Auditor`, `Owner` |
| `POST /api/integrations/connectors/:key/configure` | `system.integrations.update` | `Owner`, `Admin` | `Admin`, `Owner` |
| `POST /api/integrations/connectors/:key/health-check` | `system.integrations.update` | `Owner`, `Admin` | `Admin`, `Owner` |

## BROAD GRANT — perm grants ⊃ legacy allow-list

_No findings._ **The catalog is correctly scoped for every audited site.**

## NO LEGACY ALLOW-LIST — could not find a requireXxx helper for this perm

These are perm keys the Wave 3 migration targeted (or the audit map
catalogued) for which the legacy code did not use a static role list.
Each row is either a route that had no in-handler check (just `app.auth`),
or a helper that delegated to a compound predicate (`mfaRequiredForRole`,
`canAccessInvoiceOverdueExplanation`, etc.). They are reported so that a
future wave can add a `// rbac-audit: expected-roles Owner, Admin, ...`
annotation inside the helper body and the lint will pick it up automatically.

| Source | Perm key | Catalog grant |
|---|---|---|
| `POST /api/security/mfa/enroll` | `security.mfa.configure` | `Admin`, `Owner` |
| `POST /api/security/mfa/verify-enrollment` | `security.mfa.configure` | `Admin`, `Owner` |
| `GET /api/catalog/categories` | `inv.product.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/catalog/price-lists` | `inv.product.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/catalog/pricing/resolve` | `inv.product.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/catalog/margin-rules` | `inv.product.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/catalog/items` | `inv.product.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/catalog/items/:id` | `inv.product.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `POST /api/catalog/items` | `inv.product.create` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `PATCH /api/catalog/items/:id` | `inv.product.update` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/inventory/locations` | `inv.stock.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/inventory/stock` | `inv.stock.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/inventory/moves` | `inv.stock.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `POST /api/inventory/moves` | `inv.stock.receive` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/purchase/orders` | `purchase.po.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser`, `VendorPortal` |
| `GET /api/purchase/vendors` | `purchase.vendor.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser` |
| `GET /api/purchase/analytics` | `purchase.analytics.read` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser` |
| `POST /api/purchase/vendors` | `purchase.vendor.create` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser` |
| `POST /api/purchase/orders` | `purchase.po.create` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser` |
| `POST /api/purchase/orders/:id/confirm` | `purchase.po.update` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser` |
| `POST /api/purchase/orders/:id/receive` | `purchase.receipt.create` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser` |
| `POST /api/purchase/orders/:id/return` | `purchase.return.create` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Owner`, `PurchaseLead`, `Purchaser` |
| `POST /api/purchase/orders/:id/bill` | `finance.bill.create` | `Accountant`, `Admin`, `Bookkeeper`, `FinanceLead`, `Owner`, `PayrollClerk`, `PurchaseLead` |

## UNKNOWN PERM KEY — not in current catalog

These perm keys were targeted by Wave 3 (or catalogued in the audit
map) but do not exist in the current `server/rbac/permissions.js`
catalog. The audit cannot compute the role grant set for them, so
they are reported separately from BROAD GRANT. Treat each row as a
catalog gap: either the perm key was renamed in a later wave, or it
was added to the route without being added to the catalog. Resolve
by updating either the route or the catalog to match.

| Source | Perm key | Note |
|---|---|---|
| `requireAnalyticsSnapshotWriter` | `analytics.snapshot.create` | permKey 'analytics.snapshot.create' is not in the PERMISSIONS catalog |
| `requireAnalyticsReportReader` | `analytics.report.read` | permKey 'analytics.report.read' is not in the PERMISSIONS catalog |
| `GET /api/pilots/templates/clinic-wellness` | `pilot.template.read` | permKey 'pilot.template.read' is not in the PERMISSIONS catalog |
| `POST /api/pilots/templates/clinic-wellness/install` | `pilot.template.install` | permKey 'pilot.template.install' is not in the PERMISSIONS catalog |
| `GET /api/pilots/clinic-wellness/owner-briefs` | `pilot.brief.read` | permKey 'pilot.brief.read' is not in the PERMISSIONS catalog |
| `POST /api/pilots/clinic-wellness/owner-briefs` | `pilot.brief.create` | permKey 'pilot.brief.create' is not in the PERMISSIONS catalog |
| `GET /api/pilots/clinic-wellness/operator-workbenches` | `pilot.workbench.read` | permKey 'pilot.workbench.read' is not in the PERMISSIONS catalog |
| `POST /api/pilots/clinic-wellness/operator-workbenches` | `pilot.workbench.create` | permKey 'pilot.workbench.create' is not in the PERMISSIONS catalog |
| `GET /api/pilots/clinic-wellness/accountant-reviews` | `pilot.review.read` | permKey 'pilot.review.read' is not in the PERMISSIONS catalog |
| `POST /api/pilots/clinic-wellness/accountant-reviews` | `pilot.review.create` | permKey 'pilot.review.create' is not in the PERMISSIONS catalog |

---

Regenerate with:

```bash
node scripts/lint-rbac-broad-grants.js
```
