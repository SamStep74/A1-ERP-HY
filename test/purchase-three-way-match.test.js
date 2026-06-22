"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");
const { matchReceipt, matchPrice } = require("../server/purchasing/three-way-match");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email, password }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers["set-cookie"];
}

async function createConfirmedOrder(app, cookie, orderNumber, quantity = 3) {
  const orgId = "org-armosphera-demo";
  const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
  const created = await app.inject({
    method: "POST",
    url: "/api/purchase/orders",
    headers: { cookie },
    payload: {
      vendorId: "vendor-yerevan-hardware-supply",
      orderNumber,
      orderDate: `${openPeriod}-10`,
      expectedDate: `${openPeriod}-15`,
      lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity }]
    }
  });
  assert.equal(created.statusCode, 200, created.body);
  const order = created.json().order;
  const confirmed = await app.inject({
    method: "POST",
    url: `/api/purchase/orders/${order.id}/confirm`,
    headers: { cookie },
    payload: {}
  });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  return { order, openPeriod };
}

test("purchase three-way match: pure receipt and price comparisons classify variance", () => {
  assert.deepEqual(matchReceipt(10, 10), { variance: 0, status: "matched" });
  assert.deepEqual(matchReceipt(10, 9), { variance: -1, status: "under_received" });
  assert.deepEqual(matchReceipt(10, 11), { variance: 1, status: "over_received" });
  assert.deepEqual(matchPrice(100, 100), { variancePct: 0, status: "matched" });
  assert.deepEqual(matchPrice(100, 105), { variancePct: 0.05, status: "price_increase" });
  assert.deepEqual(matchPrice(100, 95), { variancePct: -0.05, status: "price_decrease" });
});

test("purchase three-way match: recompute records under-received receipt matches and filters alerts", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const auditor = await login(app, "auditor@armosphera.local");
    const support = await login(app, "support@armosphera.local");
    const { order, openPeriod } = await createConfirmedOrder(app, operator, "PO-MATCH-RECEIPT", 3);
    const line = order.lines[0];

    const receipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-12`,
        reference: "RCPT-PO-MATCH-RECEIPT-A",
        lines: [{ lineId: line.id, quantity: 2 }]
      }
    });
    assert.equal(receipt.statusCode, 200, receipt.body);

    const unauthenticated = await app.inject({ method: "GET", url: `/api/purchase/orders/${order.id}/match` });
    assert.equal(unauthenticated.statusCode, 401);
    const supportDenied = await app.inject({ method: "GET", url: "/api/purchase/matches/receipts", headers: { cookie: support } });
    assert.equal(supportDenied.statusCode, 403, supportDenied.body);

    const recomputed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/match/recompute`,
      headers: { cookie: operator },
      payload: {}
    });
    assert.equal(recomputed.statusCode, 200, recomputed.body);
    assert.equal(recomputed.json().receiptMatches.length, 1);
    assert.equal(recomputed.json().receiptMatches[0].status, "under_received");
    assert.equal(recomputed.json().receiptMatches[0].orderedQty, 3);
    assert.equal(recomputed.json().receiptMatches[0].receivedQty, 2);
    assert.equal(recomputed.json().receiptMatches[0].varianceQty, -1);
    assert.equal(recomputed.json().billMatches.length, 0);

    const read = await app.inject({ method: "GET", url: `/api/purchase/orders/${order.id}/match`, headers: { cookie: auditor } });
    assert.equal(read.statusCode, 200, read.body);
    assert.equal(read.json().receiptMatches[0].status, "under_received");

    const alerts = await app.inject({ method: "GET", url: "/api/purchase/matches/receipts?variance_min=0.30", headers: { cookie: auditor } });
    assert.equal(alerts.statusCode, 200, alerts.body);
    assert.ok(alerts.json().matches.some(item => item.purchaseOrderId === order.id && item.varianceRatio === -0.333333));

    const filtered = await app.inject({ method: "GET", url: "/api/purchase/matches/receipts?variance_min=0.50", headers: { cookie: auditor } });
    assert.equal(filtered.statusCode, 200, filtered.body);
    assert.ok(!filtered.json().matches.some(item => item.purchaseOrderId === order.id));
  } finally {
    await app.close();
  }
});

