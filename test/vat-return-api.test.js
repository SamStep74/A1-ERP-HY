"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");
const ledger = require("../server/ledger");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  assert.equal(res.statusCode, 200, res.body);
  return res.headers["set-cookie"];
}

async function withApp(fn) {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    await fn(app);
  } finally {
    await app.close();
  }
}

async function reviewVatSource(app, cookie) {
  const reviewed = await app.inject({
    method: "POST",
    url: "/api/legal/sources/law-tax-code/reviews",
    headers: { cookie },
    payload: {
      title: "RA Tax Code VAT source - accountant reviewed",
      sourceUrl: "https://www.arlis.am/hy/acts/224990?reviewed=2026-06-05",
      effectiveDate: "2026-06-05",
      status: "active",
      reviewNote: "Accountant confirmed this source before preparing VAT return packets."
    }
  });
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  return reviewed.json().source;
}

function ownerOrgId(app) {
  return app.db.prepare("SELECT org_id AS orgId FROM users WHERE email = ?").get(DEFAULT_EMAIL).orgId;
}

function postVatLedgerEntries(app, orgId) {
  ledger.postEntry(app.db, orgId, {
    date: "2026-05-12",
    debitCode: "221",
    creditCode: "611",
    amount: 1000000,
    memo: "VAT return invoice revenue",
    sourceType: "invoice",
    sourceId: "invoice-vat-return-1",
    periodKey: "2026-05"
  });
  ledger.postEntry(app.db, orgId, {
    date: "2026-05-12",
    debitCode: "221",
    creditCode: "524",
    amount: 200000,
    memo: "VAT return output VAT",
    sourceType: "invoice",
    sourceId: "invoice-vat-return-1",
    periodKey: "2026-05"
  });
  ledger.postEntry(app.db, orgId, {
    date: "2026-05-18",
    debitCode: "711",
    creditCode: "521",
    amount: 400000,
    memo: "VAT return purchase net",
    sourceType: "expense",
    sourceId: "expense-vat-return-1",
    periodKey: "2026-05"
  });
  ledger.postEntry(app.db, orgId, {
    date: "2026-05-18",
    debitCode: "226",
    creditCode: "521",
    amount: 80000,
    memo: "VAT return input VAT",
    sourceType: "expense",
    sourceId: "expense-vat-return-1",
    periodKey: "2026-05"
  });
  ledger.postEntry(app.db, orgId, {
    date: "2026-05-20",
    debitCode: "714",
    creditCode: "521",
    amount: 50000,
    memo: "Payroll must not enter VAT return inputs",
    sourceType: "payroll",
    sourceId: "payroll-vat-return-ignore",
    periodKey: "2026-05"
  });
}

