"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

// Phase 1 Inventory — Stock Reservations + Stock Shortages + Sales-Order hook.
//
// The reservation system sits between the sales-order line and the stock
// pick. A line is created (reserving what is available, recording a
// shortage for what is not) and the picker later fulfills it via a
// stock_move. The order is never rejected on stock grounds.

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

function countReservations(app, orgId) {
  return app.db.prepare("SELECT COUNT(*) AS c FROM stock_reservations WHERE org_id = ?").get(orgId).c;
}
function countShortages(app, orgId) {
  return app.db.prepare("SELECT COUNT(*) AS c FROM stock_shortages WHERE org_id = ?").get(orgId).c;
}
function stockOnHand(app, orgId, itemId, locationId) {
  const row = app.db.prepare(`
    SELECT COALESCE(quantity, 0) AS q, COALESCE(reserved_quantity, 0) AS r
    FROM stock_quants
    WHERE org_id = ? AND catalog_item_id = ? AND location_id = ?
  `).get(orgId, itemId, locationId);
  return row ? { quantity: row.q, reserved: row.r } : { quantity: 0, reserved: 0 };
}

test("reservations: GET /api/inventory/reservations is auth-gated and returns the seed reservations list", async () => {
  const app = await newApp();
  try {
    const unauth = await app.inject({ method: "GET", url: "/api/inventory/reservations" });
    assert.equal(unauth.statusCode, 401);

    const cookie = await login(app);
    const resp = await app.inject({
      method: "GET",
      url: "/api/inventory/reservations",
      headers: { cookie }
    });
    assert.equal(resp.statusCode, 200, resp.body);
    assert.ok(Array.isArray(resp.json().reservations));
  } finally {
    await app.close();
  }
});

test("reservations: POST /api/inventory/reservations creates an active row when stock is sufficient", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const orgId = "org-armosphera-demo";
    const before = countReservations(app, orgId);

    // The seeded barcode scanner has on-hand=12 in WH/STOCK. Request 5.
    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-test-001",
        quantity: 5
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const reservation = created.json().reservation;
    assert.match(reservation.id, /^reservation-/);
    assert.equal(reservation.itemId, "catitem-pos-barcode-scanner");
    assert.equal(reservation.locationId, "stockloc-main-warehouse");
    assert.equal(reservation.sourceType, "sales_order");
    assert.equal(reservation.sourceId, "so-test-001");
    assert.equal(reservation.quantity, 5);
    assert.equal(reservation.status, "active");
    assert.equal(reservation.releasedAt, null);
    assert.equal(reservation.releasedReason, null);
    assert.equal(countReservations(app, orgId), before + 1);
    assert.equal(countShortages(app, orgId), 0, "no shortage when stock is sufficient");
  } finally {
    await app.close();
  }
});

test("reservations: POST with insufficient stock creates a partial reservation AND a shortage row", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const orgId = "org-armosphera-demo";
    const shortBefore = countShortages(app, orgId);
    const resBefore = countReservations(app, orgId);

    // Seeded scanner has on-hand=12. Request 100.
    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-shortage-test",
        quantity: 100
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const reservation = created.json().reservation;
    // Reserved = min(available, requested) = 12
    assert.equal(reservation.quantity, 12);
    assert.equal(reservation.status, "active");
    assert.equal(countReservations(app, orgId), resBefore + 1);

    // Shortage row was written for the gap (100 - 12 = 88).
    assert.equal(countShortages(app, orgId), shortBefore + 1);
    const shortage = app.db.prepare(`
      SELECT * FROM stock_shortages
      WHERE org_id = ? AND source_id = ? AND reservation_id = ?
    `).get(orgId, "so-shortage-test", reservation.id);
    assert.ok(shortage, "shortage row exists");
    assert.equal(shortage.requested_qty, 100);
    assert.equal(shortage.available_qty, 12);
    assert.equal(shortage.shortage_qty, 88);
    assert.equal(shortage.status, "open");
  } finally {
    await app.close();
  }
});

test("reservations: POST with zero availability throws 422 and still records the shortage", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const orgId = "org-armosphera-demo";
    // Set on-hand to 0 for the scanner.
    app.db.prepare(`
      UPDATE stock_quants SET quantity = 0
      WHERE org_id = ? AND catalog_item_id = ? AND location_id = ?
    `).run(orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse");
    const before = countReservations(app, orgId);
    const shortBefore = countShortages(app, orgId);

    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-zero-availability",
        quantity: 3
      }
    });
    assert.equal(created.statusCode, 422, created.body);
    assert.equal(created.json().code, "stock_shortage");
    // No new reservation was created.
    assert.equal(countReservations(app, orgId), before);
    // Shortage row was still recorded so replenishment sees the demand.
    assert.equal(countShortages(app, orgId), shortBefore + 1);
    const shortage = app.db.prepare(`
      SELECT * FROM stock_shortages
      WHERE org_id = ? AND source_id = ?
    `).get(orgId, "so-zero-availability");
    assert.ok(shortage);
    assert.equal(shortage.requested_qty, 3);
    assert.equal(shortage.available_qty, 0);
    assert.equal(shortage.shortage_qty, 3);
  } finally {
    await app.close();
  }
});

