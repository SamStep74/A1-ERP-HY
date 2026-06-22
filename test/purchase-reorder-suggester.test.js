"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");
const { pickBestVendor, suggestionToPoBody } = require("../server/purchasing/reorder-suggester");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email, password }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers["set-cookie"];
}

async function newApp() {
  const app = buildApp({ dbPath: ":memory:" });
  await app.ready();
  return app;
}

function rowCount(app, table, orgId) {
  return app.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE org_id = ?`).get(orgId).count;
}

async function createShortage(app, cookie, sourceId, quantity) {
  const response = await app.inject({
    method: "POST",
    url: "/api/inventory/reservations",
    headers: { cookie },
    payload: {
      itemId: "catitem-pos-barcode-scanner",
      locationId: "stockloc-main-warehouse",
      sourceType: "sales_order",
      sourceId,
      quantity
    }
  });
  assert.ok([200, 422].includes(response.statusCode), response.body);
  return app.db.prepare(`
    SELECT *
    FROM stock_shortages
    WHERE org_id = ? AND source_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get("org-armosphera-demo", sourceId);
}

test("reorder-suggester: pure helpers choose vendors and compose PO bodies", () => {
  const prices = [
    { id: "price-a", vendorId: "vendor-a", catalogItemId: "item-1", unitCost: 700, minQuantity: 1, currency: "AMD", status: "active", validFrom: "2026-06-01" },
    { id: "price-b", vendorId: "vendor-b", catalogItemId: "item-1", unitCost: 650, minQuantity: 1, currency: "AMD", status: "active", validFrom: "2026-05-01" },
    { id: "price-c", vendorId: "vendor-c", catalogItemId: "item-2", unitCost: 100, minQuantity: 1, currency: "AMD", status: "active", validFrom: "2026-06-01" }
  ];
  assert.deepEqual(pickBestVendor(prices, "item-1", 2), {
    vendorId: "vendor-b",
    vendorPriceId: "price-b",
    unitCost: 650,
    currency: "AMD",
    minQuantity: 1
  });

  const fallback = pickBestVendor([
    { id: "older", vendor_id: "vendor-old", catalog_item_id: "item-1", unit_cost: 400, min_quantity: 10, currency: "AMD", status: "active", valid_from: "2026-05-01" },
    { id: "newer", vendor_id: "vendor-new", catalog_item_id: "item-1", unit_cost: 500, min_quantity: 20, currency: "AMD", status: "active", valid_from: "2026-06-01" }
  ], "item-1", 2);
  assert.equal(fallback.vendorId, "vendor-old");
  assert.equal(fallback.minQuantity, 10);
  assert.equal(pickBestVendor([
    { id: "future", vendorId: "vendor-future", catalogItemId: "item-1", unitCost: 300, minQuantity: 1, currency: "AMD", status: "active", validFrom: "2099-01-01" }
  ], "item-1", 1, { asOfDate: "2026-06-22" }), null);

  assert.deepEqual(suggestionToPoBody(
    { vendorId: "vendor-a", quantity: 3, unitCost: 650, note: "shortage replay" },
    { itemId: "item-1", shortageQty: 2 }
  ), {
    vendorId: "vendor-a",
    note: "shortage replay",
    lines: [{ catalogItemId: "item-1", quantity: 3, unitCost: 650 }]
  });
});