test("VAT return API creates idempotent audited packets from posted ledger rows", async () => {
  await withApp(async app => {
    const ownerCookie = await login(app);
    const accountantCookie = await login(app, "accountant@armosphera.local");
    const auditorCookie = await login(app, "auditor@armosphera.local");
    const supportCookie = await login(app, "support@armosphera.local");
    await reviewVatSource(app, accountantCookie);
    postVatLedgerEntries(app, ownerOrgId(app));

    const created = await app.inject({
      method: "POST",
      url: "/api/finance/vat-returns",
      headers: { cookie: accountantCookie },
      payload: { periodKey: "2026-05", note: "Prepare May VAT return packet." }
    });
    assert.equal(created.statusCode, 200, created.body);
    const body = created.json();
    const packet = body.vatReturn;
    assert.equal(body.idempotent, false);
    assert.equal(packet.periodKey, "2026-05");
    assert.equal(packet.status, "prepared");
    assert.equal(packet.legalSourceId, "law-tax-code");
    assert.equal(packet.outputVat, 200000);
    assert.equal(packet.inputVat, 80000);
    assert.equal(packet.taxableSales, 1000000);
    assert.equal(packet.taxablePurchases, 400000);
    assert.equal(packet.net, 120000);
    assert.equal(packet.payable, 120000);
    assert.equal(packet.creditCarried, 0);
    assert.match(packet.checksum, /^[a-f0-9]{64}$/);
    assert.equal(packet.payload.legalSource.latestReviewRole, "Accountant");
    assert.equal(packet.payload.inputs.sales.length, 1);
    assert.equal(packet.payload.inputs.purchases.length, 1);
    assert.equal(packet.payload.inputs.sales[0].sourceId, "invoice-vat-return-1");
    assert.equal(packet.payload.inputs.purchases[0].sourceId, "expense-vat-return-1");
    assert.equal(JSON.stringify(packet.payload.inputs).includes("payroll-vat-return-ignore"), false);
    assert.ok(body.events.some(event => event.eventType === "finance.vat_return.created"));

    const repeated = await app.inject({
      method: "POST",
      url: "/api/finance/vat-returns",
      headers: { cookie: accountantCookie },
      payload: { periodKey: "2026-05", note: "Duplicate May VAT return request." }
    });
    assert.equal(repeated.statusCode, 200, repeated.body);
    assert.equal(repeated.json().idempotent, true);
    assert.equal(repeated.json().vatReturn.id, packet.id);
    assert.equal(repeated.json().vatReturn.checksum, packet.checksum);

    const ownerList = await app.inject({ method: "GET", url: "/api/finance/vat-returns?periodKey=2026-05", headers: { cookie: ownerCookie } });
    assert.equal(ownerList.statusCode, 200, ownerList.body);
    assert.equal(ownerList.json().returns.find(item => item.id === packet.id).payload.totals.payable, 120000);

    const auditorList = await app.inject({ method: "GET", url: "/api/finance/vat-returns?periodKey=2026-05", headers: { cookie: auditorCookie } });
    assert.equal(auditorList.statusCode, 200, auditorList.body);
    assert.equal(auditorList.json().returns.find(item => item.id === packet.id).payload.totals.creditCarried, 0);

    const supportList = await app.inject({ method: "GET", url: "/api/finance/vat-returns?periodKey=2026-05", headers: { cookie: supportCookie } });
    assert.equal(supportList.statusCode, 200, supportList.body);
    const supportPacket = supportList.json().returns.find(item => item.id === packet.id);
    assert.equal(supportPacket.payload, null);
    assert.equal(supportPacket.checksum, null);
    assert.equal(supportPacket.sourceKey, null);

    const backup = await app.inject({
      method: "POST",
      url: "/api/admin/backups",
      headers: { cookie: ownerCookie },
      payload: { note: "Include VAT return packet in tenant backup." }
    });
    assert.equal(backup.statusCode, 200, backup.body);
    assert.ok(backup.json().backup.payload.tables.finance_vat_returns.some(item => item.id === packet.id));

    const audit = await app.inject({ method: "GET", url: "/api/audit", headers: { cookie: ownerCookie } });
    assert.equal(audit.statusCode, 200, audit.body);
    assert.ok(audit.json().events.some(event => event.type === "finance.vat_return.created" && event.details.returnId === packet.id));
  });
});