test("reservations: POST with invalid sourceType is rejected at the validator", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "production_order",
        sourceId: "so-bad-source",
        quantity: 1
      }
    });
    assert.equal(created.statusCode, 400, created.body);
  } finally {
    await app.close();
  }
});

test("reservations: POST with non-positive quantity is rejected", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    for (const bad of [0, -1, "abc"]) {
      const r = await app.inject({
        method: "POST",
        url: "/api/inventory/reservations",
        headers: { cookie },
        payload: {
          itemId: "catitem-pos-barcode-scanner",
          locationId: "stockloc-main-warehouse",
          sourceType: "sales_order",
          sourceId: "so-bad-qty",
          quantity: bad
        }
      });
      assert.equal(r.statusCode, 400, `bad qty ${JSON.stringify(bad)} should 400, got ${r.statusCode}`);
    }
  } finally {
    await app.close();
  }
});

test("reservations: release with reason 'manual' transitions active → released", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const orgId = "org-armosphera-demo";
    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-manual-release",
        quantity: 2
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const id = created.json().reservation.id;

    const released = await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${id}/release`,
      headers: { cookie },
      payload: { reason: "manual" }
    });
    assert.equal(released.statusCode, 200, released.body);
    const after = released.json().reservation;
    assert.equal(after.status, "released");
    assert.equal(after.releasedReason, "manual");
    assert.ok(after.releasedAt, "releasedAt timestamp is set");
  } finally {
    await app.close();
  }
});

test("reservations: release with reason 'cancelled' transitions active → cancelled", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-cancel-release",
        quantity: 1
      }
    });
    const id = created.json().reservation.id;
    const released = await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${id}/release`,
      headers: { cookie },
      payload: { reason: "cancelled" }
    });
    assert.equal(released.statusCode, 200, released.body);
    assert.equal(released.json().reservation.status, "cancelled");
    assert.equal(released.json().reservation.releasedReason, "cancelled");
  } finally {
    await app.close();
  }
});

test("reservations: release with reason 'fulfilled' requires a matching stock move", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-fulfilled-release",
        quantity: 2
      }
    });
    const id = created.json().reservation.id;

    // Without a corresponding stock_move, release-as-fulfilled must be rejected.
    const noMove = await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${id}/release`,
      headers: { cookie },
      payload: { reason: "fulfilled" }
    });
    assert.equal(noMove.statusCode, 409, noMove.body);
    assert.equal(noMove.json().code, "stock_reservation_no_move");

    // Now post a delivery move out of the same location and quantity.
    const moved = await app.inject({
      method: "POST",
      url: "/api/inventory/moves",
      headers: { cookie },
      payload: {
        catalogItemId: "catitem-pos-barcode-scanner",
        sourceLocationId: "stockloc-main-warehouse",
        destinationLocationId: "stockloc-customer",
        moveType: "delivery",
        quantity: 2,
        reason: "fulfilling reservation",
        reference: "so-fulfilled-release"
      }
    });
    assert.equal(moved.statusCode, 200, moved.body);

    // Now release as fulfilled should succeed.
    const released = await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${id}/release`,
      headers: { cookie },
      payload: { reason: "fulfilled" }
    });
    assert.equal(released.statusCode, 200, released.body);
    assert.equal(released.json().reservation.status, "released");
    assert.equal(released.json().reservation.releasedReason, "fulfilled");
  } finally {
    await app.close();
  }
});

test("reservations: double-release returns 409 conflict", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-double-release",
        quantity: 1
      }
    });
    const id = created.json().reservation.id;
    const first = await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${id}/release`,
      headers: { cookie },
      payload: { reason: "manual" }
    });
    assert.equal(first.statusCode, 200, first.body);
    const second = await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${id}/release`,
      headers: { cookie },
      payload: { reason: "manual" }
    });
    assert.equal(second.statusCode, 409, second.body);
    assert.equal(second.json().code, "stock_reservation_invalid_transition");
  } finally {
    await app.close();
  }
});

