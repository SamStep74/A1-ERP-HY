"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");
const { buildAwardPurchaseOrderBody, rankRfqBids } = require("../server/purchasing/vendor-rfq");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const response = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email, password }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.headers["set-cookie"];
}

async function loginAsRole(app, role, suffix = "rfq") {
  const orgId = "org-armosphera-demo";
  const id = `user-${role.toLowerCase()}-${suffix}`;
  const email = `${role.toLowerCase()}.${suffix}@armosphera.local`;
  const owner = app.db.prepare("SELECT password_hash FROM users WHERE org_id = ? AND email = ?").get(orgId, DEFAULT_EMAIL);
  assert.ok(owner, "seed owner user exists");
  app.db.prepare(`
    INSERT INTO users (id, org_id, email, name, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, orgId, email, `${role} ${suffix}`, role, owner.password_hash, new Date().toISOString());
  return login(app, email);
}

async function newApp() {
  const app = buildApp({ dbPath: ":memory:" });
  await app.ready();
  return app;
}

function rowCount(app, table, orgId) {
  return app.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE org_id = ?`).get(orgId).count;
}

function openPeriod(app) {
  return app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get("org-armosphera-demo").period_key;
}

async function createVendor(app, cookie, name, unitCost = 57000) {
  const period = openPeriod(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/purchase/vendors",
    headers: { cookie },
    payload: {
      name,
      taxId: "22334455",
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@example.test`,
      prices: [{ catalogItemId: "catitem-pos-barcode-scanner", unitCost, validFrom: `${period}-01` }]
    }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().vendor;
}

async function createRfq(app, cookie, vendorIds, overrides = {}) {
  const period = openPeriod(app);
  const response = await app.inject({
    method: "POST",
    url: "/api/purchase/rfqs",
    headers: { cookie },
    payload: {
      rfqNumber: overrides.rfqNumber || "RFQ-W11-TEST",
      title: overrides.title || "Scanner replenishment tender",
      requestDate: overrides.requestDate || `${period}-10`,
      dueDate: overrides.dueDate || `${period}-18`,
      note: overrides.note || "Wave 11 vendor tender.",
      vendorIds,
      lines: overrides.lines || [
        {
          catalogItemId: "catitem-pos-barcode-scanner",
          quantity: 3,
          targetUnitCost: 58000,
          description: "POS scanner tender line"
        }
      ]
    }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().rfq;
}

async function sendRfq(app, cookie, rfqId) {
  const response = await app.inject({
    method: "POST",
    url: `/api/purchase/rfqs/${rfqId}/send`,
    headers: { cookie },
    payload: {}
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().rfq;
}

async function submitBid(app, cookie, rfq, vendorId, unitCost, leadTimeDays = 2) {
  const period = openPeriod(app);
  const response = await app.inject({
    method: "POST",
    url: `/api/purchase/rfqs/${rfq.id}/bids`,
    headers: { cookie },
    payload: {
      vendorId,
      bidDate: `${period}-11`,
      validUntil: `${period}-25`,
      note: `Bid from ${vendorId}`,
      lines: rfq.lines.map(line => ({
        rfqLineId: line.id,
        unitCost,
        leadTimeDays,
        note: "quoted from RFQ"
      }))
    }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

test("vendor RFQ: pure helpers rank complete bids and compose award PO body", () => {
  const bids = [
    { id: "bid-slow", vendorId: "vendor-slow", vendorName: "Slow Supply", total: 120000, bidDate: "2026-06-10", lines: [{ leadTimeDays: 8 }] },
    { id: "bid-fast", vendorId: "vendor-fast", vendorName: "Fast Supply", total: 120000, bidDate: "2026-06-10", lines: [{ leadTimeDays: 3 }] },
    { id: "bid-cheap", vendorId: "vendor-cheap", vendorName: "Cheap Supply", total: 110000, bidDate: "2026-06-11", lines: [{ leadTimeDays: 9 }] }
  ];
  const ranked = rankRfqBids(bids);
  assert.deepEqual(ranked.map(bid => bid.id), ["bid-cheap", "bid-fast", "bid-slow"]);
  assert.equal(ranked[0].vendorName, "Cheap Supply", "ranking keeps formatted bid fields");

  const poBody = buildAwardPurchaseOrderBody(
    { id: "purchase-rfq-1", rfqNumber: "RFQ-W11-AWARD" },
    {
      vendorId: "vendor-cheap",
      lines: [{ catalogItemId: "catitem-pos-barcode-scanner", description: "Scanner", quantity: 2, unitCost: 55000 }]
    },
    { orderNumber: "RFQ-W11-AWARD-PO", orderDate: "2026-06-12", expectedDate: "2026-06-16" }
  );
  assert.equal(poBody.vendorId, "vendor-cheap");
  assert.equal(poBody.orderNumber, "RFQ-W11-AWARD-PO");
  assert.equal(poBody.lines[0].unitCost, 55000);
});

test("vendor RFQ: create, list, read, send, and backup tender evidence", async () => {
  const app = await newApp();
  try {
    const owner = await login(app);
    const accountant = await login(app, "accountant@armosphera.local");
    const auditor = await login(app, "auditor@armosphera.local");
    const support = await login(app, "support@armosphera.local");
    const orgId = "org-armosphera-demo";
    const period = openPeriod(app);
    const before = {
      rfqs: rowCount(app, "purchase_rfqs", orgId),
      lines: rowCount(app, "purchase_rfq_lines", orgId),
      vendors: rowCount(app, "purchase_rfq_vendors", orgId),
      events: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE 'purchase.rfq.%'").get(orgId).count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE 'purchase.rfq.%'").get(orgId).count
    };

    const unauthenticated = await app.inject({ method: "GET", url: "/api/purchase/rfqs" });
    assert.equal(unauthenticated.statusCode, 401);
    const supportDenied = await app.inject({ method: "GET", url: "/api/purchase/rfqs", headers: { cookie: support } });
    assert.equal(supportDenied.statusCode, 403, supportDenied.body);
    const auditorCreateDenied = await app.inject({
      method: "POST",
      url: "/api/purchase/rfqs",
      headers: { cookie: auditor },
      payload: {}
    });
    assert.equal(auditorCreateDenied.statusCode, 403, auditorCreateDenied.body);

    const invalidDueDate = await app.inject({
      method: "POST",
      url: "/api/purchase/rfqs",
      headers: { cookie: owner },
      payload: {
        title: "Invalid tender",
        requestDate: `${period}-18`,
        dueDate: `${period}-10`,
        vendorIds: ["vendor-yerevan-hardware-supply"],
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1 }]
      }
    });
    assert.equal(invalidDueDate.statusCode, 400, invalidDueDate.body);

    const duplicateVendor = await app.inject({
      method: "POST",
      url: "/api/purchase/rfqs",
      headers: { cookie: owner },
      payload: {
        title: "Duplicate vendor tender",
        vendorIds: ["vendor-yerevan-hardware-supply", "vendor-yerevan-hardware-supply"],
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1 }]
      }
    });
    assert.equal(duplicateVendor.statusCode, 400, duplicateVendor.body);

    const rfq = await createRfq(app, owner, ["vendor-yerevan-hardware-supply"], { rfqNumber: "RFQ-W11-CREATE" });
    assert.match(rfq.id, /^purchase-rfq-/);
    assert.equal(rfq.rfqNumber, "RFQ-W11-CREATE");
    assert.equal(rfq.status, "draft");
    assert.equal(rfq.summary.lineCount, 1);
    assert.equal(rfq.summary.vendorCount, 1);
    assert.equal(rfq.lines[0].catalogSku, "HW-BARCODE-SCANNER");
    assert.equal(rfq.vendors[0].vendorId, "vendor-yerevan-hardware-supply");
    assert.equal(rowCount(app, "purchase_rfqs", orgId), before.rfqs + 1);
    assert.equal(rowCount(app, "purchase_rfq_lines", orgId), before.lines + 1);
    assert.equal(rowCount(app, "purchase_rfq_vendors", orgId), before.vendors + 1);

    const listedDrafts = await app.inject({ method: "GET", url: "/api/purchase/rfqs?status=draft", headers: { cookie: auditor } });
    assert.equal(listedDrafts.statusCode, 200, listedDrafts.body);
    assert.ok(listedDrafts.json().rfqs.some(item => item.id === rfq.id));
    const read = await app.inject({ method: "GET", url: `/api/purchase/rfqs/${rfq.id}`, headers: { cookie: auditor } });
    assert.equal(read.statusCode, 200, read.body);
    assert.equal(read.json().rfq.rfqNumber, "RFQ-W11-CREATE");

    const sent = await sendRfq(app, accountant, rfq.id);
    assert.equal(sent.status, "sent");
    assert.ok(sent.sentAt);
    assert.equal(sent.vendors[0].status, "sent");
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE 'purchase.rfq.%'").get(orgId).count, before.events + 2);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE 'purchase.rfq.%'").get(orgId).count, before.audits + 2);

    const repeatedSend = await app.inject({ method: "POST", url: `/api/purchase/rfqs/${rfq.id}/send`, headers: { cookie: accountant }, payload: {} });
    assert.equal(repeatedSend.statusCode, 200, repeatedSend.body);
    assert.equal(repeatedSend.json().idempotent, true);

    const listedSent = await app.inject({ method: "GET", url: "/api/purchase/rfqs?status=sent", headers: { cookie: auditor } });
    assert.equal(listedSent.statusCode, 200, listedSent.body);
    assert.ok(listedSent.json().rfqs.some(item => item.id === rfq.id && item.status === "sent"));

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: owner },
      payload: { note: "Vendor RFQ tender evidence must restore." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    const tables = backup.json().backup.payload.tables;
    assert.ok(tables.purchase_rfqs.some(item => item.id === rfq.id && item.status === "sent"));
    assert.ok(tables.purchase_rfq_lines.some(item => item.rfq_id === rfq.id));
    assert.ok(tables.purchase_rfq_vendors.some(item => item.rfq_id === rfq.id && item.status === "sent"));
  } finally {
    await app.close();
  }
});

test("vendor RFQ: submitted bids rank, award to PO, and stay idempotent", async () => {
  const app = await newApp();
  try {
    const owner = await login(app);
    const accountant = await login(app, "accountant@armosphera.local");
    const operator = await login(app, "operator@armosphera.local");
    const purchaser = await loginAsRole(app, "Purchaser", "rfq-award");
    const orgId = "org-armosphera-demo";
    const period = openPeriod(app);
    const competingVendor = await createVendor(app, owner, "Gyumri Scanner Supply", 57000);
    const rfq = await createRfq(app, owner, ["vendor-yerevan-hardware-supply", competingVendor.id], { rfqNumber: "RFQ-W11-AWARD" });
    const sent = await sendRfq(app, accountant, rfq.id);
    const counts = {
      orders: rowCount(app, "purchase_orders", orgId),
      orderLines: rowCount(app, "purchase_order_lines", orgId),
      bidRows: rowCount(app, "purchase_rfq_bids", orgId),
      bidLineRows: rowCount(app, "purchase_rfq_bid_lines", orgId),
      events: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE 'purchase.rfq.%'").get(orgId).count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE 'purchase.rfq.%'").get(orgId).count
    };

    const firstBid = await submitBid(app, accountant, sent, "vendor-yerevan-hardware-supply", 60000, 2);
    assert.equal(firstBid.bid.vendorId, "vendor-yerevan-hardware-supply");
    assert.equal(firstBid.bid.subtotal, 180000);
    assert.equal(firstBid.bid.vat, 36000);
    assert.equal(firstBid.bid.total, 216000);
    assert.equal(firstBid.rfq.summary.bestBidId, firstBid.bid.id);
    assert.equal(rowCount(app, "purchase_rfq_bids", orgId), counts.bidRows + 1);
    assert.equal(rowCount(app, "purchase_rfq_bid_lines", orgId), counts.bidLineRows + 1);

    const secondBid = await submitBid(app, accountant, firstBid.rfq, competingVendor.id, 55000, 5);
    assert.equal(secondBid.rfq.summary.bidCount, 2);
    assert.equal(secondBid.rfq.summary.bestBidId, secondBid.bid.id);
    assert.equal(secondBid.rfq.bids[0].id, secondBid.bid.id);
    assert.equal(secondBid.rfq.bids[0].vendorName, "Gyumri Scanner Supply");

    const duplicateBid = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/bids`,
      headers: { cookie: accountant },
      payload: {
        vendorId: competingVendor.id,
        bidDate: `${period}-11`,
        validUntil: `${period}-25`,
        lines: sent.lines.map(line => ({ rfqLineId: line.id, unitCost: 54000 }))
      }
    });
    assert.equal(duplicateBid.statusCode, 409, duplicateBid.body);

    const purchaserAwardDenied = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/award`,
      headers: { cookie: purchaser },
      payload: { bidId: secondBid.bid.id }
    });
    assert.equal(purchaserAwardDenied.statusCode, 403, purchaserAwardDenied.body);

    const award = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/award`,
      headers: { cookie: operator },
      payload: {
        bidId: secondBid.bid.id,
        orderDate: `${period}-12`,
        expectedDate: `${period}-16`,
        note: "Awarded to the lower RFQ bid."
      }
    });
    assert.equal(award.statusCode, 200, award.body);
    const awarded = award.json();
    assert.equal(awarded.rfq.status, "awarded");
    assert.equal(awarded.rfq.awardedBidId, secondBid.bid.id);
    assert.equal(awarded.rfq.awardedPurchaseOrderId, awarded.order.id);
    assert.equal(awarded.bid.status, "awarded");
    assert.equal(awarded.order.status, "rfq");
    assert.equal(awarded.order.vendorId, competingVendor.id);
    assert.equal(awarded.order.supplier, "Gyumri Scanner Supply");
    assert.equal(awarded.order.lines[0].catalogItemId, "catitem-pos-barcode-scanner");
    assert.equal(awarded.order.lines[0].quantity, 3);
    assert.equal(awarded.order.lines[0].unitCost, 55000);
    assert.equal(rowCount(app, "purchase_orders", orgId), counts.orders + 1);
    assert.equal(rowCount(app, "purchase_order_lines", orgId), counts.orderLines + 1);
    assert.equal(app.db.prepare("SELECT status FROM purchase_rfq_bids WHERE org_id = ? AND id = ?").get(orgId, firstBid.bid.id).status, "rejected");
    assert.equal(app.db.prepare("SELECT status FROM purchase_rfq_vendors WHERE org_id = ? AND rfq_id = ? AND vendor_id = ?").get(orgId, rfq.id, competingVendor.id).status, "awarded");
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type LIKE 'purchase.rfq.%'").get(orgId).count, counts.events + 3);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE 'purchase.rfq.%'").get(orgId).count, counts.audits + 3);

    const repeatedAward = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/award`,
      headers: { cookie: operator },
      payload: { bidId: secondBid.bid.id }
    });
    assert.equal(repeatedAward.statusCode, 200, repeatedAward.body);
    assert.equal(repeatedAward.json().idempotent, true);
    assert.equal(rowCount(app, "purchase_orders", orgId), counts.orders + 1);

    const lateBid = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/bids`,
      headers: { cookie: accountant },
      payload: {
        vendorId: "vendor-yerevan-hardware-supply",
        lines: sent.lines.map(line => ({ rfqLineId: line.id, unitCost: 50000 }))
      }
    });
    assert.equal(lateBid.statusCode, 409, lateBid.body);

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: owner },
      payload: { note: "Awarded RFQ must restore with generated purchase order." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    const tables = backup.json().backup.payload.tables;
    assert.ok(tables.purchase_rfqs.some(item => item.id === rfq.id && item.awarded_purchase_order_id === awarded.order.id));
    assert.ok(tables.purchase_rfq_bids.some(item => item.id === secondBid.bid.id && item.status === "awarded"));
    assert.ok(tables.purchase_rfq_bid_lines.some(item => item.bid_id === secondBid.bid.id));
    assert.ok(tables.purchase_orders.some(item => item.id === awarded.order.id && item.vendor_id === competingVendor.id));
  } finally {
    await app.close();
  }
});

