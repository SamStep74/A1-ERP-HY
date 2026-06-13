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

function rowCount(app, table, orgId) {
  return app.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE org_id = ?`).get(orgId).count;
}

function stockQuantity(app, orgId, catalogItemId, locationId) {
  const row = app.db.prepare(`
    SELECT quantity, average_cost AS averageCost
    FROM stock_quants
    WHERE org_id = ? AND catalog_item_id = ? AND location_id = ?
  `).get(orgId, catalogItemId, locationId);
  return row || { quantity: 0, averageCost: 0 };
}

test("purchase: RFQ -> confirmed PO -> stock receipt -> vendor bill", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app, "operator@armosphera.local");
    const accountantCookie = await login(app, "accountant@armosphera.local");
    const ownerCookie = await login(app);
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const before = {
      purchaseOrders: rowCount(app, "purchase_orders", orgId),
      purchaseLines: rowCount(app, "purchase_order_lines", orgId),
      purchaseReturns: rowCount(app, "purchase_returns", orgId),
      stockMoves: rowCount(app, "stock_moves", orgId),
      bills: rowCount(app, "bills", orgId),
      billAudits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "finance.bill.created").count,
      purchaseEvents: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE ?").get(orgId, "purchase.order.%").count,
      purchaseAudits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get(orgId, "purchase.order.%").count,
      mainStock: stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse")
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie },
      payload: {
        orderNumber: "PO-ARM-0001",
        supplier: "Yerevan Hardware Supply",
        supplierTaxId: "01234568",
        orderDate: `${openPeriod}-07`,
        expectedDate: `${openPeriod}-09`,
        note: "Barcode scanners for Armenian retail pilots.",
        lines: [
          {
            catalogItemId: "catitem-pos-barcode-scanner",
            quantity: 2,
            unitCost: 60000,
            description: "POS barcode scanner replenishment"
          }
        ]
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const order = created.json().order;
    assert.match(order.id, /^po-/);
    assert.equal(order.orderNumber, "PO-ARM-0001");
    assert.equal(order.status, "rfq");
    assert.equal(order.supplier, "Yerevan Hardware Supply");
    assert.equal(order.supplierTaxId, "01234568");
    assert.equal(order.subtotal, 120000);
    assert.equal(order.vat, 24000);
    assert.equal(order.total, 144000);
    assert.equal(order.lines.length, 1);
    assert.equal(order.lines[0].catalogSku, "HW-BARCODE-SCANNER");
    assert.equal(order.lines[0].receivedQuantity, 0);
    assert.equal(rowCount(app, "purchase_orders", orgId), before.purchaseOrders + 1);
    assert.equal(rowCount(app, "purchase_order_lines", orgId), before.purchaseLines + 1);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie },
      payload: {
        orderNumber: "PO-ARM-0001",
        supplier: "Yerevan Hardware Supply",
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1, unitCost: 60000 }]
      }
    });
    assert.equal(duplicate.statusCode, 409, duplicate.body);
    assert.equal(rowCount(app, "purchase_orders", orgId), before.purchaseOrders + 1);
    assert.equal(rowCount(app, "purchase_order_lines", orgId), before.purchaseLines + 1);

    const listed = await app.inject({ method: "GET", url: "/api/purchase/orders", headers: { cookie } });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.ok(listed.json().orders.some(item => item.id === order.id && item.lines.length === 1));

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/confirm`,
      headers: { cookie },
      payload: {}
    });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    assert.equal(confirmed.json().order.status, "confirmed");

    const received = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie },
      payload: {
        receivedAt: `${openPeriod}-09`,
        reference: "RCPT-PO-ARM-0001"
      }
    });
    assert.equal(received.statusCode, 200, received.body);
    const receivedBody = received.json();
    assert.equal(receivedBody.order.status, "received");
    assert.equal(receivedBody.order.receiptReference, "RCPT-PO-ARM-0001");
    assert.equal(receivedBody.order.billId, "");
    assert.equal(receivedBody.stockMoves.length, 1);
    assert.equal(receivedBody.stockMoves[0].moveType, "receipt");
    assert.equal(receivedBody.stockMoves[0].sourceLocationCode, "SUPPLIERS");
    assert.equal(receivedBody.stockMoves[0].destinationLocationCode, "WH/STOCK");
    assert.equal(receivedBody.stockMoves[0].quantity, 2);
    assert.equal(receivedBody.stockMoves[0].unitCost, 60000);
    assert.equal(receivedBody.order.lines[0].receivedQuantity, 2);
    assert.equal(receivedBody.order.lines[0].stockMoveId, receivedBody.stockMoves[0].id);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);
    assert.equal(rowCount(app, "bills", orgId), before.bills);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "finance.bill.created").count, before.billAudits);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE ?").get(orgId, "purchase.order.%").count, before.purchaseEvents + 3);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get(orgId, "purchase.order.%").count, before.purchaseAudits + 3);
    assert.equal(stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity, before.mainStock.quantity + 2);

    const billed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/bill`,
      headers: { cookie: accountantCookie },
      payload: {
        billDate: `${openPeriod}-09`,
        dueDate: `${openPeriod}-24`,
        description: "Supplier invoice for PO-ARM-0001"
      }
    });
    assert.equal(billed.statusCode, 200, billed.body);
    const billedBody = billed.json();
    assert.equal(billedBody.order.status, "billed");
    assert.equal(billedBody.order.billId, billedBody.bill.id);
    assert.equal(billedBody.bill.supplier, "Yerevan Hardware Supply");
    assert.equal(billedBody.bill.subtotal, 120000);
    assert.equal(billedBody.bill.vat, 24000);
    assert.equal(billedBody.bill.total, 144000);
    assert.equal(rowCount(app, "bills", orgId), before.bills + 1);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "finance.bill.created").count, before.billAudits + 1);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE ?").get(orgId, "purchase.order.%").count, before.purchaseEvents + 4);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get(orgId, "purchase.order.%").count, before.purchaseAudits + 4);

    const payables = await app.inject({ method: "GET", url: `/api/finance/payables?asOf=${openPeriod}-30`, headers: { cookie } });
    assert.equal(payables.statusCode, 200, payables.body);
    assert.ok(payables.json().bills.some(bill => bill.id === billedBody.bill.id && bill.outstanding === 144000));

    const repeatedReceive = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie },
      payload: { receivedAt: `${openPeriod}-09`, reference: "RCPT-PO-ARM-0001" }
    });
    assert.equal(repeatedReceive.statusCode, 200, repeatedReceive.body);
    assert.equal(repeatedReceive.json().idempotent, true);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);
    assert.equal(rowCount(app, "bills", orgId), before.bills + 1);
    const repeatedBill = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/bill`,
      headers: { cookie: accountantCookie },
      payload: { billDate: `${openPeriod}-09`, dueDate: `${openPeriod}-24` }
    });
    assert.equal(repeatedBill.statusCode, 200, repeatedBill.body);
    assert.equal(repeatedBill.json().idempotent, true);
    assert.equal(rowCount(app, "bills", orgId), before.bills + 1);
    const repeatedConfirm = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/confirm`,
      headers: { cookie },
      payload: {}
    });
    assert.equal(repeatedConfirm.statusCode, 200, repeatedConfirm.body);
    assert.equal(repeatedConfirm.json().idempotent, true);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);
    assert.equal(rowCount(app, "bills", orgId), before.bills + 1);

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: ownerCookie },
      payload: { note: "Purchase orders must restore with stock and AP evidence." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    const backupTables = backup.json().backup.payload.tables;
    assert.ok(backupTables.purchase_orders.some(item => item.id === order.id && item.bill_id === billedBody.bill.id));
    assert.ok(backupTables.purchase_order_lines.some(item => item.purchase_order_id === order.id && item.stock_move_id === receivedBody.stockMoves[0].id));
    assert.ok(backupTables.purchase_receipts.some(item => item.purchase_order_id === order.id && item.stock_move_id === receivedBody.stockMoves[0].id));
    assert.ok(backupTables.purchase_vendors.some(item => item.id === "vendor-yerevan-hardware-supply"));
    assert.ok(backupTables.purchase_vendor_prices.some(item => item.vendor_id === "vendor-yerevan-hardware-supply"));
    assert.ok(backupTables.bills.some(item => item.id === billedBody.bill.id && item.total === 144000));
    assert.ok(Array.isArray(backupTables.bill_payments));
  } finally {
    await app.close();
  }
});

test("purchase: partial receipts accumulate stock evidence before final billing", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operatorCookie = await login(app, "operator@armosphera.local");
    const accountantCookie = await login(app, "accountant@armosphera.local");
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const before = {
      stockMoves: rowCount(app, "stock_moves", orgId),
      purchaseReceipts: rowCount(app, "purchase_receipts", orgId),
      bills: rowCount(app, "bills", orgId),
      mainStock: stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity,
      partialEvents: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type = ?").get(orgId, "purchase.order.partially_received").count
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: operatorCookie },
      payload: {
        orderNumber: "PO-PARTIAL-0001",
        supplier: "Yerevan Hardware Supply",
        supplierTaxId: "01234568",
        orderDate: `${openPeriod}-06`,
        expectedDate: `${openPeriod}-10`,
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 3, unitCost: 60000 }]
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const order = created.json().order;
    const line = order.lines[0];

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/confirm`,
      headers: { cookie: operatorCookie },
      payload: {}
    });
    assert.equal(confirmed.statusCode, 200, confirmed.body);

    const firstReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operatorCookie },
      payload: {
        receivedAt: `${openPeriod}-10`,
        reference: "RCPT-PO-PARTIAL-0001-A",
        lines: [{ lineId: line.id, quantity: 1 }]
      }
    });
    assert.equal(firstReceipt.statusCode, 200, firstReceipt.body);
    const firstReceiptBody = firstReceipt.json();
    assert.equal(firstReceiptBody.order.status, "partial");
    assert.equal(firstReceiptBody.order.receivedQuantity, 1);
    assert.equal(firstReceiptBody.order.remainingQuantity, 2);
    assert.equal(firstReceiptBody.order.lines[0].receivedQuantity, 1);
    assert.equal(firstReceiptBody.order.lines[0].remainingQuantity, 2);
    assert.equal(firstReceiptBody.order.lines[0].receipts.length, 1);
    assert.equal(firstReceiptBody.stockMoves.length, 1);
    assert.equal(firstReceiptBody.stockMoves[0].quantity, 1);
    assert.equal(firstReceiptBody.receipts[0].quantity, 1);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.purchaseReceipts + 1);
    assert.equal(stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity, before.mainStock + 1);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type = ?").get(orgId, "purchase.order.partially_received").count, before.partialEvents + 1);

    const duplicateReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operatorCookie },
      payload: {
        receivedAt: `${openPeriod}-10`,
        reference: "RCPT-PO-PARTIAL-0001-A",
        lines: [{ lineId: line.id, quantity: 1 }]
      }
    });
    assert.equal(duplicateReceipt.statusCode, 200, duplicateReceipt.body);
    assert.equal(duplicateReceipt.json().idempotent, true);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.purchaseReceipts + 1);

    const conflictingDuplicateReference = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operatorCookie },
      payload: {
        receivedAt: `${openPeriod}-10`,
        reference: "RCPT-PO-PARTIAL-0001-A",
        lines: [{ lineId: line.id, quantity: 2 }]
      }
    });
    assert.equal(conflictingDuplicateReference.statusCode, 409, conflictingDuplicateReference.body);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.purchaseReceipts + 1);

    const billWhilePartial = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/bill`,
      headers: { cookie: accountantCookie },
      payload: { billDate: `${openPeriod}-10`, dueDate: `${openPeriod}-24` }
    });
    assert.equal(billWhilePartial.statusCode, 409, billWhilePartial.body);
    assert.equal(rowCount(app, "bills", orgId), before.bills);

    const overReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operatorCookie },
      payload: {
        receivedAt: `${openPeriod}-11`,
        reference: "RCPT-PO-PARTIAL-0001-OVER",
        lines: [{ lineId: line.id, quantity: 3 }]
      }
    });
    assert.equal(overReceipt.statusCode, 409, overReceipt.body);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.purchaseReceipts + 1);

    const repeatedConfirm = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/confirm`,
      headers: { cookie: operatorCookie },
      payload: {}
    });
    assert.equal(repeatedConfirm.statusCode, 200, repeatedConfirm.body);
    assert.equal(repeatedConfirm.json().idempotent, true);

    const finalReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operatorCookie },
      payload: {
        receivedAt: `${openPeriod}-12`,
        reference: "RCPT-PO-PARTIAL-0001-B",
        lines: [{ purchaseOrderLineId: line.id, quantity: 2 }]
      }
    });
    assert.equal(finalReceipt.statusCode, 200, finalReceipt.body);
    const finalReceiptBody = finalReceipt.json();
    assert.equal(finalReceiptBody.order.status, "received");
    assert.equal(finalReceiptBody.order.receivedQuantity, 3);
    assert.equal(finalReceiptBody.order.remainingQuantity, 0);
    assert.equal(finalReceiptBody.order.lines[0].receipts.length, 2);
    assert.equal(finalReceiptBody.stockMoves[0].quantity, 2);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 2);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.purchaseReceipts + 2);
    assert.equal(stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity, before.mainStock + 3);

    const billed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/bill`,
      headers: { cookie: accountantCookie },
      payload: {
        billDate: `${openPeriod}-12`,
        dueDate: `${openPeriod}-24`,
        description: "Supplier invoice after full partial-receipt completion"
      }
    });
    assert.equal(billed.statusCode, 200, billed.body);
    assert.equal(billed.json().order.status, "billed");
    assert.equal(billed.json().bill.total, 216000);
  } finally {
    await app.close();
  }
});

test("purchase: partial receipts preserve receipt evidence and block billing until complete", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const accountant = await login(app, "accountant@armosphera.local");
    const owner = await login(app);
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const before = {
      stockMoves: rowCount(app, "stock_moves", orgId),
      receipts: rowCount(app, "purchase_receipts", orgId),
      bills: rowCount(app, "bills", orgId),
      events: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE ?").get(orgId, "purchase.order.%").count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get(orgId, "purchase.order.%").count,
      mainStock: stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse")
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: operator },
      payload: {
        orderNumber: "PO-PARTIAL-0001",
        supplier: "Yerevan Hardware Supply",
        supplierTaxId: "01234568",
        orderDate: `${openPeriod}-10`,
        expectedDate: `${openPeriod}-15`,
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 5, unitCost: 60000 }]
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const order = created.json().order;
    const line = order.lines[0];

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/confirm`,
      headers: { cookie: operator },
      payload: {}
    });
    assert.equal(confirmed.statusCode, 200, confirmed.body);

    const firstReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-11`,
        reference: "RCPT-PO-PARTIAL-1",
        lines: [{ lineId: line.id, quantity: 2 }]
      }
    });
    assert.equal(firstReceipt.statusCode, 200, firstReceipt.body);
    const firstBody = firstReceipt.json();
    assert.equal(firstBody.order.status, "partial");
    assert.equal(firstBody.order.receivedQuantity, 2);
    assert.equal(firstBody.order.remainingQuantity, 3);
    assert.equal(firstBody.order.lines[0].receivedQuantity, 2);
    assert.equal(firstBody.order.lines[0].remainingQuantity, 3);
    assert.equal(firstBody.order.lines[0].receipts.length, 1);
    assert.equal(firstBody.receipts.length, 1);
    assert.equal(firstBody.receipts[0].quantity, 2);
    assert.equal(firstBody.stockMoves.length, 1);
    assert.equal(firstBody.stockMoves[0].quantity, 2);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.receipts + 1);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);
    assert.equal(stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity, before.mainStock.quantity + 2);

    const duplicateFirstReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-11`,
        reference: "RCPT-PO-PARTIAL-1",
        lines: [{ lineId: line.id, quantity: 2 }]
      }
    });
    assert.equal(duplicateFirstReceipt.statusCode, 200, duplicateFirstReceipt.body);
    assert.equal(duplicateFirstReceipt.json().idempotent, true);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.receipts + 1);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);

    const overReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-12`,
        reference: "RCPT-PO-PARTIAL-OVER",
        lines: [{ lineId: line.id, quantity: 4 }]
      }
    });
    assert.equal(overReceipt.statusCode, 409, overReceipt.body);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.receipts + 1);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 1);

    const earlyBill = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/bill`,
      headers: { cookie: accountant },
      payload: { billDate: `${openPeriod}-12`, dueDate: `${openPeriod}-20` }
    });
    assert.equal(earlyBill.statusCode, 409, earlyBill.body);
    assert.equal(rowCount(app, "bills", orgId), before.bills);

    const finalReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-12`,
        reference: "RCPT-PO-PARTIAL-2",
        lines: [{ lineId: line.id, quantity: 3 }]
      }
    });
    assert.equal(finalReceipt.statusCode, 200, finalReceipt.body);
    const finalBody = finalReceipt.json();
    assert.equal(finalBody.order.status, "received");
    assert.equal(finalBody.order.receivedQuantity, 5);
    assert.equal(finalBody.order.remainingQuantity, 0);
    assert.equal(finalBody.order.receiptCount, 2);
    assert.equal(finalBody.order.lines[0].receipts.length, 2);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.receipts + 2);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 2);
    assert.equal(stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity, before.mainStock.quantity + 5);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE ?").get(orgId, "purchase.order.%").count, before.events + 4);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get(orgId, "purchase.order.%").count, before.audits + 4);

    const billed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/bill`,
      headers: { cookie: accountant },
      payload: { billDate: `${openPeriod}-12`, dueDate: `${openPeriod}-20` }
    });
    assert.equal(billed.statusCode, 200, billed.body);
    assert.equal(billed.json().bill.total, 360000);

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: owner },
      payload: { note: "Partial purchase receipts must restore with stock evidence." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    const backupTables = backup.json().backup.payload.tables;
    assert.ok(backupTables.purchase_receipts.some(item => item.purchase_order_id === order.id && item.quantity === 2));
    assert.ok(backupTables.purchase_receipts.some(item => item.purchase_order_id === order.id && item.quantity === 3));
    assert.ok(backupTables.purchase_order_lines.some(item => item.purchase_order_id === order.id && item.received_quantity === 5));
  } finally {
    await app.close();
  }
});