test("reservations: release with invalid reason is rejected", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-bad-reason",
        quantity: 1
      }
    });
    const id = created.json().reservation.id;
    const r = await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${id}/release`,
      headers: { cookie },
      payload: { reason: "something-else" }
    });
    assert.equal(r.statusCode, 400, r.body);
  } finally {
    await app.close();
  }
});

test("reservations: GET /api/inventory/reservations?status=active returns only active rows", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    // Create 2 reservations, release 1.
    const a = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-filter-active-1",
        quantity: 1
      }
    });
    const b = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-filter-active-2",
        quantity: 1
      }
    });
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(b.statusCode, 200, b.body);
    await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${a.json().reservation.id}/release`,
      headers: { cookie },
      payload: { reason: "manual" }
    });
    const all = await app.inject({ method: "GET", url: "/api/inventory/reservations", headers: { cookie } });
    const active = await app.inject({ method: "GET", url: "/api/inventory/reservations?status=active", headers: { cookie } });
    const released = await app.inject({ method: "GET", url: "/api/inventory/reservations?status=released", headers: { cookie } });
    assert.equal(all.statusCode, 200);
    assert.equal(active.statusCode, 200);
    assert.equal(released.statusCode, 200);
    const activeIds = new Set(active.json().reservations.map(r => r.id));
    const releasedIds = new Set(released.json().reservations.map(r => r.id));
    assert.ok(activeIds.has(b.json().reservation.id), "b is active");
    assert.ok(!activeIds.has(a.json().reservation.id), "a is NOT active");
    assert.ok(releasedIds.has(a.json().reservation.id), "a is released");
    assert.ok(!releasedIds.has(b.json().reservation.id), "b is NOT released");
  } finally {
    await app.close();
  }
});

test("shortages: GET /api/inventory/shortages?status=open returns shortage rows", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    // Trigger a shortage.
    const short = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-shortage-list",
        quantity: 999
      }
    });
    assert.equal(short.statusCode, 200, short.body);

    const list = await app.inject({ method: "GET", url: "/api/inventory/shortages?status=open", headers: { cookie } });
    assert.equal(list.statusCode, 200, list.body);
    const rows = list.json().shortages;
    assert.ok(Array.isArray(rows));
    const match = rows.find(s => s.sourceId === "so-shortage-list");
    assert.ok(match, "shortage row visible via GET shortages");
    assert.equal(match.shortageQty, 999 - 12);
    assert.equal(match.status, "open");
  } finally {
    await app.close();
  }
});