test("reorder suggestions: generate materializes pending suggestions from open shortages", async () => {
  const app = await newApp();
  try {
    const owner = await login(app);
    const operator = await login(app, "operator@armosphera.local");
    const support = await login(app, "support@armosphera.local");
    const orgId = "org-armosphera-demo";
    const before = rowCount(app, "reorder_suggestions", orgId);
    const shortage = await createShortage(app, owner, "so-reorder-list", 20);
    assert.ok(shortage);
    assert.equal(shortage.shortage_qty, 8);

    const unauthenticated = await app.inject({ method: "GET", url: "/api/purchase/reorder-suggestions" });
    assert.equal(unauthenticated.statusCode, 401);
    const supportDenied = await app.inject({ method: "GET", url: "/api/purchase/reorder-suggestions", headers: { cookie: support } });
    assert.equal(supportDenied.statusCode, 403, supportDenied.body);

    const readBeforeGenerate = await app.inject({
      method: "GET",
      url: "/api/purchase/reorder-suggestions?status=pending",
      headers: { cookie: operator }
    });
    assert.equal(readBeforeGenerate.statusCode, 200, readBeforeGenerate.body);
    assert.equal(readBeforeGenerate.json().suggestions.length, 0);
    assert.equal(rowCount(app, "reorder_suggestions", orgId), before, "GET is read-only");

    const listed = await app.inject({
      method: "POST",
      url: "/api/purchase/reorder-suggestions/generate",
      headers: { cookie: operator },
      payload: {}
    });
    assert.equal(listed.statusCode, 200, listed.body);
    const suggestion = listed.json().suggestions.find(item => item.shortageId === shortage.id);
    assert.ok(suggestion, "suggestion is materialized for the shortage");
    assert.match(suggestion.id, /^reorder-suggestion-/);
    assert.equal(suggestion.itemId, "catitem-pos-barcode-scanner");
    assert.equal(suggestion.suggestedVendorId, "vendor-yerevan-hardware-supply");
    assert.equal(suggestion.suggestedUnitCost, 60000);
    assert.equal(suggestion.suggestedQuantity, 8);
    assert.equal(suggestion.status, "pending");
    assert.equal(rowCount(app, "reorder_suggestions", orgId), before + 1);

    const repeated = await app.inject({
      method: "POST",
      url: "/api/purchase/reorder-suggestions/generate",
      headers: { cookie: operator }
    });
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(rowCount(app, "reorder_suggestions", orgId), before + 1, "second generate does not duplicate suggestion");
  } finally {
    await app.close();
  }
});

test("reorder suggestions: accept creates an RFQ purchase order and stores the evidence link", async () => {
  const app = await newApp();
  try {
    const operator = await login(app, "operator@armosphera.local");
    const owner = await login(app);
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const shortage = await createShortage(app, owner, "so-reorder-accept", 20);
    const listed = await app.inject({ method: "POST", url: "/api/purchase/reorder-suggestions/generate", headers: { cookie: operator }, payload: {} });
    assert.equal(listed.statusCode, 200, listed.body);
    const suggestion = listed.json().suggestions.find(item => item.shortageId === shortage.id);
    assert.ok(suggestion);
    const counts = {
      orders: rowCount(app, "purchase_orders", orgId),
      lines: rowCount(app, "purchase_order_lines", orgId),
      events: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type = ?").get(orgId, "purchase.reorder_suggestion.accepted").count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "purchase.reorder_suggestion.accepted").count
    };

    const accepted = await app.inject({
      method: "POST",
      url: `/api/purchase/reorder-suggestions/${suggestion.id}/accept`,
      headers: { cookie: operator },
      payload: { orderDate: `${openPeriod}-12`, expectedDate: `${openPeriod}-15` }
    });
    assert.equal(accepted.statusCode, 200, accepted.body);
    const body = accepted.json();
    assert.equal(body.suggestion.status, "accepted");
    assert.equal(body.suggestion.createdPurchaseOrderId, body.order.id);
    assert.equal(body.order.status, "rfq");
    assert.equal(body.order.vendorId, "vendor-yerevan-hardware-supply");
    assert.equal(body.order.lines[0].catalogItemId, "catitem-pos-barcode-scanner");
    assert.equal(body.order.lines[0].quantity, 8);
    assert.equal(body.order.lines[0].unitCost, 60000);
    assert.equal(rowCount(app, "purchase_orders", orgId), counts.orders + 1);
    assert.equal(rowCount(app, "purchase_order_lines", orgId), counts.lines + 1);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type = ?").get(orgId, "purchase.reorder_suggestion.accepted").count, counts.events + 1);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "purchase.reorder_suggestion.accepted").count, counts.audits + 1);

    const repeated = await app.inject({
      method: "POST",
      url: `/api/purchase/reorder-suggestions/${suggestion.id}/accept`,
      headers: { cookie: operator },
      payload: { orderDate: `${openPeriod}-12`, expectedDate: `${openPeriod}-15` }
    });
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().idempotent, true);
    assert.equal(rowCount(app, "purchase_orders", orgId), counts.orders + 1);

    const acceptedList = await app.inject({ method: "GET", url: "/api/purchase/reorder-suggestions?status=accepted", headers: { cookie: operator } });
    assert.equal(acceptedList.statusCode, 200, acceptedList.body);
    assert.ok(acceptedList.json().suggestions.some(item => item.id === suggestion.id && item.createdPurchaseOrderId === body.order.id));

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: owner },
      payload: { note: "Reorder suggestions must restore with purchase evidence." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    assert.ok(backup.json().backup.payload.tables.stock_shortages.some(item => item.id === shortage.id));
    assert.ok(backup.json().backup.payload.tables.stock_reservations.some(item => item.id === shortage.reservation_id));
    assert.ok(backup.json().backup.payload.tables.reorder_suggestions.some(item => item.id === suggestion.id && item.created_purchase_order_id === body.order.id));
  } finally {
    await app.close();
  }
});