test("purchase: supplier returns reverse stock evidence before billing", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const accountant = await login(app, "accountant@armosphera.local");
    const owner = await login(app);
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const before = {
      stockMoves: rowCount(app, "stock_moves", orgId),
      receipts: rowCount(app, "purchase_receipts", orgId),
      returns: rowCount(app, "purchase_returns", orgId),
      bills: rowCount(app, "bills", orgId),
      events: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE ?").get(orgId, "purchase.order.%").count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get(orgId, "purchase.order.%").count,
      mainStock: stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: operator },
      payload: {
        orderNumber: "PO-RETURN-0001",
        supplier: "Yerevan Hardware Supply",
        supplierTaxId: "01234568",
        orderDate: `${openPeriod}-10`,
        expectedDate: `${openPeriod}-12`,
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 4, unitCost: 60000 }]
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const order = created.json().order;
    const line = order.lines[0];

    const confirmed = await app.inject({ method: "POST", url: `/api/purchase/orders/${order.id}/confirm`, headers: { cookie: operator }, payload: {} });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    const received = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-12`,
        reference: "RCPT-PO-RETURN-0001",
        lines: [{ lineId: line.id, quantity: 4 }]
      }
    });
    assert.equal(received.statusCode, 200, received.body);
    assert.equal(received.json().order.status, "received");
    assert.equal(stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity, before.mainStock + 4);

    const returned = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/return`,
      headers: { cookie: operator },
      payload: {
        returnedAt: `${openPeriod}-13`,
        reference: "RTN-PO-RETURN-0001-A",
        reason: "One scanner failed incoming quality check.",
        lines: [{ lineId: line.id, quantity: 1 }]
      }
    });
    assert.equal(returned.statusCode, 200, returned.body);
    const returnedBody = returned.json();
    assert.equal(returnedBody.order.status, "partial");
    assert.equal(returnedBody.order.receivedQuantity, 3);
    assert.equal(returnedBody.order.returnedQuantity, 1);
    assert.equal(returnedBody.order.remainingQuantity, 1);
    assert.equal(returnedBody.order.returnCount, 1);
    assert.equal(returnedBody.order.lines[0].receivedQuantity, 3);
    assert.equal(returnedBody.order.lines[0].returnedQuantity, 1);
    assert.equal(returnedBody.order.lines[0].returnableQuantity, 3);
    assert.equal(returnedBody.order.lines[0].returns.length, 1);
    assert.equal(returnedBody.returns[0].quantity, 1);
    assert.equal(returnedBody.returns[0].reason, "One scanner failed incoming quality check.");
    assert.equal(returnedBody.stockMoves[0].moveType, "return");
    assert.equal(returnedBody.stockMoves[0].sourceLocationCode, "WH/STOCK");
    assert.equal(returnedBody.stockMoves[0].destinationLocationCode, "SUPPLIERS");
    assert.equal(returnedBody.stockMoves[0].quantity, 1);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 2);
    assert.equal(rowCount(app, "purchase_receipts", orgId), before.receipts + 1);
    assert.equal(rowCount(app, "purchase_returns", orgId), before.returns + 1);
    assert.equal(stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity, before.mainStock + 3);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE ?").get(orgId, "purchase.order.%").count, before.events + 4);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get(orgId, "purchase.order.%").count, before.audits + 4);

    const duplicateReturn = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/return`,
      headers: { cookie: operator },
      payload: {
        returnedAt: `${openPeriod}-13`,
        reference: "RTN-PO-RETURN-0001-A",
        reason: "One scanner failed incoming quality check.",
        lines: [{ lineId: line.id, quantity: 1 }]
      }
    });
    assert.equal(duplicateReturn.statusCode, 200, duplicateReturn.body);
    assert.equal(duplicateReturn.json().idempotent, true);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 2);
    assert.equal(rowCount(app, "purchase_returns", orgId), before.returns + 1);

    const conflictingReturn = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/return`,
      headers: { cookie: operator },
      payload: {
        returnedAt: `${openPeriod}-13`,
        reference: "RTN-PO-RETURN-0001-A",
        reason: "Changed evidence should not rewrite the return.",
        lines: [{ lineId: line.id, quantity: 1 }]
      }
    });
    assert.equal(conflictingReturn.statusCode, 409, conflictingReturn.body);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 2);
    assert.equal(rowCount(app, "purchase_returns", orgId), before.returns + 1);

    const overReturn = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/return`,
      headers: { cookie: operator },
      payload: {
        returnedAt: `${openPeriod}-14`,
        reference: "RTN-PO-RETURN-0001-OVER",
        reason: "Cannot return more than net received.",
        lines: [{ lineId: line.id, quantity: 4 }]
      }
    });
    assert.equal(overReturn.statusCode, 409, overReturn.body);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 2);
    assert.equal(rowCount(app, "purchase_returns", orgId), before.returns + 1);

    const fullReturn = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/return`,
      headers: { cookie: operator },
      payload: {
        returnedAt: `${openPeriod}-14`,
        reference: "RTN-PO-RETURN-0001-FULL",
        reason: "Return all remaining received units before replacement shipment.",
        lines: [{ lineId: line.id, quantity: 3 }]
      }
    });
    assert.equal(fullReturn.statusCode, 200, fullReturn.body);
    assert.equal(fullReturn.json().order.status, "confirmed");
    assert.equal(fullReturn.json().order.receivedQuantity, 0);
    assert.equal(fullReturn.json().order.returnedQuantity, 4);
    assert.equal(stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity, before.mainStock);

    const duplicateFullReturn = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/return`,
      headers: { cookie: operator },
      payload: {
        returnedAt: `${openPeriod}-14`,
        reference: "RTN-PO-RETURN-0001-FULL",
        reason: "Return all remaining received units before replacement shipment.",
        lines: [{ lineId: line.id, quantity: 3 }]
      }
    });
    assert.equal(duplicateFullReturn.statusCode, 200, duplicateFullReturn.body);
    assert.equal(duplicateFullReturn.json().idempotent, true);
    assert.equal(rowCount(app, "stock_moves", orgId), before.stockMoves + 3);
    assert.equal(rowCount(app, "purchase_returns", orgId), before.returns + 2);

    const earlyBill = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/bill`,
      headers: { cookie: accountant },
      payload: { billDate: `${openPeriod}-14`, dueDate: `${openPeriod}-24` }
    });
    assert.equal(earlyBill.statusCode, 409, earlyBill.body);
    assert.equal(rowCount(app, "bills", orgId), before.bills);

    const replacementReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-15`,
        reference: "RCPT-PO-RETURN-0001-REPLACEMENT",
        lines: [{ lineId: line.id, quantity: 4 }]
      }
    });
    assert.equal(replacementReceipt.statusCode, 200, replacementReceipt.body);
    assert.equal(replacementReceipt.json().order.status, "received");
    assert.equal(replacementReceipt.json().order.receivedQuantity, 4);
    assert.equal(stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity, before.mainStock + 4);

    const billed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/bill`,
      headers: { cookie: accountant },
      payload: { billDate: `${openPeriod}-15`, dueDate: `${openPeriod}-24` }
    });
    assert.equal(billed.statusCode, 200, billed.body);
    assert.equal(billed.json().order.status, "billed");
    assert.equal(billed.json().bill.total, 288000);

    const billedReturn = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/return`,
      headers: { cookie: operator },
      payload: {
        returnedAt: `${openPeriod}-16`,
        reference: "RTN-PO-RETURN-0001-BILLED",
        lines: [{ lineId: line.id, quantity: 1 }]
      }
    });
    assert.equal(billedReturn.statusCode, 409, billedReturn.body);
    assert.equal(rowCount(app, "purchase_returns", orgId), before.returns + 2);

    const analytics = await app.inject({ method: "GET", url: "/api/purchase/analytics", headers: { cookie: owner } });
    assert.equal(analytics.statusCode, 200, analytics.body);
    assert.equal(analytics.json().summary.returnedQuantity, 4);
    assert.equal(analytics.json().vendorPerformance[0].returnedQuantity, 4);

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: owner },
      payload: { note: "Purchase returns must restore with stock evidence." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    const backupTables = backup.json().backup.payload.tables;
    assert.ok(backupTables.purchase_returns.some(item => item.purchase_order_id === order.id && item.quantity === 1 && item.reference === "RTN-PO-RETURN-0001-A"));
    assert.ok(backupTables.purchase_returns.some(item => item.purchase_order_id === order.id && item.quantity === 3 && item.reference === "RTN-PO-RETURN-0001-FULL"));
  } finally {
    await app.close();
  }
});

test("purchase: vendor master and pricelists drive RFQ supplier costs", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operatorCookie = await login(app, "operator@armosphera.local");
    const ownerCookie = await login(app);
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;

    const vendors = await app.inject({ method: "GET", url: "/api/purchase/vendors", headers: { cookie: operatorCookie } });
    assert.equal(vendors.statusCode, 200, vendors.body);
    const seededVendor = vendors.json().vendors.find(vendor => vendor.id === "vendor-yerevan-hardware-supply");
    assert.ok(seededVendor, "seeded hardware vendor is visible");
    assert.equal(seededVendor.taxId, "01234568");
    assert.ok(seededVendor.prices.some(price => price.catalogItemId === "catitem-pos-barcode-scanner" && price.unitCost === 60000));

    const createdVendor = await app.inject({
      method: "POST",
      url: "/api/purchase/vendors",
      headers: { cookie: operatorCookie },
      payload: {
        name: "Gyumri Device Supply",
        taxId: "12345678",
        paymentTermsDays: 10,
        leadTimeDays: 3,
        note: "Regional backup vendor for POS hardware.",
        prices: [{
          catalogItemId: "catitem-pos-barcode-scanner",
          unitCost: 61000,
          minQuantity: 1,
          leadTimeDays: 3,
          validFrom: `${openPeriod}-01`,
          note: "One-unit scanner replacement cost."
        }]
      }
    });
    assert.equal(createdVendor.statusCode, 200, createdVendor.body);
    const vendor = createdVendor.json().vendor;
    assert.match(vendor.id, /^vendor-/);
    assert.equal(vendor.name, "Gyumri Device Supply");
    assert.equal(vendor.taxId, "12345678");
    assert.equal(vendor.prices.length, 1);
    assert.equal(vendor.prices[0].unitCost, 61000);

    const createdOrder = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: operatorCookie },
      payload: {
        vendorId: vendor.id,
        orderNumber: "PO-VENDOR-PRICE-1",
        orderDate: `${openPeriod}-08`,
        expectedDate: `${openPeriod}-11`,
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1 }]
      }
    });
    assert.equal(createdOrder.statusCode, 200, createdOrder.body);
    const order = createdOrder.json().order;
    assert.equal(order.vendorId, vendor.id);
    assert.equal(order.vendorName, "Gyumri Device Supply");
    assert.equal(order.supplier, "Gyumri Device Supply");
    assert.equal(order.supplierTaxId, "12345678");
    assert.equal(order.lines[0].unitCost, 61000);
    assert.equal(order.subtotal, 61000);
    assert.equal(order.vat, 12200);
    assert.equal(order.total, 73200);

    const supportCookie = await login(app, "support@armosphera.local");
    const supportDenied = await app.inject({ method: "GET", url: "/api/purchase/vendors", headers: { cookie: supportCookie } });
    assert.equal(supportDenied.statusCode, 403, supportDenied.body);

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: ownerCookie },
      payload: { note: "Purchase vendor master and pricelist must restore with RFQ evidence." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    const backupTables = backup.json().backup.payload.tables;
    assert.ok(backupTables.purchase_vendors.some(item => item.id === vendor.id && item.tax_id === "12345678"));
    assert.ok(backupTables.purchase_vendor_prices.some(item => item.vendor_id === vendor.id && item.unit_cost === 61000));
    assert.ok(backupTables.purchase_orders.some(item => item.id === order.id && item.vendor_id === vendor.id));
  } finally {
    await app.close();
  }
});

test("purchase: vendor master prices seed, create, and back RFQ default costing", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const auditor = await login(app, "auditor@armosphera.local");
    const support = await login(app, "support@armosphera.local");
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const vendorCounts = () => ({
      vendors: rowCount(app, "purchase_vendors", orgId),
      prices: rowCount(app, "purchase_vendor_prices", orgId),
      orders: rowCount(app, "purchase_orders", orgId),
      lines: rowCount(app, "purchase_order_lines", orgId),
      events: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type = ?").get(orgId, "purchase.vendor.created").count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "purchase.vendor.created").count
    });

    const unauthenticated = await app.inject({ method: "GET", url: "/api/purchase/vendors" });
    assert.equal(unauthenticated.statusCode, 401);
    const auditorRead = await app.inject({ method: "GET", url: "/api/purchase/vendors", headers: { cookie: auditor } });
    assert.equal(auditorRead.statusCode, 200, auditorRead.body);
    const supportRead = await app.inject({ method: "GET", url: "/api/purchase/vendors", headers: { cookie: support } });
    assert.equal(supportRead.statusCode, 403, supportRead.body);
    const seededVendor = auditorRead.json().vendors.find(vendor => vendor.id === "vendor-yerevan-hardware-supply");
    assert.equal(seededVendor.name, "Yerevan Hardware Supply");
    assert.ok(seededVendor.prices.some(price => price.catalogItemId === "catitem-pos-barcode-scanner" && price.unitCost === 60000));

    const malformedBefore = vendorCounts();
    const invalidWindow = await app.inject({
      method: "POST",
      url: "/api/purchase/vendors",
      headers: { cookie: operator },
      payload: {
        name: "Invalid Window Supplier",
        prices: [{ catalogItemId: "catitem-pos-barcode-scanner", unitCost: 55000, validFrom: `${openPeriod}-20`, validTo: `${openPeriod}-01` }]
      }
    });
    assert.equal(invalidWindow.statusCode, 400, invalidWindow.body);
    assert.deepEqual(vendorCounts(), malformedBefore);

    const duplicatePrices = await app.inject({
      method: "POST",
      url: "/api/purchase/vendors",
      headers: { cookie: operator },
      payload: {
        name: "Duplicate Price Supplier",
        prices: [
          { catalogItemId: "catitem-pos-barcode-scanner", unitCost: 55000, minQuantity: 2, validFrom: `${openPeriod}-01` },
          { catalogItemId: "catitem-pos-barcode-scanner", unitCost: 54000, minQuantity: 2, validFrom: `${openPeriod}-01` }
        ]
      }
    });
    assert.equal(duplicatePrices.statusCode, 400, duplicatePrices.body);
    assert.doesNotMatch(duplicatePrices.body, /purchase_vendor_prices|UNIQUE constraint/i);
    assert.deepEqual(vendorCounts(), malformedBefore);

    const missingItem = await app.inject({
      method: "POST",
      url: "/api/purchase/vendors",
      headers: { cookie: operator },
      payload: {
        name: "Missing Item Supplier",
        prices: [{ catalogItemId: "catitem-missing-safe", unitCost: 55000, validFrom: `${openPeriod}-01` }]
      }
    });
    assert.equal(missingItem.statusCode, 404, missingItem.body);
    assert.deepEqual(vendorCounts(), malformedBefore);

    const created = await app.inject({
      method: "POST",
      url: "/api/purchase/vendors",
      headers: { cookie: operator },
      payload: {
        name: "Gyumri Office Supply",
        taxId: "87654321",
        email: "procurement@gyumri-office.example",
        phone: "+374 312 112233",
        paymentTermsDays: 10,
        leadTimeDays: 3,
        note: "Preferred regional vendor for POS equipment.",
        prices: [
          {
            catalogItemId: "catitem-pos-barcode-scanner",
            unitCost: 55000,
            minQuantity: 3,
            leadTimeDays: 1,
            validFrom: `${openPeriod}-01`,
            validTo: `${openPeriod}-28`,
            note: "Bulk scanner replenishment cost."
          }
        ]
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const vendor = created.json().vendor;
    assert.match(vendor.id, /^vendor-/);
    assert.equal(vendor.name, "Gyumri Office Supply");
    assert.equal(vendor.taxId, "87654321");
    assert.equal(vendor.paymentTermsDays, 10);
    assert.equal(vendor.leadTimeDays, 3);
    assert.equal(vendor.prices.length, 1);
    assert.equal(vendor.prices[0].unitCost, 55000);
    assert.equal(vendor.prices[0].minQuantity, 3);
    assert.equal(vendorCounts().vendors, malformedBefore.vendors + 1);
    assert.equal(vendorCounts().prices, malformedBefore.prices + 1);
    assert.equal(vendorCounts().events, malformedBefore.events + 1);
    assert.equal(vendorCounts().audits, malformedBefore.audits + 1);

    const duplicateBefore = vendorCounts();
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/purchase/vendors",
      headers: { cookie: operator },
      payload: { name: "Gyumri Office Supply" }
    });
    assert.equal(duplicate.statusCode, 409, duplicate.body);
    assert.deepEqual(vendorCounts(), duplicateBefore);

    const order = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: operator },
      payload: {
        vendorId: vendor.id,
        orderNumber: "PO-VENDOR-PRICE",
        orderDate: `${openPeriod}-07`,
        expectedDate: `${openPeriod}-10`,
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 4 }]
      }
    });
    assert.equal(order.statusCode, 200, order.body);
    const purchaseOrder = order.json().order;
    assert.equal(purchaseOrder.vendorId, vendor.id);
    assert.equal(purchaseOrder.vendorName, "Gyumri Office Supply");
    assert.equal(purchaseOrder.supplier, "Gyumri Office Supply");
    assert.equal(purchaseOrder.supplierTaxId, "87654321");
    assert.equal(purchaseOrder.subtotal, 220000);
    assert.equal(purchaseOrder.vat, 44000);
    assert.equal(purchaseOrder.total, 264000);
    assert.equal(purchaseOrder.lines[0].unitCost, 55000);
    assert.equal(purchaseOrder.lines[0].vendorPriceId, vendor.prices[0].id);
    const storedOrder = app.db.prepare("SELECT vendor_id FROM purchase_orders WHERE org_id = ? AND id = ?").get(orgId, purchaseOrder.id);
    assert.equal(storedOrder.vendor_id, vendor.id);
    const storedLine = app.db.prepare("SELECT vendor_price_id FROM purchase_order_lines WHERE org_id = ? AND purchase_order_id = ?").get(orgId, purchaseOrder.id);
    assert.equal(storedLine.vendor_price_id, vendor.prices[0].id);

    const explicitOverride = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: operator },
      payload: {
        vendorId: vendor.id,
        orderNumber: "PO-VENDOR-EXPLICIT",
        orderDate: `${openPeriod}-07`,
        expectedDate: `${openPeriod}-10`,
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 4, unitCost: 50000 }]
      }
    });
    assert.equal(explicitOverride.statusCode, 200, explicitOverride.body);
    const explicitOrder = explicitOverride.json().order;
    assert.equal(explicitOrder.lines[0].unitCost, 50000);
    assert.equal(explicitOrder.lines[0].vendorPriceId, "");
    const explicitLine = app.db.prepare("SELECT vendor_price_id FROM purchase_order_lines WHERE org_id = ? AND purchase_order_id = ?").get(orgId, explicitOrder.id);
    assert.equal(explicitLine.vendor_price_id, null);
  } finally {
    await app.close();
  }
});

test("purchase: analytics summarize vendor performance, price coverage, and receipt backlog", async () => {
  test.mock.timers.enable({ apis: ["Date"], now: new Date("2026-06-05T21:30:00.000Z") });
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const auditor = await login(app, "auditor@armosphera.local");
    const support = await login(app, "support@armosphera.local");
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const now = new Date().toISOString();
    app.db.prepare(`
      INSERT INTO catalog_items (
        id, org_id, category_id, sku, name, description, item_type, status,
        unit_of_measure, list_price, standard_cost, currency, vat_mode,
        track_stock, track_lots, fiscal_receipt_required, created_by_user_id,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "catitem-analytics-uncovered-cable",
      orgId,
      "catcat-hardware",
      "HW-ANALYTICS-CABLE",
      "Analytics uncovered cable",
      "Active stock-tracked item without a usable vendor price.",
      "stockable",
      "active",
      "unit",
      1500,
      1000,
      "AMD",
      "standard",
      1,
      0,
      1,
      "user-operator",
      now,
      now
    );

    const suspendedVendor = await app.inject({
      method: "POST",
      url: "/api/purchase/vendors",
      headers: { cookie: operator },
      payload: {
        name: "Suspended Analytics Supplier",
        status: "suspended",
        prices: [{
          catalogItemId: "catitem-pos-barcode-scanner",
          unitCost: 59000,
          minQuantity: 1,
          validFrom: `${openPeriod}-01`,
          note: "Suspended vendor price must not count as usable coverage."
        }]
      }
    });
    assert.equal(suspendedVendor.statusCode, 200, suspendedVendor.body);

    const dateEdgeVendor = await app.inject({
      method: "POST",
      url: "/api/purchase/vendors",
      headers: { cookie: operator },
      payload: {
        name: "Date Edge Analytics Supplier",
        status: "active",
        prices: [
          {
            catalogItemId: "catitem-analytics-uncovered-cable",
            unitCost: 900,
            minQuantity: 1,
            validFrom: "2099-01-01",
            note: "Future active price must not count as currently usable coverage."
          },
          {
            catalogItemId: "catitem-analytics-uncovered-cable",
            unitCost: 950,
            minQuantity: 1,
            validFrom: "2020-01-01",
            validTo: "2020-12-31",
            note: "Expired active price must not count as currently usable coverage."
          }
        ]
      }
    });
    assert.equal(dateEdgeVendor.statusCode, 200, dateEdgeVendor.body);

    const armeniaDateVendor = await app.inject({
      method: "POST",
      url: "/api/purchase/vendors",
      headers: { cookie: operator },
      payload: {
        name: "Armenia Date Analytics Supplier",
        status: "active",
        prices: [{
          catalogItemId: "catitem-analytics-uncovered-cable",
          unitCost: 975,
          minQuantity: 1,
          validFrom: "2026-06-06",
          validTo: "2026-06-06",
          note: "Price valid on the Armenia local date even while UTC date is still previous day."
        }]
      }
    });
    assert.equal(armeniaDateVendor.statusCode, 200, armeniaDateVendor.body);

    const created = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: operator },
      payload: {
        vendorId: "vendor-yerevan-hardware-supply",
        orderNumber: "PO-ANALYTICS-0001",
        orderDate: `${openPeriod}-06`,
        expectedDate: `${openPeriod}-12`,
        note: "Analytics regression purchase order.",
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 3 }]
      }
    });
    assert.equal(created.statusCode, 200, created.body);
    const order = created.json().order;
    assert.equal(order.supplier, "Yerevan Hardware Supply");
    assert.equal(order.lines[0].unitCost, 60000);
    assert.match(order.lines[0].vendorPriceId, /^vendor-price-/);
    assert.equal(order.total, 216000);

    const rfqAnalytics = await app.inject({ method: "GET", url: "/api/purchase/analytics", headers: { cookie: auditor } });
    assert.equal(rfqAnalytics.statusCode, 200, rfqAnalytics.body);
    assert.equal(rfqAnalytics.json().receiptBacklog.length, 0);
    assert.equal(rfqAnalytics.json().summary.vendorCount, 4);
    assert.equal(rfqAnalytics.json().summary.activeVendorCount, 3);
    assert.equal(rfqAnalytics.json().summary.activePriceCount, 2);
    assert.equal(rfqAnalytics.json().summary.stockableCatalogItemCount, 2);
    assert.equal(rfqAnalytics.json().summary.receiptProgressPercent, 0);
    assert.equal(rfqAnalytics.json().summary.remainingQuantity, 0);
    assert.equal(rfqAnalytics.json().summary.vendorPriceCoveragePercent, 100);
    assert.equal(rfqAnalytics.json().summary.pricedOrderLinePercent, 100);
    assert.equal(rfqAnalytics.json().priceCoverage.coveredStockableItemCount, 2);
    assert.equal(rfqAnalytics.json().priceCoverage.coveragePercent, 100);

    const confirmed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/confirm`,
      headers: { cookie: operator },
      payload: {}
    });
    assert.equal(confirmed.statusCode, 200, confirmed.body);

    const received = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${order.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-08`,
        reference: "RCPT-PO-ANALYTICS-0001-A",
        lines: [{ lineId: order.lines[0].id, quantity: 1 }]
      }
    });
    assert.equal(received.statusCode, 200, received.body);
    assert.equal(received.json().order.status, "partial");

    const extraRfq = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: operator },
      payload: {
        vendorId: "vendor-yerevan-hardware-supply",
        orderNumber: "PO-ANALYTICS-RFQ",
        orderDate: `${openPeriod}-07`,
        expectedDate: `${openPeriod}-14`,
        note: "RFQ should count commercially but not depress receivable vendor progress.",
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1 }]
      }
    });
    assert.equal(extraRfq.statusCode, 200, extraRfq.body);
    assert.equal(extraRfq.json().order.status, "rfq");
    assert.equal(extraRfq.json().order.total, 72000);

    const unauthenticated = await app.inject({ method: "GET", url: "/api/purchase/analytics" });
    assert.equal(unauthenticated.statusCode, 401);
    const supportDenied = await app.inject({ method: "GET", url: "/api/purchase/analytics", headers: { cookie: support } });
    assert.equal(supportDenied.statusCode, 403, supportDenied.body);
    const auditorRead = await app.inject({ method: "GET", url: "/api/purchase/analytics", headers: { cookie: auditor } });
    assert.equal(auditorRead.statusCode, 200, auditorRead.body);

    const response = await app.inject({ method: "GET", url: "/api/purchase/analytics", headers: { cookie: operator } });
    assert.equal(response.statusCode, 200, response.body);
    const analytics = response.json();
    assert.equal(analytics.summary.orderCount, 2);
    assert.equal(analytics.summary.vendorCount, 4);
    assert.equal(analytics.summary.activeVendorCount, 3);
    assert.equal(analytics.summary.openValue, 288000);
    assert.equal(analytics.summary.billedValue, 0);
    assert.equal(analytics.summary.receiptProgressPercent, 33);
    assert.equal(analytics.summary.remainingQuantity, 2);
    assert.equal(analytics.summary.lineCount, 2);
    assert.equal(analytics.summary.vendorPricedLineCount, 2);
    assert.equal(analytics.summary.vendorPriceCoveragePercent, 100);
    assert.equal(analytics.summary.pricedOrderLinePercent, 100);
    assert.equal(analytics.summary.activePriceCount, 2);
    assert.equal(analytics.summary.stockableCatalogItemCount, 2);
    assert.equal(analytics.priceCoverage.activePriceCount, 2);
    assert.equal(analytics.priceCoverage.stockableCatalogItemCount, 2);
    assert.equal(analytics.priceCoverage.activeVendorCount, 3);
    assert.equal(analytics.priceCoverage.coveredStockableItemCount, 2);
    assert.equal(analytics.priceCoverage.coveragePercent, 100);

    assert.equal(analytics.receiptBacklog.length, 1);
    assert.equal(analytics.receiptBacklog[0].orderId, order.id);
    assert.equal(analytics.receiptBacklog[0].orderNumber, "PO-ANALYTICS-0001");
    assert.equal(analytics.receiptBacklog[0].supplier, "Yerevan Hardware Supply");
    assert.equal(analytics.receiptBacklog[0].status, "partial");
    assert.equal(analytics.receiptBacklog[0].expectedDate, `${openPeriod}-12`);
    assert.equal(analytics.receiptBacklog[0].remainingQuantity, 2);

    assert.equal(analytics.vendorPerformance.length, 1);
    assert.equal(analytics.vendorPerformance[0].vendorId, "vendor-yerevan-hardware-supply");
    assert.equal(analytics.vendorPerformance[0].supplier, "Yerevan Hardware Supply");
    assert.equal(analytics.vendorPerformance[0].taxId, "01234568");
    assert.equal(analytics.vendorPerformance[0].orderCount, 2);
    assert.equal(analytics.vendorPerformance[0].totalValue, 288000);
    assert.equal(analytics.vendorPerformance[0].openValue, 288000);
    assert.equal(analytics.vendorPerformance[0].billedValue, 0);
    assert.equal(analytics.vendorPerformance[0].orderedQuantity, 4);
    assert.equal(analytics.vendorPerformance[0].receivedQuantity, 1);
    assert.equal(analytics.vendorPerformance[0].remainingQuantity, 3);
    assert.equal(analytics.vendorPerformance[0].receivableOrderedQuantity, 3);
    assert.equal(analytics.vendorPerformance[0].receivableReceivedQuantity, 1);
    assert.equal(analytics.vendorPerformance[0].receivableRemainingQuantity, 2);
    assert.equal(analytics.vendorPerformance[0].receiptProgressPercent, 33);
    assert.equal(analytics.vendorPerformance[0].lineCount, 2);
    assert.equal(analytics.vendorPerformance[0].vendorPricedLineCount, 2);
    assert.equal(analytics.vendorPerformance[0].lastOrderDate, `${openPeriod}-07`);
  } finally {
    await app.close();
    test.mock.timers.reset();
  }
});

