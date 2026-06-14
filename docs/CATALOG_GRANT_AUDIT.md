# Catalog Grant Audit

Generated: `2026-06-14T14:10:18.760Z`

This report is the output of `scripts/lint-rbac-broad-grants.js`.
It proves the invariant the Wave 3 migration workers violated:

> For every `requireXxx` helper and every `preHandler: requirePerm(...)`
> route, the set of roles that hold the corresponding permission key
> (computed by inverting `roleMatrix` + matrix permission sets) is a
> **subset of** the legacy allow-list the original code enforced.

## Summary

| Section | Count |
|---|---|
| PASS — perm grants ⊆ legacy allow-list | 48 |
| BROAD GRANT — perm grants ⊃ legacy allow-list | 0 |
| NO LEGACY ALLOW-LIST — needs manual annotation | 0 |
| UNKNOWN PERM KEY — not in current catalog | 0 |

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
| `requireAnalyticsSnapshotWriter` | `analytics.snapshot.create` | `Owner`, `Admin`, `Accountant` | _(empty)_ |
| `requireAnalyticsReportReader` | `analytics.report.read` | `Owner`, `Admin`, `Auditor`, `Accountant` | _(empty)_ |
| `GET /api/platform/tenant` | `system.tenant.read` | `Owner`, `Admin`, `Auditor` | `Admin`, `Owner` |
| `POST /api/security/mfa/enroll` | `security.mfa.configure` | `Owner`, `Admin` | `Admin`, `Owner` |
| `POST /api/security/mfa/verify-enrollment` | `security.mfa.configure` | `Owner`, `Admin` | `Admin`, `Owner` |
| `GET /api/integrations/connectors` | `system.integrations.read` | `Owner`, `Admin`, `Auditor` | `Admin`, `Auditor`, `Owner` |
| `POST /api/integrations/connectors/:key/configure` | `system.integrations.update` | `Owner`, `Admin` | `Admin`, `Owner` |
| `POST /api/integrations/connectors/:key/health-check` | `system.integrations.update` | `Owner`, `Admin` | `Admin`, `Owner` |
| `GET /api/catalog/categories` | `inv.product.read` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `Accountant`, `Auditor`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `WarehouseClerk` |
| `GET /api/catalog/price-lists` | `inv.product.read` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `Accountant`, `Auditor`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `WarehouseClerk` |
| `GET /api/catalog/pricing/resolve` | `inv.product.read` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `Accountant`, `Auditor`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `WarehouseClerk` |
| `GET /api/catalog/margin-rules` | `inv.product.read` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `Accountant`, `Auditor`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `WarehouseClerk` |
| `GET /api/catalog/items` | `inv.product.read` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `Accountant`, `Auditor`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `WarehouseClerk` |
| `GET /api/catalog/items/:id` | `inv.product.read` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `Accountant`, `Auditor`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `WarehouseClerk` |
| `POST /api/catalog/items` | `inv.product.create` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `Accountant`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `WarehouseClerk` |
| `PATCH /api/catalog/items/:id` | `inv.product.update` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `Accountant`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `ServiceManager`, `WarehouseClerk` |
| `GET /api/inventory/locations` | `inv.stock.read` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `Accountant`, `Auditor`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/inventory/stock` | `inv.stock.read` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `Accountant`, `Auditor`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/inventory/moves` | `inv.stock.read` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `Accountant`, `Auditor`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `Auditor`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `POST /api/inventory/moves` | `inv.stock.receive` | `Owner`, `Admin`, `Operator`, `SalesLead`, `SalesManager`, `SalesRep`, `Accountant`, `FinanceLead`, `InventoryLead`, `PurchaseLead`, `Purchaser`, `WarehouseClerk` | `Accountant`, `Admin`, `FinanceLead`, `InventoryLead`, `Operator`, `Owner`, `PurchaseLead`, `Purchaser`, `SalesLead`, `SalesManager`, `SalesRep`, `WarehouseClerk` |
| `GET /api/purchase/orders` | `purchase.po.read` | `Owner`, `Admin`, `Operator`, `Accountant`, `Auditor` | `Accountant`, `Admin`, `Auditor`, `Operator`, `Owner` |
| `GET /api/purchase/vendors` | `purchase.vendor.read` | `Owner`, `Admin`, `Operator`, `Accountant`, `Auditor` | `Accountant`, `Admin`, `Auditor`, `Operator`, `Owner` |
| `GET /api/purchase/analytics` | `purchase.analytics.read` | `Owner`, `Admin`, `Operator`, `Accountant`, `Auditor` | `Accountant`, `Admin`, `Auditor`, `Operator`, `Owner` |
| `POST /api/purchase/vendors` | `purchase.vendor.create` | `Owner`, `Admin`, `Operator`, `Accountant` | `Accountant`, `Admin`, `Operator`, `Owner` |
| `POST /api/purchase/orders` | `purchase.po.create` | `Owner`, `Admin`, `Operator`, `Accountant` | `Accountant`, `Admin`, `Operator`, `Owner` |
| `POST /api/purchase/orders/:id/confirm` | `purchase.po.update` | `Owner`, `Admin`, `Operator`, `Accountant` | `Accountant`, `Admin`, `Operator`, `Owner` |
| `POST /api/purchase/orders/:id/receive` | `purchase.receipt.create` | `Owner`, `Admin`, `Operator`, `Accountant` | `Accountant`, `Admin`, `Operator`, `Owner` |
| `POST /api/purchase/orders/:id/return` | `purchase.return.create` | `Owner`, `Admin`, `Operator`, `Accountant` | `Accountant`, `Admin`, `Operator`, `Owner` |
| `POST /api/purchase/orders/:id/bill` | `finance.bill.create` | `Owner`, `Admin`, `Accountant` | `Accountant`, `Admin`, `Owner` |
| `GET /api/pilots/templates/clinic-wellness` | `pilot.template.read` | `Owner`, `Admin`, `Salesperson`, `Operator`, `Accountant`, `Auditor` | _(empty)_ |
| `POST /api/pilots/templates/clinic-wellness/install` | `pilot.template.install` | `Owner`, `Admin`, `Salesperson` | _(empty)_ |
| `GET /api/pilots/clinic-wellness/owner-briefs` | `pilot.brief.read` | `Owner`, `Admin`, `Salesperson`, `Operator`, `Accountant`, `Auditor` | _(empty)_ |
| `POST /api/pilots/clinic-wellness/owner-briefs` | `pilot.brief.create` | `Owner`, `Admin`, `Salesperson` | _(empty)_ |
| `GET /api/pilots/clinic-wellness/operator-workbenches` | `pilot.workbench.read` | `Owner`, `Admin`, `Operator`, `Salesperson`, `Service Manager`, `Accountant`, `Auditor` | _(empty)_ |
| `POST /api/pilots/clinic-wellness/operator-workbenches` | `pilot.workbench.create` | `Owner`, `Admin`, `Operator`, `Salesperson`, `Service Manager` | _(empty)_ |
| `GET /api/pilots/clinic-wellness/accountant-reviews` | `pilot.review.read` | `Owner`, `Admin`, `Accountant`, `Auditor` | _(empty)_ |
| `POST /api/pilots/clinic-wellness/accountant-reviews` | `pilot.review.create` | `Owner`, `Admin`, `Accountant` | _(empty)_ |

## BROAD GRANT — perm grants ⊃ legacy allow-list

_No findings._ **The catalog is correctly scoped for every audited site.**

## NO LEGACY ALLOW-LIST — could not find a requireXxx helper for this perm

_No findings._

---

Regenerate with:

```bash
node scripts/lint-rbac-broad-grants.js
```