test("VAT return API rejects malformed metadata and unauthorized writers before persistence", async () => {
  await withApp(async app => {
    const ownerCookie = await login(app);
    const salesCookie = await login(app, "sales@armosphera.local");
    const packetCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM finance_vat_returns").get().count;
    const secretCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM finance_vat_returns
      WHERE period_key LIKE ?
        OR note LIKE ?
        OR source_key LIKE ?
        OR payload LIKE ?
        OR note = ?
    `).get(
      "%secret-vat-return-%",
      "%secret-vat-return-%",
      "%secret-vat-return-%",
      "%secret-vat-return-%",
      "[object Object]"
    ).count;
    const suiteEventCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM suite_events
      WHERE event_type = ?
    `).get("finance.vat_return.created").count;
    const auditEventCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE type = ?
    `).get("finance.vat_return.created").count;
    const beforePackets = packetCount();
    const beforeSuiteEvents = suiteEventCount();
    const beforeAuditEvents = auditEventCount();

    const blockedRole = await app.inject({
      method: "POST",
      url: "/api/finance/vat-returns",
      headers: { cookie: salesCookie },
      payload: { periodKey: "2026-05", note: "Sales must not prepare VAT return packets." }
    });
    assert.equal(blockedRole.statusCode, 403, blockedRole.body);

    const malformedRequests = [
      null,
      { periodKey: null, note: "secret-vat-return-null-period-token" },
      { periodKey: ["2026-05"], note: "secret-vat-return-array-period-token" },
      { periodKey: { key: "2026-05", token: "secret-vat-return-object-period-token" } },
      { periodKey: "2026-05\nsecret-vat-return-control-period-token" },
      { periodKey: "not-a-period-secret-vat-return-period-token" },
      { periodKey: "2026-05", note: null },
      { periodKey: "2026-05", note: ["Accountant note"] },
      { periodKey: "2026-05", note: { text: "Accountant note", token: "secret-vat-return-object-note-token" } },
      { periodKey: "2026-05", note: "VAT return\nsecret-vat-return-control-note-token" },
      { periodKey: "2026-05", note: `${"N".repeat(501)}secret-vat-return-long-note-token` },
      ["secret-vat-return-array-body-token"]
    ];

    for (const payload of malformedRequests) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/finance/vat-returns",
        headers: { cookie: ownerCookie },
        payload
      });
      assert.equal(rejected.statusCode, 400, rejected.body);
      assert.doesNotMatch(rejected.body, /secret-vat-return-/);
    }

    for (const url of [
      "/api/finance/vat-returns?periodKey=2026-13",
      "/api/finance/vat-returns?periodKey=2026-00",
      "/api/finance/vat-returns?periodKey=2026/05",
      "/api/finance/vat-returns?periodKey=2026-05&periodKey=2026-06"
    ]) {
      const malformedList = await app.inject({ method: "GET", url, headers: { cookie: ownerCookie } });
      assert.equal(malformedList.statusCode, 400, malformedList.body);
    }

    assert.equal(packetCount(), beforePackets);
    assert.equal(secretCount(), 0);
    assert.equal(suiteEventCount(), beforeSuiteEvents);
    assert.equal(auditEventCount(), beforeAuditEvents);
  });
});

test("VAT return API requires reviewed VAT source and open accounting period", async () => {
  await withApp(async app => {
    const ownerCookie = await login(app);
    const accountantCookie = await login(app, "accountant@armosphera.local");
    postVatLedgerEntries(app, ownerOrgId(app));

    const blockedSource = await app.inject({
      method: "POST",
      url: "/api/finance/vat-returns",
      headers: { cookie: ownerCookie },
      payload: { periodKey: "2026-05", note: "Attempt before accountant VAT source signoff." }
    });
    assert.equal(blockedSource.statusCode, 409, blockedSource.body);
    assert.match(blockedSource.body, /VAT_SOURCE_REVIEW_REQUIRED/);

    await reviewVatSource(app, accountantCookie);
    const closed = await app.inject({
      method: "POST",
      url: "/api/finance/periods/2026-05/close",
      headers: { cookie: ownerCookie },
      payload: { reason: "VAT period submitted to accountant." }
    });
    assert.equal(closed.statusCode, 200, closed.body);

    const blockedPeriod = await app.inject({
      method: "POST",
      url: "/api/finance/vat-returns",
      headers: { cookie: ownerCookie },
      payload: { periodKey: "2026-05", note: "Late VAT packet after period close." }
    });
    assert.equal(blockedPeriod.statusCode, 409, blockedPeriod.body);
    assert.match(blockedPeriod.body, /PERIOD_LOCKED/);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM finance_vat_returns").get().count, 0);
  });
});
