"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } });
  return res.headers["set-cookie"];
}

test("paying a bill twice with the same amount+reference is idempotent", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const created = await app.inject({ method: "POST", url: "/api/finance/bills", headers: { cookie }, payload: { supplier: "Acme", subtotal: 500, vat: 100, billDate: `${openPeriod}-05`, dueDate: `${openPeriod}-10` } });
    const billId = created.json().bill.id;
    const pay = { amount: 600, paidAt: `${openPeriod}-20`, reference: "WIRE-1" };
    const r1 = await app.inject({ method: "POST", url: `/api/finance/bills/${billId}/pay`, headers: { cookie }, payload: pay });
    assert.strictEqual(r1.statusCode, 200);
    const r2 = await app.inject({ method: "POST", url: `/api/finance/bills/${billId}/pay`, headers: { cookie }, payload: pay });
    assert.strictEqual(r2.statusCode, 200);
    // exactly one payment row + one Dt521/Kt251 ledger entry for this bill
    const payments = app.db.prepare("SELECT COUNT(*) AS c FROM bill_payments WHERE org_id = ? AND bill_id = ?").get(orgId, billId).c;
    assert.strictEqual(payments, 1);
    const tb = Object.fromEntries((await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } })).json().rows.map(r => [r.code, r]));
    assert.strictEqual(tb["251"].balance, -600); // single payment moved 600 out of cash, not 1200
    assert.strictEqual(tb["521"].balance, 0);     // bill fully settled once
  } finally { await app.close(); }
});
