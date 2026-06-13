"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } });
  return res.headers["set-cookie"];
}

test("posting a draft invoice via the API writes a balanced ledger entry", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const custId = app.db.prepare("SELECT id FROM customers WHERE org_id = ? LIMIT 1").get(orgId).id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const now = new Date().toISOString();
    app.db.prepare(`INSERT INTO finance_draft_invoices
      (id, org_id, customer_id, number, status, subtotal, vat, total, currency, issue_date, due_date, period_key, source_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 'AMD', ?, ?, ?, ?, ?, ?)`)
      .run("draft-2c", orgId, custId, "DRAFT-2C", 1000, 200, 1200, `${openPeriod}-10`, `${openPeriod}-24`, openPeriod, "src-2c", now, now);

    const post = await app.inject({ method: "POST", url: "/api/finance/draft-invoices/draft-2c/post", headers: { cookie }, payload: {} });
    assert.strictEqual(post.statusCode, 200);

    const tb = await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } });
    const byCode = Object.fromEntries(tb.json().rows.map(r => [r.code, r]));
    assert.strictEqual(byCode["221"].balance, 1200);
    assert.strictEqual(byCode["611"].balance, -1000);
    assert.strictEqual(byCode["524"].balance, -200);
    assert.strictEqual(tb.json().balanced, true);
  } finally { await app.close(); }
});

test("recording a full payment via the API clears receivables into cash", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const custId = app.db.prepare("SELECT id FROM customers WHERE org_id = ? LIMIT 1").get(orgId).id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1").get(orgId).period_key;
    const now = new Date().toISOString();
    app.db.prepare(`INSERT INTO finance_draft_invoices
      (id, org_id, customer_id, number, status, subtotal, vat, total, currency, issue_date, due_date, period_key, source_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 'AMD', ?, ?, ?, ?, ?, ?)`)
      .run("draft-pay", orgId, custId, "DRAFT-PAY", 1000, 200, 1200, `${openPeriod}-10`, `${openPeriod}-24`, openPeriod, "src-pay", now, now);

    const post = await app.inject({ method: "POST", url: "/api/finance/draft-invoices/draft-pay/post", headers: { cookie }, payload: {} });
    assert.strictEqual(post.statusCode, 200);
    const invoiceId = post.json().invoice.id;

    const pay = await app.inject({
      method: "POST",
      url: `/api/finance/invoices/${invoiceId}/payments`,
      headers: { cookie },
      payload: { amount: 1200, paidAt: `${openPeriod}-12`, reference: "PAY-FULL-2C" }
    });
    assert.strictEqual(pay.statusCode, 200);

    const tb = await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } });
    const byCode = Object.fromEntries(tb.json().rows.map(r => [r.code, r]));
    assert.strictEqual(byCode["221"].balance, 0);
    assert.strictEqual(byCode["251"].balance, 1200);
    assert.strictEqual(tb.json().balanced, true);
  } finally { await app.close(); }
});