test("vendor RFQ: validation guards unsafe ids and invalid state transitions", async () => {
  const app = await newApp();
  try {
    const owner = await login(app);
    const accountant = await login(app, "accountant@armosphera.local");
    const operator = await login(app, "operator@armosphera.local");
    const period = openPeriod(app);
    const unsafeRead = await app.inject({ method: "GET", url: "/api/purchase/rfqs/bad_id", headers: { cookie: owner } });
    assert.equal(unsafeRead.statusCode, 400, unsafeRead.body);

    const missingVendor = await app.inject({
      method: "POST",
      url: "/api/purchase/rfqs",
      headers: { cookie: owner },
      payload: {
        title: "Missing vendor RFQ",
        vendorIds: ["vendor-does-not-exist"],
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1 }]
      }
    });
    assert.equal(missingVendor.statusCode, 404, missingVendor.body);

    const rfq = await createRfq(app, owner, ["vendor-yerevan-hardware-supply"], { rfqNumber: "RFQ-W11-GUARDS" });
    const bidBeforeSend = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/bids`,
      headers: { cookie: accountant },
      payload: {
        vendorId: "vendor-yerevan-hardware-supply",
        bidDate: `${period}-11`,
        lines: rfq.lines.map(line => ({ rfqLineId: line.id, unitCost: 60000 }))
      }
    });
    assert.equal(bidBeforeSend.statusCode, 409, bidBeforeSend.body);

    const sent = await sendRfq(app, accountant, rfq.id);
    const malformedBidLines = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/bids`,
      headers: { cookie: accountant },
      payload: {
        vendorId: "vendor-yerevan-hardware-supply",
        bidDate: `${period}-11`,
        lines: [{ rfqLineId: `${sent.lines[0].id}\nsecret-rfq-control-token`, unitCost: 60000 }]
      }
    });
    assert.equal(malformedBidLines.statusCode, 400, malformedBidLines.body);

    const bid = await submitBid(app, accountant, sent, "vendor-yerevan-hardware-supply", 60000, 2);
    const missingBidAward = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/award`,
      headers: { cookie: operator },
      payload: { bidId: "purchase-rfq-bid-missing" }
    });
    assert.equal(missingBidAward.statusCode, 404, missingBidAward.body);

    const invalidAwardDates = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/award`,
      headers: { cookie: operator },
      payload: {
        bidId: bid.bid.id,
        orderDate: `${period}-20`,
        expectedDate: `${period}-12`
      }
    });
    assert.equal(invalidAwardDates.statusCode, 400, invalidAwardDates.body);

    const conflictingOrder = await app.inject({
      method: "POST",
      url: "/api/purchase/orders",
      headers: { cookie: operator },
      payload: {
        vendorId: "vendor-yerevan-hardware-supply",
        orderNumber: "RFQ-W11-GUARDS-AWARD",
        orderDate: `${period}-12`,
        expectedDate: `${period}-16`,
        lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1, unitCost: 61000 }]
      }
    });
    assert.equal(conflictingOrder.statusCode, 200, conflictingOrder.body);
    const conflictingAward = await app.inject({
      method: "POST",
      url: `/api/purchase/rfqs/${rfq.id}/award`,
      headers: { cookie: operator },
      payload: {
        bidId: bid.bid.id,
        orderDate: `${period}-12`,
        expectedDate: `${period}-16`
      }
    });
    assert.equal(conflictingAward.statusCode, 409, conflictingAward.body);
  } finally {
    await app.close();
  }
});
