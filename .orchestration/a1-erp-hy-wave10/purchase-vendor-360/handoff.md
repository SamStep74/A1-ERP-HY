# Wave 10 Worker C Handoff: purchase-vendor-360

## Summary

Implemented read-only Vendor 360 views for purchase vendors. The new surface
combines vendor master data, recent purchase orders, open receipt backlog,
linked AP bills, YTD spend, price history, and pending reorder suggestions.

## Tables And Indexes

No new tables.

The read models use existing data from:

- `purchase_vendors`
- `purchase_vendor_prices`
- `purchase_orders`
- `purchase_order_lines`
- `purchase_receipts`
- `bills`
- `bill_payments`
- `reorder_suggestions`
- `stock_shortages`

Added idempotent supporting indexes for new and existing databases:

- `idx_purchase_orders_vendor_recent`
- `idx_purchase_orders_vendor_receipts`
- `idx_bill_payments_bill`

Planner check after the reviewer fix:

- Vendor open receipts starts from `idx_purchase_orders_vendor_receipts`
  and uses `idx_purchase_order_lines_order` for per-PO line totals.
- Vendor bills starts from `idx_purchase_orders_vendor`; AP paid totals are
  correlated by bill and use `idx_bill_payments_bill`.

## Endpoints

- `GET /api/purchase/vendors/:id/360`
  - Permission: `purchase.vendor_360.read`
  - Returns vendor info, aggregate summary counts, and open reorder
    suggestions. Detailed recent PO rows and receipt backlog are included only
    when the caller also has `purchase.po.read`; AP bill/payment rows and YTD
    spend are included only when the caller also has `finance.bill.read`.
- `GET /api/purchase/vendors/:id/recent-orders`
  - Permission: `purchase.po.read`
  - Returns the latest 10 purchase orders for the vendor.
- `GET /api/purchase/vendors/:id/price-history`
  - Permission: `purchase.pricelist.read`
  - Returns the latest 25 vendor price rows with catalog item evidence.

## Libraries

- `server/purchasing/vendor-360.js`
  - `buildVendor360(vendor, pos, receipts, bills, suggestions)`

## RBAC Notes

- No new permission keys were added.
- Vendor 360 and price history use the existing operational purchase read sets:
  Owner, Admin, Accountant, Auditor, FinanceLead, InventoryLead, PurchaseLead,
  and Purchaser.
- Recent vendor orders use the narrower `purchase.po.read` set:
  Owner, Admin, Operator, Accountant, and Auditor.
- Vendor 360 is capability-aware inside the payload: Purchaser/InventoryLead
  can see aggregate vendor relationship state, but cannot receive full PO line
  details or AP bill/payment details unless they also hold the relevant read
  permissions.
- RBAC audit snapshot now covers 59 sites with 0 broad grants.

## Verification

- `node --test test/purchase-vendor-360.test.js` -> 9/9
- `node --test test/purchase-vendor-360.test.js test/rbac-broad-grants.test.js` -> 68/68
- `node --test --test-name-pattern "existing purchase order tables receive vendor columns before vendor indexes" test/api.test.js` -> 1/1
- `node --test test/api.test.js` -> 234/234
- `npm run lint:rbac` -> clean, 59 PASS / 0 BROAD / 0 NO LEGACY
- `node scripts/lint-rbac-broad-grants.js` -> 59 PASS / 0 BROAD / 0 NO LEGACY
- `node --test test/rbac-broad-grants.test.js` -> 59/59