test("purchase three-way match: bill recompute records price variance and latest alerts", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const accountant = await login(app, "accountant@armosphera.local");
    const auditor = await login(app, "auditor@armosphera.local");
    const owner = await login(app);
    const orgId = "org-armosphera-demo";
    const { order, openPeriod } = await createConfirmedOrder(app, operator, "PO-MATCH-BILL", 2);
    const line = order.lines[0];

    const receipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-12`,
        reference: "RCPT-PO-MATCH-BILL",
        lines: [{ lineId: line.id, quantity: 2 }]
      }
    });
    assert.equal(receipt.statusCode, 200, receipt.body);

    const billed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/bill`,
      headers: { cookie: accountant },
      payload: {
        billDate: `${openPeriod}-12`,
        dueDate: `${openPeriod}-25`,
        subtotal: 132000,
        vat: 26400
      }
    });
    assert.equal(billed.statusCode, 200, billed.body);
    assert.equal(billed.json().bill.subtotal, 132000);
    assert.equal(billed.json().bill.total, 158400);
    const billId = billed.json().bill.id;

    const recomputed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/match/recompute`,
      headers: { cookie: operator },
      payload: {}
    });
    assert.equal(recomputed.statusCode, 200, recomputed.body);
    assert.equal(recomputed.json().receiptMatches[0].status, "matched");
    assert.equal(recomputed.json().billMatches.length, 1);
    assert.equal(recomputed.json().billMatches[0].status, "price_increase");
    assert.equal(recomputed.json().billMatches[0].orderedUnitCost, 60000);
    assert.equal(recomputed.json().billMatches[0].billedUnitCost, 66000);
    assert.equal(recomputed.json().billMatches[0].variancePct, 0.1);

    const billAlerts = await app.inject({ method: "GET", url: "/api/purchase/matches/bills?variance_min=0.05", headers: { cookie: auditor } });
    assert.equal(billAlerts.statusCode, 200, billAlerts.body);
    assert.ok(billAlerts.json().matches.some(item => item.purchaseOrderId === order.id && item.status === "price_increase"));

    app.db.prepare(`
      UPDATE bills
      SET subtotal = ?, vat = ?, total = ?
      WHERE org_id = ? AND id = ?
    `).run(120000, 24000, 144000, orgId, billId);
    const resolved = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/match/recompute`,
      headers: { cookie: operator },
      payload: {}
    });
    assert.equal(resolved.statusCode, 200, resolved.body);
    assert.equal(resolved.json().billMatches[0].status, "matched");

    const afterResolve = await app.inject({ method: "GET", url: "/api/purchase/matches/bills?variance_min=0.05", headers: { cookie: auditor } });
    assert.equal(afterResolve.statusCode, 200, afterResolve.body);
    assert.ok(!afterResolve.json().matches.some(item => item.purchaseOrderId === order.id), "latest matched row suppresses old alert");

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: owner },
      payload: { note: "Three-way match evidence must restore with purchasing data." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    assert.ok(backup.json().backup.payload.tables.po_receipt_matches.some(item => item.purchase_order_id === order.id));
    assert.ok(backup.json().backup.payload.tables.po_bill_matches.some(item => item.purchase_order_id === order.id));
  } finally {
    await app.close();
  }
});

test("purchase three-way match: invalid variance filters are rejected before query", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const auditor = await login(app, "auditor@armosphera.local");
    const badReceipt = await app.inject({ method: "GET", url: "/api/purchase/matches/receipts?variance_min=bad", headers: { cookie: auditor } });
    assert.equal(badReceipt.statusCode, 400, badReceipt.body);
    const badBill = await app.inject({ method: "GET", url: "/api/purchase/matches/bills?variance_min=-1", headers: { cookie: auditor } });
    assert.equal(badBill.statusCode, 400, badBill.body);
    const blankBill = await app.inject({ method: "GET", url: "/api/purchase/matches/bills?variance_min=%20%20", headers: { cookie: auditor } });
    assert.equal(blankBill.statusCode, 400, blankBill.body);
  } finally {
    await app.close();
  }
});