test("reorder suggestions: reject transitions pending suggestions and blocks later accept", async () => {
  const app = await newApp();
  try {
    const owner = await login(app);
    const operator = await login(app, "operator@armosphera.local");
    const orgId = "org-armosphera-demo";
    const shortage = await createShortage(app, owner, "so-reorder-reject", 20);
    const listed = await app.inject({ method: "POST", url: "/api/purchase/reorder-suggestions/generate", headers: { cookie: operator }, payload: {} });
    const suggestion = listed.json().suggestions.find(item => item.shortageId === shortage.id);
    assert.ok(suggestion);

    const rejected = await app.inject({
      method: "POST",
      url: `/api/purchase/reorder-suggestions/${suggestion.id}/reject`,
      headers: { cookie: operator },
      payload: { reason: "covered by existing vendor PO" }
    });
    assert.equal(rejected.statusCode, 200, rejected.body);
    assert.equal(rejected.json().suggestion.status, "rejected");
    assert.equal(rejected.json().suggestion.rejectionReason, "covered by existing vendor PO");
    assert.ok(rejected.json().suggestion.resolvedAt);

    const repeated = await app.inject({
      method: "POST",
      url: `/api/purchase/reorder-suggestions/${suggestion.id}/reject`,
      headers: { cookie: operator },
      payload: { reason: "covered by existing vendor PO" }
    });
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().idempotent, true);

    const accepted = await app.inject({
      method: "POST",
      url: `/api/purchase/reorder-suggestions/${suggestion.id}/accept`,
      headers: { cookie: operator },
      payload: {}
    });
    assert.equal(accepted.statusCode, 409, accepted.body);
    assert.equal(rowCount(app, "purchase_orders", orgId), 0);
  } finally {
    await app.close();
  }
});

test("reorder suggestions: fractional shortages round up to a purchasable quantity", async () => {
  const app = await newApp();
  try {
    const owner = await login(app);
    const operator = await login(app, "operator@armosphera.local");
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    app.db.prepare(`
      UPDATE stock_quants
      SET quantity = 0, reserved_quantity = 0
      WHERE org_id = ? AND catalog_item_id = ? AND location_id = ?
    `).run(orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse");
    const shortage = await createShortage(app, owner, "so-reorder-fractional", 2.4);
    assert.equal(shortage.shortage_qty, 2.4);

    const listed = await app.inject({ method: "POST", url: "/api/purchase/reorder-suggestions/generate", headers: { cookie: operator }, payload: {} });
    assert.equal(listed.statusCode, 200, listed.body);
    const suggestion = listed.json().suggestions.find(item => item.shortageId === shortage.id);
    assert.ok(suggestion);
    assert.equal(suggestion.suggestedQuantity, 3);

    const accepted = await app.inject({
      method: "POST",
      url: `/api/purchase/reorder-suggestions/${suggestion.id}/accept`,
      headers: { cookie: operator },
      payload: { orderDate: `${openPeriod}-12`, expectedDate: `${openPeriod}-15` }
    });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(accepted.json().order.lines[0].quantity, 3);
  } finally {
    await app.close();
  }
});
