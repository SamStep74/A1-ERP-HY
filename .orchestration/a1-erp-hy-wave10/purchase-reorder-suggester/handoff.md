# Wave 10 Worker A Handoff: purchase-reorder-suggester

## Summary

Implemented shortage-driven reorder suggestions for purchasing. Open stock
shortages can now be generated into pending reorder suggestions, reviewed by
purchase users, accepted into an RFQ purchase order, or rejected with an
evidence reason.

## Tables

- `reorder_suggestions`
  - Links `stock_shortages` to suggested vendor/pricelist data.
  - Stores status (`pending`, `accepted`, `rejected`, `expired`), the created
    purchase order link, rejection reason, and timestamps.
  - Added to initial schema and `ensurePurchaseLayer` migration.

Backup scope now includes:

- `stock_reservations`
- `stock_shortages`
- `reorder_suggestions`

## Endpoints

- `GET /api/purchase/reorder-suggestions`
  - Permission: `purchase.analytics.read`
  - Read-only list endpoint. It does not create suggestions.
- `POST /api/purchase/reorder-suggestions/generate`
  - Permission: `purchase.po.create`
  - Materializes pending suggestions from open shortages.
- `POST /api/purchase/reorder-suggestions/:id/accept`
  - Permission: `purchase.po.create`
  - Creates or reuses a deterministic RFQ purchase order and marks the
    suggestion accepted.
- `POST /api/purchase/reorder-suggestions/:id/reject`
  - Permission: `purchase.po.create`
  - Marks the suggestion rejected and records the reason.

## Libraries

- `server/purchasing/reorder-suggester.js`
  - `pickBestVendor(prices, itemId, quantity, options)`
  - `suggestionToPoBody(suggestion, shortage)`

## RBAC Notes

- No new permission keys were added.
- Removed redundant legacy `requireInventoryReader/Writer` calls from the
  Wave 9 reservation/shortage routes already guarded by `requirePerm`.
- Added regression coverage for `WarehouseClerk` using inventory permissions
  without being blocked by legacy role guards.

## Verification

- `node --test test/purchase-reorder-suggester.test.js` -> 5/5
- `node --test test/inventory-reservations.test.js` -> 19/19
- `node scripts/lint-rbac-broad-grants.js` -> 48 PASS / 0 BROAD / 0 NO LEGACY
- `node --test test/rbac-broad-grants.test.js` -> 48/48
- `node --test test/rbac-migration.test.js` -> 23/23
- `node --test test/api.test.js` -> 233/233
- `git diff --check` -> clean