test("shortages: GET /api/inventory/shortages is auth-gated and 401s anonymous", async () => {
  const app = await newApp();
  try {
    const unauth = await app.inject({ method: "GET", url: "/api/inventory/shortages" });
    assert.equal(unauth.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("sales-order hook: adding a line with stock-tracked item auto-creates a reservation", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const orgId = "org-armosphera-demo";
    const resBefore = countReservations(app, orgId);
    const shortBefore = countShortages(app, orgId);

    // 1) Create a sales order.
    const order = await app.inject({
      method: "POST",
      url: "/api/sales/orders",
      headers: { cookie },
      payload: {
        customerId: "cust-ani",
        currency: "AMD",
        notes: "phase-1 inventory test"
      }
    });
    assert.equal(order.statusCode, 200, order.body);
    const orderId = order.json().order.id;

    // 2) Add a line for the stock-tracked scanner (on-hand=12, request=3 → full reservation).
    const line = await app.inject({
      method: "POST",
      url: `/api/sales/orders/${orderId}/lines`,
      headers: { cookie },
      payload: {
        catalogItemId: "catitem-pos-barcode-scanner",
        description: "HW-BARCODE-SCANNER (1 unit)",
        quantity: 3,
        unitPriceMinor: 100000,
        vatClass: "standard"
      }
    });
    assert.equal(line.statusCode, 200, line.body);
    const lineId = line.json().line.id;

    // 3) The hook should have created a reservation tied to this order+line.
    assert.equal(countReservations(app, orgId), resBefore + 1);
    const res = app.db.prepare(`
      SELECT * FROM stock_reservations
      WHERE org_id = ? AND source_type = 'sales_order' AND source_id = ?
    `).get(orgId, orderId);
    assert.ok(res, "reservation created by sales-order hook");
    assert.equal(res.item_id, "catitem-pos-barcode-scanner");
    assert.equal(res.location_id, "stockloc-main-warehouse");
    assert.equal(res.quantity, 3);
    assert.equal(res.status, "active");
    // No shortage expected — 3 <= 12.
    assert.equal(countShortages(app, orgId), shortBefore);

    // 4) Add a second line that exceeds stock; this should trigger a partial
    //    reservation and a shortage row.
    const line2 = await app.inject({
      method: "POST",
      url: `/api/sales/orders/${orderId}/lines`,
      headers: { cookie },
      payload: {
        catalogItemId: "catitem-pos-barcode-scanner",
        description: "HW-BARCODE-SCANNER (over-quantity)",
        quantity: 50,
        unitPriceMinor: 100000,
        vatClass: "standard"
      }
    });
    assert.equal(line2.statusCode, 200, line2.body);
    assert.equal(countShortages(app, orgId), shortBefore + 1);
    const short = app.db.prepare(`
      SELECT * FROM stock_shortages
      WHERE org_id = ? AND source_type = 'sales_order' AND source_id = ?
    `).get(orgId, orderId);
    assert.ok(short);
    // After the first reservation of 3, available = 12 - 3 = 9, so 50 - 9 = 41 short.
    assert.equal(short.shortage_qty, 50 - 9);
  } finally {
    await app.close();
  }
});

test("sales-order hook: cancelling a sales order releases all active reservations with reason 'cancelled'", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const orgId = "org-armosphera-demo";
    const order = await app.inject({
      method: "POST",
      url: "/api/sales/orders",
      headers: { cookie },
      payload: { customerId: "cust-ani", currency: "AMD" }
    });
    const orderId = order.json().order.id;
    await app.inject({
      method: "POST",
      url: `/api/sales/orders/${orderId}/lines`,
      headers: { cookie },
      payload: {
        catalogItemId: "catitem-pos-barcode-scanner",
        description: "scanner",
        quantity: 2,
        unitPriceMinor: 50000,
        vatClass: "standard"
      }
    });
    const res = app.db.prepare(`
      SELECT * FROM stock_reservations
      WHERE org_id = ? AND source_type = 'sales_order' AND source_id = ?
    `).get(orgId, orderId);
    assert.ok(res);
    assert.equal(res.status, "active");

    const cancel = await app.inject({
      method: "POST",
      url: `/api/sales/orders/${orderId}/cancel`,
      headers: { cookie }
    });
    assert.equal(cancel.statusCode, 200, cancel.body);

    const after = app.db.prepare(`
      SELECT status, released_reason FROM stock_reservations
      WHERE org_id = ? AND source_type = 'sales_order' AND source_id = ?
    `).get(orgId, orderId);
    assert.equal(after.status, "cancelled");
    assert.equal(after.released_reason, "cancelled");
  } finally {
    await app.close();
  }
});

test("sales-order hook: a line with no catalogItemId does not create a reservation (free-form line)", async () => {
  const app = await newApp();
  try {
    const cookie = await login(app);
    const orgId = "org-armosphera-demo";
    const resBefore = countReservations(app, orgId);
    const order = await app.inject({
      method: "POST",
      url: "/api/sales/orders",
      headers: { cookie },
      payload: { customerId: "cust-ani", currency: "AMD" }
    });
    const orderId = order.json().order.id;
    const line = await app.inject({
      method: "POST",
      url: `/api/sales/orders/${orderId}/lines`,
      headers: { cookie },
      payload: {
        // No catalogItemId — free-form line (e.g. service / labor).
        description: "Consulting services",
        quantity: 1,
        unitPriceMinor: 500000,
        vatClass: "standard"
      }
    });
    assert.equal(line.statusCode, 200, line.body);
    assert.equal(countReservations(app, orgId), resBefore, "no reservation created for free-form line");
  } finally {
    await app.close();
  }
});

test("reservations: auditor (read-only) can list but cannot create or release", async () => {
  const app = await newApp();
  try {
    const owner = await login(app);
    const auditorCookie = await login(app, "auditor@armosphera.local");

    // Owner creates a reservation so the auditor has something to see.
    const created = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie: owner },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-auditor-readonly",
        quantity: 1
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const id = created.json().reservation.id;

    // Auditor can list.
    const list = await app.inject({ method: "GET", url: "/api/inventory/reservations", headers: { cookie: auditorCookie } });
    assert.equal(list.statusCode, 200, list.body);

    // Auditor cannot create.
    const create = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie: auditorCookie },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        sourceType: "sales_order",
        sourceId: "so-auditor-attempt-create",
        quantity: 1
      }
    });
    assert.equal(create.statusCode, 403, create.body);

    // Auditor cannot release.
    const release = await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${id}/release`,
      headers: { cookie: auditorCookie },
      payload: { reason: "manual" }
    });
    assert.equal(release.statusCode, 403, release.body);
  } finally {
    await app.close();
  }
});
