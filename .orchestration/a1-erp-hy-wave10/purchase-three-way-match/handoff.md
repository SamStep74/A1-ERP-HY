# Wave 10 Worker B Handoff: purchase-three-way-match

## Summary

Implemented manual purchase three-way match snapshots for PO lines. Purchase
users can recompute receipt and bill variance for a purchase order, read the
latest match state, and review latest variance alerts across receipts or bills.

## Tables

- `po_receipt_matches`
  - Stores one recompute snapshot per purchase order line.
  - Compares ordered quantity to the order line's net received quantity.
  - Status values: `matched`, `under_received`, `over_received`.
- `po_bill_matches`
  - Stores one recompute snapshot per purchase order line when the PO is linked
    to a bill.
  - Allocates bill subtotal across PO lines by order-line subtotal share.
  - Status values: `matched`, `price_increase`, `price_decrease`.

Both tables are included in initial schema creation and `ensurePurchaseLayer`.
Each table has order-level and line-level indexes for latest snapshot lookups.

Backup scope now includes:

- `po_receipt_matches`
- `po_bill_matches`

## Endpoints

- `GET /api/purchase/orders/:id/match`
  - Permission: `purchase.po.read`
  - Returns the latest receipt and bill match rows per PO line.
- `POST /api/purchase/orders/:id/match/recompute`
  - Permission: `purchase.po.update`
  - Appends match snapshots for all PO lines and emits audit/suite evidence.
- `GET /api/purchase/matches/receipts`
  - Permission: `purchase.analytics.read`
  - Returns latest non-matched receipt rows filtered by `variance_min`.
- `GET /api/purchase/matches/bills`
  - Permission: `purchase.analytics.read`
  - Returns latest non-matched bill rows filtered by `variance_min`.

## Libraries

- `server/purchasing/three-way-match.js`
  - `matchReceipt(orderedQty, receivedQty, tolerance)`
  - `matchPrice(orderedUnitCost, billedUnitCost, tolerance)`

## Notes

- Recompute is manual by design for this worker. Receipt and bill creation do
  not automatically update match snapshots.
- Bill matching uses bill header totals because this product does not yet have
  bill line items.
- Latest alert lists suppress older variance rows once a newer recompute row is
  matched for the same PO line. The alert endpoints apply latest-row filtering
  in SQL, backed by org-created indexes on both match tables.
- `POST /api/purchase/orders/:id/bill` now accepts optional `subtotal` and
  `vat` fields so actual supplier invoice amounts can differ from the PO and
  flow into bill match variance through the public API path.

## Verification

- `node --test test/purchase-three-way-match.test.js` -> 4/4
- `node --test test/purchase-reorder-suggester.test.js` -> 5/5
- `node --test test/inventory-reservations.test.js` -> 19/19
