"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email, password }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers["set-cookie"];
}

async function createFinishedGood(app, cookie, sku = "MFG-FINISHED-TEST") {
  const response = await app.inject({
    method: "POST",
    url: "/api/catalog/items",
    headers: { cookie },
    payload: {
      categoryId: "catcat-hardware",
      sku,
      name: "Manufactured scanner kit",
      description: "Finished good used by manufacturing tests.",
      itemType: "stockable",
      status: "active",
      unitOfMeasure: "unit",
      listPrice: 190000,
      standardCost: 140000,
      trackStock: true
    }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().item;
}

async function createBom(app, cookie, productItemId, overrides = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/manufacturing/boms",
    headers: { cookie },
    payload: {
      bomNumber: overrides.bomNumber || "BOM-MFG-TEST-1",
      productItemId,
      status: overrides.status || "active",
      quantity: overrides.quantity || 1,
      note: "Manufacturing planning test BoM.",
      lines: overrides.lines || [
        {
          componentItemId: "catitem-pos-barcode-scanner",
          quantity: 2,
          scrapPercent: 0,
          note: "Scanner hardware component"
        }
      ]
    }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().bom;
}

function rowCount(app, table, orgId) {
  return app.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE org_id = ?`).get(orgId).count;
}

function mainStock(app, orgId) {
  return app.db.prepare(`
    SELECT quantity, reserved_quantity AS reservedQuantity, average_cost AS averageCost
    FROM stock_quants
    WHERE org_id = ? AND catalog_item_id = 'catitem-pos-barcode-scanner'
      AND location_id = 'stockloc-main-warehouse'
  `).get(orgId);
}

test("manufacturing: BoMs, work centers, work orders, RBAC, release, cancel, and backup scope", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const auditor = await login(app, "auditor@armosphera.local");
    const support = await login(app, "support@armosphera.local");
    const orgId = "org-armosphera-demo";

    const unauthenticated = await app.inject({ method: "GET", url: "/api/manufacturing/boms" });
    assert.equal(unauthenticated.statusCode, 401);

    const supportDenied = await app.inject({
      method: "GET",
      url: "/api/manufacturing/work-centers",
      headers: { cookie: support }
    });
    assert.equal(supportDenied.statusCode, 403, supportDenied.body);

    const auditorRead = await app.inject({
      method: "GET",
      url: "/api/manufacturing/work-centers",
      headers: { cookie: auditor }
    });
    assert.equal(auditorRead.statusCode, 200, auditorRead.body);
    assert.ok(auditorRead.json().workCenters.some(center => center.id === "mfgwc-main-workshop"));

    const auditorWrite = await app.inject({
      method: "POST",
      url: "/api/manufacturing/work-centers",
      headers: { cookie: auditor },
      payload: { code: "MFG/AUDIT", name: "Auditor should not write" }
    });
    assert.equal(auditorWrite.statusCode, 403, auditorWrite.body);

    const finished = await createFinishedGood(app, owner);
    const before = {
      stockMoves: rowCount(app, "stock_moves", orgId),
      stock: mainStock(app, orgId),
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE 'manufacturing.%'").get(orgId).count,
      events: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE 'manufacturing.%'").get(orgId).count
    };

    const invalidComponent = await app.inject({
      method: "POST",
      url: "/api/manufacturing/boms",
      headers: { cookie: owner },
      payload: {
        bomNumber: "BOM-MFG-BAD-COMPONENT",
        productItemId: finished.id,
        status: "active",
        quantity: 1,
        lines: [{ componentItemId: "catitem-clinic-retention-package", quantity: 1 }]
      }
    });
    assert.equal(invalidComponent.statusCode, 422, invalidComponent.body);
    assert.equal(rowCount(app, "mfg_boms", orgId), 0);

    const duplicateComponent = await app.inject({
      method: "POST",
      url: "/api/manufacturing/boms",
      headers: { cookie: owner },
      payload: {
        bomNumber: "BOM-MFG-DUPLICATE-COMPONENT",
        productItemId: finished.id,
        status: "active",
        quantity: 1,
        lines: [
          { componentItemId: "catitem-pos-barcode-scanner", quantity: 8 },
          { componentItemId: "catitem-pos-barcode-scanner", quantity: 8 }
        ]
      }
    });
    assert.equal(duplicateComponent.statusCode, 400, duplicateComponent.body);
    assert.equal(rowCount(app, "mfg_boms", orgId), 0);

    const bom = await createBom(app, owner, finished.id);
    assert.match(bom.id, /^mfg-bom-/);
    assert.equal(bom.bomNumber, "BOM-MFG-TEST-1");
    assert.equal(bom.revision, 1);
    assert.equal(bom.status, "active");
    assert.equal(bom.lineCount, 1);
    assert.equal(bom.lines[0].componentSku, "HW-BARCODE-SCANNER");
    assert.equal(bom.lines[0].plannedQuantity, 2);
    assert.equal(bom.estimatedUnitCost, 124000);

    const versioned = await app.inject({
      method: "POST",
      url: `/api/manufacturing/boms/${bom.id}/version`,
      headers: { cookie: owner },
      payload: {
        status: "active",
        quantity: 1,
        lines: [{ componentItemId: "catitem-pos-barcode-scanner", quantity: 3 }]
      }
    });
    assert.equal(versioned.statusCode, 200, versioned.body);
    assert.equal(versioned.json().bom.revision, 2);
    assert.equal(versioned.json().bom.lines[0].quantity, 3);
    assert.equal(app.db.prepare("SELECT status FROM mfg_boms WHERE org_id = ? AND id = ?").get(orgId, bom.id).status, "archived");

    const readyOrder = await app.inject({
      method: "POST",
      url: "/api/manufacturing/work-orders",
      headers: { cookie: owner },
      payload: {
        workOrderNumber: "MO-MFG-READY-1",
        bomId: versioned.json().bom.id,
        plannedQuantity: 2,
        dueDate: "2026-06-30",
        note: "Ready manufacturing order"
      }
    });
    assert.equal(readyOrder.statusCode, 200, readyOrder.body);
    const workOrder = readyOrder.json().workOrder;
    assert.equal(workOrder.status, "planned");
    assert.equal(workOrder.bomRevision, 2);
    assert.equal(workOrder.materials.length, 1);
    assert.equal(workOrder.materials[0].requiredQuantity, 6);
    assert.equal(workOrder.materials[0].availableQuantity, 12);
    assert.equal(workOrder.materials[0].shortageQuantity, 0);
    assert.equal(workOrder.materialReady, true);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves, "planned work order must not post stock moves");

    const listed = await app.inject({
      method: "GET",
      url: "/api/manufacturing/work-orders?status=planned",
      headers: { cookie: auditor }
    });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.ok(listed.json().workOrders.some(item => item.id === workOrder.id));

    const invalidBomStatus = await app.inject({
      method: "GET",
      url: "/api/manufacturing/boms?status=inactive",
      headers: { cookie: auditor }
    });
    assert.equal(invalidBomStatus.statusCode, 400, invalidBomStatus.body);
    const invalidWorkCenterStatus = await app.inject({
      method: "GET",
      url: "/api/manufacturing/work-centers?status=planned",
      headers: { cookie: auditor }
    });
    assert.equal(invalidWorkCenterStatus.statusCode, 400, invalidWorkCenterStatus.body);

    app.db.prepare(`
      UPDATE stock_quants
      SET quantity = ?
      WHERE org_id = ? AND catalog_item_id = 'catitem-pos-barcode-scanner'
        AND location_id = 'stockloc-main-warehouse'
    `).run(5, orgId);
    const staleShortageRelease = await app.inject({
      method: "POST",
      url: `/api/manufacturing/work-orders/${workOrder.id}/release`,
      headers: { cookie: owner },
      payload: {}
    });
    assert.equal(staleShortageRelease.statusCode, 409, staleShortageRelease.body);
    const shortageSnapshot = await app.inject({
      method: "GET",
      url: `/api/manufacturing/work-orders/${workOrder.id}`,
      headers: { cookie: auditor }
    });
    assert.equal(shortageSnapshot.statusCode, 200, shortageSnapshot.body);
    assert.equal(shortageSnapshot.json().workOrder.materials[0].availableQuantity, 5);
    assert.equal(shortageSnapshot.json().workOrder.materials[0].shortageQuantity, 1);
    app.db.prepare(`
      UPDATE stock_quants
      SET quantity = ?, reserved_quantity = ?
      WHERE org_id = ? AND catalog_item_id = 'catitem-pos-barcode-scanner'
        AND location_id = 'stockloc-main-warehouse'
    `).run(before.stock.quantity, before.stock.reservedQuantity, orgId);

    const liveReservation = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie: owner },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        quantity: 12,
        sourceType: "sales_order",
        sourceId: "mfg-live-reservation-test"
      }
    });
    assert.equal(liveReservation.statusCode, 200, liveReservation.body);
    const liveReservationId = liveReservation.json().reservation.id;
    const reservationBlockedRelease = await app.inject({
      method: "POST",
      url: `/api/manufacturing/work-orders/${workOrder.id}/release`,
      headers: { cookie: owner },
      payload: {}
    });
    assert.equal(reservationBlockedRelease.statusCode, 409, reservationBlockedRelease.body);
    const reservedSnapshot = await app.inject({
      method: "GET",
      url: `/api/manufacturing/work-orders/${workOrder.id}`,
      headers: { cookie: auditor }
    });
    assert.equal(reservedSnapshot.statusCode, 200, reservedSnapshot.body);
    assert.equal(reservedSnapshot.json().workOrder.materials[0].availableQuantity, 0);
    assert.equal(reservedSnapshot.json().workOrder.materials[0].shortageQuantity, 6);
    const reservationReleased = await app.inject({
      method: "POST",
      url: `/api/inventory/reservations/${liveReservationId}/release`,
      headers: { cookie: owner },
      payload: { reason: "cancelled" }
    });
    assert.equal(reservationReleased.statusCode, 200, reservationReleased.body);
    assert.equal(reservationReleased.json().reservation.status, "cancelled");

    const released = await app.inject({
      method: "POST",
      url: `/api/manufacturing/work-orders/${workOrder.id}/release`,
      headers: { cookie: owner },
      payload: {}
    });
    assert.equal(released.statusCode, 200, released.body);
    assert.equal(released.json().workOrder.status, "released");
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves, "release is planning-only in v1");
    assert.deepEqual(mainStock(app, orgId), before.stock);

    const repeatRelease = await app.inject({
      method: "POST",
      url: `/api/manufacturing/work-orders/${workOrder.id}/release`,
      headers: { cookie: owner },
      payload: {}
    });
    assert.equal(repeatRelease.statusCode, 200, repeatRelease.body);
    assert.equal(repeatRelease.json().idempotent, true);

    const shortOrder = await app.inject({
      method: "POST",
      url: "/api/manufacturing/work-orders",
      headers: { cookie: owner },
      payload: {
        workOrderNumber: "MO-MFG-SHORT-1",
        bomId: versioned.json().bom.id,
        plannedQuantity: 10
      }
    });
    assert.equal(shortOrder.statusCode, 200, shortOrder.body);
    assert.equal(shortOrder.json().workOrder.materialReady, false);
    assert.equal(shortOrder.json().workOrder.materials[0].shortageQuantity, 18);

    const shortRelease = await app.inject({
      method: "POST",
      url: `/api/manufacturing/work-orders/${shortOrder.json().workOrder.id}/release`,
      headers: { cookie: owner },
      payload: {}
    });
    assert.equal(shortRelease.statusCode, 409, shortRelease.body);

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/manufacturing/work-orders/${shortOrder.json().workOrder.id}/cancel`,
      headers: { cookie: owner },
      payload: { reason: "Material shortage reviewed." }
    });
    assert.equal(cancelled.statusCode, 200, cancelled.body);
    assert.equal(cancelled.json().workOrder.status, "cancelled");
    const repeatCancel = await app.inject({
      method: "POST",
      url: `/api/manufacturing/work-orders/${shortOrder.json().workOrder.id}/cancel`,
      headers: { cookie: owner },
      payload: {}
    });
    assert.equal(repeatCancel.statusCode, 200, repeatCancel.body);
    assert.equal(repeatCancel.json().idempotent, true);

    const board = await app.inject({
      method: "GET",
      url: "/api/manufacturing/shop-floor",
      headers: { cookie: auditor }
    });
    assert.equal(board.statusCode, 200, board.body);
    assert.ok(board.json().board.some(lane => lane.workOrders.some(item => item.id === workOrder.id)));

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: owner },
      payload: { note: "Manufacturing planning tables must restore with work order evidence." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    const tables = backup.json().backup.payload.tables;
    assert.ok(tables.mfg_work_centers.some(center => center.id === "mfgwc-main-workshop"));
    assert.ok(tables.mfg_boms.some(item => item.id === versioned.json().bom.id));
    assert.ok(tables.mfg_bom_lines.some(line => line.bom_id === versioned.json().bom.id));
    assert.ok(tables.mfg_work_orders.some(order => order.id === workOrder.id && order.status === "released"));
    assert.ok(tables.mfg_work_order_materials.some(material => material.work_order_id === workOrder.id));
    assert.ok(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE 'manufacturing.%'").get(orgId).count > before.audits);
    assert.ok(app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE 'manufacturing.%'").get(orgId).count > before.events);
  } finally {
    await app.close();
  }
});