test("purchase: role gates and metadata guards reject writes before mutation", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const auditor = await login(app, "auditor@armosphera.local");
    const operator = await login(app, "operator@armosphera.local");
    const support = await login(app, "support@armosphera.local");
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const counts = () => ({
      purchaseOrders: rowCount(app, "purchase_orders", orgId),
      purchaseLines: rowCount(app, "purchase_order_lines", orgId),
      stockMoves: rowCount(app, "stock_moves", orgId),
      bills: rowCount(app, "bills", orgId),
      billAudits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "finance.bill.created").count,
      billLedgerRows: app.db.prepare("SELECT COUNT(*) AS count FROM ledger_journal WHERE org_id = ? AND source_type = ?").get(orgId, "bill").count,
      inventoryEvents: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type = ?").get(orgId, "inventory.stock_move.posted").count,
      inventoryAudits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "inventory.stock_move.posted").count,
      scannerStock: stockQuantity(app, orgId, "catitem-pos-barcode-scanner", "stockloc-main-warehouse").quantity,
      events: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE ?").get(orgId, "purchase.order.%").count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get(orgId, "purchase.order.%").count
    });
    const basePayload = {
      supplier: "Yerevan Hardware Supply",
      supplierTaxId: "01234568",
      orderDate: `${openPeriod}-07`,
      expectedDate: `${openPeriod}-09`,
      lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1, unitCost: 60000 }]
    };

    const unauthenticated = await app.inject({ method: "GET", url: "/api/purchase/orders" });
    assert.equal(unauthenticated.statusCode, 401);
    const auditorRead = await app.inject({ method: "GET", url: "/api/purchase/orders", headers: { cookie: auditor } });
    assert.equal(auditorRead.statusCode, 200, auditorRead.body);
    const supportRead = await app.inject({ method: "GET", url: "/api/purchase/orders", headers: { cookie: support } });
    assert.equal(supportRead.statusCode, 403, supportRead.body);

    const beforeDenied = counts();
    const auditorDenied = await app.inject({ method: "POST", url: "/api/purchase/orders", headers: { cookie: auditor }, payload: basePayload });
    assert.equal(auditorDenied.statusCode, 403, auditorDenied.body);
    assert.deepEqual(counts(), beforeDenied);

    const malformedBodies = [
      null,
      ["secret-purchase-array-body-token"],
      { ...basePayload, supplier: { text: "Yerevan Hardware Supply", token: "secret-purchase-object-supplier-token" } },
      { ...basePayload, supplier: "Yerevan\nsecret-purchase-control-supplier-token" },
      { ...basePayload, supplierTaxId: "0123456A" },
      { ...basePayload, orderDate: "2026-02-30" },
      { ...basePayload, lines: [] },
      { ...basePayload, lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 0, unitCost: 60000 }] },
      { ...basePayload, lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1000000, unitCost: 1000000000000 }] },
      { ...basePayload, lines: [
        { catalogItemId: "catitem-pos-barcode-scanner", quantity: 7000, unitCost: 1000000000000 },
        { catalogItemId: "catitem-pos-barcode-scanner", quantity: 7000, unitCost: 1000000000000 }
      ] },
      { ...basePayload, lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1, unitCost: ["60000"] }] },
      { ...basePayload, lines: [{ catalogItemId: "catitem-pos-barcode-scanner\nsecret-purchase-control-item-token", quantity: 1, unitCost: 60000 }] }
    ];
    for (const payload of malformedBodies) {
      const before = counts();
      const response = await app.inject({ method: "POST", url: "/api/purchase/orders", headers: { cookie: owner }, payload });
      assert.equal(response.statusCode, 400, response.body);
      assert.doesNotMatch(response.body, /secret-purchase-/);
      assert.deepEqual(counts(), before);
    }

    const unknownItem = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: owner },
      payload: { ...basePayload, lines: [{ catalogItemId: "catitem-missing-safe", quantity: 1, unitCost: 60000 }] }
    });
    assert.equal(unknownItem.statusCode, 404, unknownItem.body);
    assert.deepEqual(counts(), beforeDenied);

    const created = await app.inject({ method: "POST", url: "/api/purchase/orders", headers: { cookie: owner }, payload: basePayload });
    assert.equal(created.statusCode, 200, created.body);
    const orderId = created.json().order.id;
    const receiveBeforeConfirm = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${orderId}/receive`,
      headers: { cookie: owner },
      payload: { receivedAt: `${openPeriod}-09`, dueDate: `${openPeriod}-24` }
    });
    assert.equal(receiveBeforeConfirm.statusCode, 409, receiveBeforeConfirm.body);

    const malformedPath = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${orderId}%0Asecret-purchase-path-token/confirm`,
      headers: { cookie: owner },
      payload: {}
    });
    assert.equal(malformedPath.statusCode, 400, malformedPath.body);
    assert.doesNotMatch(malformedPath.body, /secret-purchase-/);

    app.db.exec(`
      CREATE TEMP TRIGGER purchase_test_fail_confirm_event
      BEFORE INSERT ON suite_events
      WHEN NEW.event_type = 'purchase.order.confirmed'
      BEGIN
        SELECT RAISE(ABORT, 'purchase confirm trigger fail');
      END;
    `);
    const beforeFailedConfirm = counts();
    const failedConfirm = await app.inject({ method: "POST", url: `/api/purchase/orders/${orderId}/confirm`, headers: { cookie: owner }, payload: {} });
    assert.equal(failedConfirm.statusCode, 500, failedConfirm.body);
    assert.deepEqual(counts(), beforeFailedConfirm);
    assert.equal(app.db.prepare("SELECT status FROM purchase_orders WHERE org_id = ? AND id = ?").get(orgId, orderId).status, "rfq");
    app.db.exec("DROP TRIGGER purchase_test_fail_confirm_event");

    const confirmed = await app.inject({ method: "POST", url: `/api/purchase/orders/${orderId}/confirm`, headers: { cookie: owner }, payload: {} });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    app.db.exec(`
      CREATE TEMP TRIGGER purchase_test_fail_receipt_line
      BEFORE UPDATE OF received_quantity ON purchase_order_lines
      WHEN NEW.purchase_order_id = '${orderId}'
      BEGIN
        SELECT RAISE(ABORT, 'purchase receipt trigger fail');
      END;
    `);
    const beforeFailedReceive = counts();
    const failedReceive = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${orderId}/receive`,
      headers: { cookie: owner },
      payload: { receivedAt: `${openPeriod}-09`, reference: "RCPT-GUARD" }
    });
    assert.equal(failedReceive.statusCode, 500, failedReceive.body);
    assert.deepEqual(counts(), beforeFailedReceive);
    app.db.exec("DROP TRIGGER purchase_test_fail_receipt_line");
    const received = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${orderId}/receive`,
      headers: { cookie: owner },
      payload: { receivedAt: `${openPeriod}-09`, reference: "RCPT-GUARD" }
    });
    assert.equal(received.statusCode, 200, received.body);
    const receivedLineId = received.json().order.lines[0].id;
    const supportReturnDenied = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${orderId}/return`,
      headers: { cookie: support },
      payload: {
        returnedAt: `${openPeriod}-10`,
        reference: "RTN-SUPPORT-DENIED",
        lines: [{ lineId: receivedLineId, quantity: 1 }]
      }
    });
    assert.equal(supportReturnDenied.statusCode, 403, supportReturnDenied.body);
    const malformedReturnBodies = [
      { returnedAt: null, reference: "RTN-BAD-NULL", lines: [{ lineId: receivedLineId, quantity: 1 }] },
      ["secret-purchase-return-array-token"],
      { returnedAt: "2026-02-30", reference: "RTN-BAD-DATE", lines: [{ lineId: receivedLineId, quantity: 1 }] },
      { returnedAt: `${openPeriod}-10`, reference: "RTN-BAD-REASON", reason: "bad\nsecret-purchase-return-reason-token", lines: [{ lineId: receivedLineId, quantity: 1 }] },
      { returnedAt: `${openPeriod}-10`, reference: "RTN-BAD-LINES", lines: [] },
      { returnedAt: `${openPeriod}-10`, reference: "RTN-BAD-QTY", lines: [{ lineId: receivedLineId, quantity: 0 }] },
      { returnedAt: `${openPeriod}-10`, reference: "RTN-BAD-LINE", lines: [{ lineId: `${receivedLineId}\nsecret-purchase-return-line-token`, quantity: 1 }] }
    ];
    for (const payload of malformedReturnBodies) {
      const before = counts();
      const response = await app.inject({ method: "POST", url: `/api/purchase/orders/${orderId}/return`, headers: { cookie: owner }, payload });
      assert.equal(response.statusCode, 400, response.body);
      assert.doesNotMatch(response.body, /secret-purchase-/);
      assert.deepEqual(counts(), before);
    }
    app.db.exec(`
      CREATE TEMP TRIGGER purchase_test_fail_return_insert
      BEFORE INSERT ON purchase_returns
      WHEN NEW.purchase_order_id = '${orderId}'
      BEGIN
        SELECT RAISE(ABORT, 'purchase return trigger fail');
      END;
    `);
    const beforeFailedReturn = counts();
    const failedReturn = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${orderId}/return`,
      headers: { cookie: owner },
      payload: {
        returnedAt: `${openPeriod}-10`,
        reference: "RTN-GUARD",
        lines: [{ lineId: receivedLineId, quantity: 1 }]
      }
    });
    assert.equal(failedReturn.statusCode, 500, failedReturn.body);
    assert.deepEqual(counts(), beforeFailedReturn);
    assert.equal(app.db.prepare("SELECT received_quantity FROM purchase_order_lines WHERE org_id = ? AND id = ?").get(orgId, receivedLineId).received_quantity, 1);
    app.db.exec("DROP TRIGGER purchase_test_fail_return_insert");
    const operatorBillDenied = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${orderId}/bill`,
      headers: { cookie: operator },
      payload: { billDate: `${openPeriod}-09`, dueDate: `${openPeriod}-24` }
    });
    assert.equal(operatorBillDenied.statusCode, 403, operatorBillDenied.body);
    app.db.exec(`
      CREATE TEMP TRIGGER purchase_test_fail_bill_link
      BEFORE UPDATE OF bill_id ON purchase_orders
      WHEN NEW.id = '${orderId}'
      BEGIN
        SELECT RAISE(ABORT, 'purchase bill trigger fail');
      END;
    `);
    const beforeFailedBill = counts();
    const failedBill = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${orderId}/bill`,
      headers: { cookie: owner },
      payload: { billDate: `${openPeriod}-09`, dueDate: `${openPeriod}-24` }
    });
    assert.equal(failedBill.statusCode, 500, failedBill.body);
    assert.deepEqual(counts(), beforeFailedBill);
    app.db.exec("DROP TRIGGER purchase_test_fail_bill_link");
    app.db.prepare("UPDATE finance_periods SET status = 'closed' WHERE org_id = ? AND period_key = ?").run(orgId, openPeriod);
    const beforeClosedReceive = counts();
    const closedBill = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${orderId}/bill`,
      headers: { cookie: owner },
      payload: { billDate: `${openPeriod}-09`, dueDate: `${openPeriod}-24` }
    });
    assert.equal(closedBill.statusCode, 409, closedBill.body);
    assert.match(closedBill.body, /PERIOD_LOCKED/);
    assert.deepEqual(counts(), beforeClosedReceive);
  } finally {
    await app.close();
  }
});
