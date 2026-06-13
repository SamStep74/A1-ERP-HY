"use strict";
// Broken-access-control guard: the ledger-writing finance endpoints must reject a
// read-only Auditor (and any non-finance role). Only Owner/Admin/Accountant —
// requireFinanceOperator — may post expenses, bills, payments, or payroll to the ledger.
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("finance RBAC: a read-only Auditor cannot post to the ledger (403 on all 4 write endpoints)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const auditor = await login(app, "auditor@armosphera.local", DEFAULT_PASSWORD);

    // Expense
    const expense = await app.inject({ method: "POST", url: "/api/finance/expenses", headers: { cookie: auditor },
      payload: { description: "Sneaky expense", subtotal: 1000, vat: 200, incurredOn: `${openPeriod}-10` } });
    assert.strictEqual(expense.statusCode, 403, "Auditor must not post an expense");

    // Supplier bill
    const bill = await app.inject({ method: "POST", url: "/api/finance/bills", headers: { cookie: auditor },
      payload: { supplier: "Acme", subtotal: 1000, vat: 200, billDate: `${openPeriod}-05`, dueDate: `${openPeriod}-20` } });
    assert.strictEqual(bill.statusCode, 403, "Auditor must not create a bill");

    // Bill payment — seed a bill directly so we have an id to target (bypasses the gated create).
    const now = new Date().toISOString();
    app.db.prepare(`INSERT INTO bills (id, org_id, supplier, subtotal, vat, total, currency, status, bill_date, due_date, period_key, created_by_user_id, created_at)
      VALUES ('bill-rbac-1', ?, 'Acme', 1000, 200, 1200, 'AMD', 'open', ?, ?, ?, 'user-owner', ?)`)
      .run(orgId, `${openPeriod}-05`, `${openPeriod}-20`, openPeriod, now);
    const pay = await app.inject({ method: "POST", url: "/api/finance/bills/bill-rbac-1/pay", headers: { cookie: auditor },
      payload: { amount: 1200, paidAt: `${openPeriod}-21` } });
    assert.strictEqual(pay.statusCode, 403, "Auditor must not record a bill payment");

    // Payroll run
    const payroll = await app.inject({ method: "POST", url: "/api/payroll/run", headers: { cookie: auditor },
      payload: { employeeName: "X", gross: 600000, runDate: `${openPeriod}-28` } });
    assert.strictEqual(payroll.statusCode, 403, "Auditor must not post a payroll run");
  } finally { await app.close(); }
});

test("finance RBAC: an Accountant (finance operator) can still post to the ledger (200)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    // Seed an Accountant (finance operator) in the demo org.
    const now = new Date().toISOString();
    const hash = app.db.prepare("SELECT password_hash FROM users WHERE email = ?").get(DEFAULT_EMAIL).password_hash;
    app.db.prepare("INSERT INTO users (id, org_id, email, name, role, password_hash, created_at) VALUES ('user-acct-rbac', ?, 'acct-rbac@armosphera.local', 'Acct', 'Accountant', ?, ?)")
      .run(orgId, hash, now);
    const acct = await login(app, "acct-rbac@armosphera.local", DEFAULT_PASSWORD);

    const expense = await app.inject({ method: "POST", url: "/api/finance/expenses", headers: { cookie: acct },
      payload: { description: "Legit expense", subtotal: 1000, vat: 200, incurredOn: `${openPeriod}-10` } });
    assert.strictEqual(expense.statusCode, 200, "Accountant can post an expense");
  } finally { await app.close(); }
});
