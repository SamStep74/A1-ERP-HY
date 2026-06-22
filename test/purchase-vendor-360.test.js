"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");
const { buildVendor360 } = require("../server/purchasing/vendor-360");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email, password }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers["set-cookie"];
}

async function loginAsRole(app, role) {
  const orgId = "org-armosphera-demo";
  const id = `user-${role.toLowerCase()}-vendor-360`;
  const email = `${role.toLowerCase()}.vendor360@armosphera.local`;
  const owner = app.db.prepare("SELECT password_hash FROM users WHERE org_id = ? AND email = ?").get(orgId, DEFAULT_EMAIL);
  assert.ok(owner, "seed owner user exists");
  app.db.prepare(`
    INSERT INTO users (id, org_id, email, name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, orgId, email, `${role} Vendor 360`, role, owner.password_hash, new Date().toISOString());
  return login(app, email);
}

async function createConfirmedVendorOrder(app, cookie, orderNumber, orderDate, expectedDate, quantity) {
  const created = await app.inject({
    method: "POST",
    url: "/api/purchase/orders",
    headers: { cookie },
    payload: {
      vendorId: "vendor-yerevan-hardware-supply",
      orderNumber,
      orderDate,
      expectedDate,
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
  return order;
}

test("vendor 360: pure helper summarizes vendor relationship rows", () => {
  const view = buildVendor360(
    { id: "vendor-a", name: "Vendor A", prices: [{ status: "active" }, { status: "archived" }] },
    [
      { id: "po-2", status: "billed", orderDate: "2026-06-12" },
      { id: "po-1", status: "partial", orderDate: "2026-06-10" }
    ],
    [{ orderId: "po-1", remainingQuantity: 2 }],
    [{ id: "bill-1", status: "open", total: 144000, isYtd: true }, { id: "bill-old", status: "paid", total: 1000, isYtd: false }],
    [{ id: "reorder-1", status: "pending" }, { id: "reorder-2", status: "accepted" }]
  );
  assert.equal(view.summary.orderCount, 2);
  assert.equal(view.summary.openPoCount, 1);
  assert.equal(view.summary.openReceiptCount, 1);
  assert.equal(view.summary.openBillCount, 1);
  assert.equal(view.summary.openReorderSuggestionCount, 1);
  assert.equal(view.summary.totalSpendYtd, 144000);
  assert.equal(view.summary.lastPoDate, "2026-06-12");
  assert.equal(view.summary.activePriceCount, 1);
  assert.equal(view.visibility.recentOrders, true);
  assert.equal(view.visibility.financials, true);
  assert.equal(view.recentOrders.length, 2);
  assert.equal(view.openReorderSuggestions.length, 1);
});

test("vendor 360: pure helper limits recent orders and excludes settled bills", () => {
  const orders = Array.from({ length: 12 }, (_, index) => ({
    id: `po-${index}`,
    status: index === 0 ? "billed" : "confirmed",
    orderDate: `2026-06-${String(index + 1).padStart(2, "0")}`
  }));
  const view = buildVendor360(
    { id: "vendor-a", name: "Vendor A", prices: [] },
    orders,
    [],
    [
      { id: "bill-open", status: "partial", total: 10000, outstanding: 2500, isYtd: true },
      { id: "bill-settled", status: "partial", total: 10000, outstanding: 0, isYtd: true }
    ],
    []
  );
  assert.equal(view.summary.orderCount, 12);
  assert.equal(view.summary.openPoCount, 11);
  assert.equal(view.summary.openBillCount, 1);
  assert.equal(view.summary.totalSpendYtd, 20000);
  assert.equal(view.recentOrders.length, 10);
  assert.equal(view.openBills[0].id, "bill-open");
});

test("vendor 360: pure helper can return aggregate-only PO and finance sections", () => {
  const view = buildVendor360(
    { id: "vendor-a", name: "Vendor A", prices: [] },
    [{ id: "po-hidden", status: "confirmed", orderDate: "2026-06-10", lines: [{ id: "line-hidden" }] }],
    [{ orderId: "po-hidden", remainingQuantity: 1 }],
    [{ id: "bill-hidden", status: "open", total: 5000, outstanding: 5000, isYtd: true }],
    [],
    {
      orderSummary: { orderCount: 12, openPoCount: 3, openReceiptCount: 2, lastPoDate: "2026-06-15" },
      includeRecentOrders: false,
      includeOpenReceipts: false,
      includeFinancials: false
    }
  );
  assert.equal(view.summary.orderCount, 12);
  assert.equal(view.summary.openPoCount, 3);
  assert.equal(view.summary.openReceiptCount, 2);
  assert.equal(view.summary.totalSpendYtd, 0);
  assert.equal(view.summary.lastPoDate, "2026-06-15");
  assert.equal(view.visibility.recentOrders, false);
  assert.equal(view.visibility.financials, false);
  assert.deepEqual(view.recentOrders, []);
  assert.deepEqual(view.openReceipts, []);
  assert.deepEqual(view.openBills, []);
});

test("vendor 360: dashboard combines recent POs, open receipts, bills, spend, and suggestions", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const operator = await login(app, "operator@armosphera.local");
    const accountant = await login(app, "accountant@armosphera.local");
    const auditor = await login(app, "auditor@armosphera.local");
    const purchaser = await loginAsRole(app, "Purchaser");
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;

    const partialOrder = await createConfirmedVendorOrder(app, operator, "PO-V360-PARTIAL", `${openPeriod}-10`, `${openPeriod}-13`, 3);
    const partialReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${partialOrder.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-11`,
        reference: "RCPT-V360-PARTIAL",
        lines: [{ lineId: partialOrder.lines[0].id, quantity: 1 }]
      }
    });
    assert.equal(partialReceipt.statusCode, 200, partialReceipt.body);

    const billedOrder = await createConfirmedVendorOrder(app, operator, "PO-V360-BILLED", `${openPeriod}-12`, `${openPeriod}-14`, 2);
    const fullReceipt = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${billedOrder.id}/receive`,
      headers: { cookie: operator },
      payload: {
        receivedAt: `${openPeriod}-13`,
        reference: "RCPT-V360-BILLED",
        lines: [{ lineId: billedOrder.lines[0].id, quantity: 2 }]
      }
    });
    assert.equal(fullReceipt.statusCode, 200, fullReceipt.body);
    const billed = await app.inject({
      method: "POST",
      url: `/api/purchase/orders/${billedOrder.id}/bill`,
      headers: { cookie: accountant },
      payload: { billDate: `${openPeriod}-13`, dueDate: `${openPeriod}-28` }
    });
    assert.equal(billed.statusCode, 200, billed.body);

    const shortage = await app.inject({
      method: "POST",
      url: "/api/inventory/reservations",
      headers: { cookie: owner },
      payload: {
        itemId: "catitem-pos-barcode-scanner",
        locationId: "stockloc-main-warehouse",
        quantity: 99,
        sourceType: "sales_order",
        sourceId: "sales-vendor-360-shortage"
      }
    });
    assert.equal(shortage.statusCode, 200, shortage.body);
    const generated = await app.inject({
      method: "POST",
      url: "/api/purchase/reorder-suggestions/generate",
      headers: { cookie: operator },
      payload: {}
    });
    assert.equal(generated.statusCode, 200, generated.body);

    const dashboard = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-yerevan-hardware-supply/360",
      headers: { cookie: auditor }
    });
    assert.equal(dashboard.statusCode, 200, dashboard.body);
    const view = dashboard.json();
    assert.equal(view.vendor.id, "vendor-yerevan-hardware-supply");
    assert.equal(view.summary.orderCount, 2);
    assert.equal(view.summary.openPoCount, 1);
    assert.equal(view.summary.openReceiptCount, 1);
    assert.equal(view.summary.openBillCount, 1);
    assert.equal(view.summary.openReorderSuggestionCount, 1);
    assert.equal(view.summary.totalSpendYtd, billed.json().bill.total);
    assert.equal(view.summary.lastPoDate, `${openPeriod}-12`);
    assert.ok(view.summary.activePriceCount >= 1);
    assert.equal(view.visibility.recentOrders, true);
    assert.equal(view.visibility.financials, true);
    assert.equal(view.recentOrders.length, 2);
    assert.equal(view.recentOrders[0].orderNumber, "PO-V360-BILLED");
    assert.equal(view.openReceipts[0].orderId, partialOrder.id);
    assert.equal(view.openReceipts[0].remainingQuantity, 2);
    assert.equal(view.openBills[0].purchaseOrderId, billedOrder.id);
    assert.ok(view.openReorderSuggestions.some(item => item.suggestedVendorId === "vendor-yerevan-hardware-supply"));

    const restricted = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-yerevan-hardware-supply/360",
      headers: { cookie: purchaser }
    });
    assert.equal(restricted.statusCode, 200, restricted.body);
    assert.equal(restricted.json().summary.orderCount, 2);
    assert.equal(restricted.json().summary.openPoCount, 1);
    assert.equal(restricted.json().summary.openReceiptCount, 1);
    assert.equal(restricted.json().summary.openBillCount, 0);
    assert.equal(restricted.json().summary.totalSpendYtd, 0);
    assert.equal(restricted.json().visibility.recentOrders, false);
    assert.equal(restricted.json().visibility.openReceipts, false);
    assert.equal(restricted.json().visibility.financials, false);
    assert.deepEqual(restricted.json().recentOrders, []);
    assert.deepEqual(restricted.json().openReceipts, []);
    assert.deepEqual(restricted.json().openBills, []);

    const purchaserRecentDenied = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-yerevan-hardware-supply/recent-orders",
      headers: { cookie: purchaser }
    });
    assert.equal(purchaserRecentDenied.statusCode, 403, purchaserRecentDenied.body);
  } finally {
    await app.close();
  }
});

test("vendor 360: recent-orders endpoint returns newest vendor POs only", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    await createConfirmedVendorOrder(app, operator, "PO-V360-OLDER", `${openPeriod}-08`, `${openPeriod}-09`, 1);
    await createConfirmedVendorOrder(app, operator, "PO-V360-NEWER", `${openPeriod}-09`, `${openPeriod}-10`, 1);

    const recent = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-yerevan-hardware-supply/recent-orders",
      headers: { cookie: operator }
    });
    assert.equal(recent.statusCode, 200, recent.body);
    assert.equal(recent.json().orders.length, 2);
    assert.equal(recent.json().orders[0].orderNumber, "PO-V360-NEWER");
    assert.ok(recent.json().orders.every(order => order.vendorId === "vendor-yerevan-hardware-supply"));
  } finally {
    await app.close();
  }
});

test("vendor 360: recent-orders endpoint limits output to 10 rows", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const orgId = "org-armosphera-demo";
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    for (let index = 1; index <= 12; index += 1) {
      await createConfirmedVendorOrder(
        app,
        operator,
        `PO-V360-LIMIT-${String(index).padStart(2, "0")}`,
        `${openPeriod}-${String(index).padStart(2, "0")}`,
        `${openPeriod}-20`,
        1
      );
    }

    const recent = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-yerevan-hardware-supply/recent-orders",
      headers: { cookie: operator }
    });
    assert.equal(recent.statusCode, 200, recent.body);
    assert.equal(recent.json().orders.length, 10);
    assert.equal(recent.json().orders[0].orderNumber, "PO-V360-LIMIT-12");
    assert.equal(recent.json().orders.at(-1).orderNumber, "PO-V360-LIMIT-03");
  } finally {
    await app.close();
  }
});

test("vendor 360: price-history endpoint returns vendor pricelist rows and 404s missing vendors", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const auditor = await login(app, "auditor@armosphera.local");
    const prices = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-yerevan-hardware-supply/price-history",
      headers: { cookie: auditor }
    });
    assert.equal(prices.statusCode, 200, prices.body);
    assert.ok(prices.json().prices.some(price => price.catalogItemId === "catitem-pos-barcode-scanner" && price.unitCost === 60000));

    const missing = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-missing/price-history",
      headers: { cookie: auditor }
    });
    assert.equal(missing.statusCode, 404, missing.body);
  } finally {
    await app.close();
  }
});

test("vendor 360: dashboard returns 404 for missing vendors", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const auditor = await login(app, "auditor@armosphera.local");
    const missing = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-missing/360",
      headers: { cookie: auditor }
    });
    assert.equal(missing.statusCode, 404, missing.body);
  } finally {
    await app.close();
  }
});

test("vendor 360: endpoints enforce auth, permissions, and safe ids", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const support = await login(app, "support@armosphera.local");
    const unauthenticated = await app.inject({ method: "GET", url: "/api/purchase/vendors/vendor-yerevan-hardware-supply/360" });
    assert.equal(unauthenticated.statusCode, 401);

    const operatorDenied = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-yerevan-hardware-supply/360",
      headers: { cookie: operator }
    });
    assert.equal(operatorDenied.statusCode, 403, operatorDenied.body);

    const supportDenied = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/vendor-yerevan-hardware-supply/price-history",
      headers: { cookie: support }
    });
    assert.equal(supportDenied.statusCode, 403, supportDenied.body);

    const malformed = await app.inject({
      method: "GET",
      url: "/api/purchase/vendors/bad%0Avendor/recent-orders",
      headers: { cookie: operator }
    });
    assert.equal(malformed.statusCode, 400, malformed.body);
  } finally {
    await app.close();
  }
});
