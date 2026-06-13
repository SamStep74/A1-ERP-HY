"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } });
  return res.headers["set-cookie"];
}

test("bill create + pay flows through the ledger and AP report", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const created = await app.inject({ method: "POST", url: "/api/finance/bills", headers: { cookie }, payload: { supplier: "Acme", subtotal: 500, vat: 100, billDate: `${openPeriod}-05`, dueDate: `${openPeriod}-10` } });
    assert.strictEqual(created.statusCode, 200);
    const billId = created.json().bill.id;
    const tb = Object.fromEntries((await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } })).json().rows.map(r => [r.code, r]));
    assert.strictEqual(tb["521"].balance, -600);
    const ap = await app.inject({ method: "GET", url: "/api/finance/payables", headers: { cookie } });
    assert.strictEqual(ap.json().totalOutstanding, 600);
    const pay = await app.inject({ method: "POST", url: `/api/finance/bills/${billId}/pay`, headers: { cookie }, payload: { amount: 600, paidAt: `${openPeriod}-20` } });
    assert.strictEqual(pay.statusCode, 200);
    const tb2 = await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } });
    assert.strictEqual(tb2.json().balanced, true);
    assert.strictEqual(Object.fromEntries(tb2.json().rows.map(r => [r.code, r]))["521"].balance, 0);
    const ap2 = await app.inject({ method: "GET", url: "/api/finance/payables", headers: { cookie } });
    assert.strictEqual(ap2.json().totalOutstanding, 0);
  } finally { await app.close(); }
});

test("bill creation rejects malformed metadata before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const billCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM bills
    `).get().count;
    const billSecretCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM bills
      WHERE supplier LIKE ?
        OR description LIKE ?
        OR bill_date LIKE ?
        OR due_date LIKE ?
        OR supplier = ?
        OR description = ?
    `).get(
      "%secret-bill-%",
      "%secret-bill-%",
      "%secret-bill-%",
      "%secret-bill-%",
      "[object Object]",
      "[object Object]"
    ).count;
    const ledgerCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM ledger_journal
    `).get().count;
    const ledgerSecretCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM ledger_journal
      WHERE memo LIKE ?
        OR memo = ?
    `).get("%secret-bill-%", "Bill [object Object]").count;
    const auditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE type = ?
    `).get("finance.bill.created").count;

    const billCountBefore = billCount();
    const ledgerCountBefore = ledgerCount();
    const auditCountBefore = auditCount();
    const basePayload = {
      supplier: "Acme",
      description: "Cloud hosting",
      subtotal: 500,
      vat: 100,
      billDate: `${openPeriod}-05`,
      dueDate: `${openPeriod}-10`
    };
    const malformedRequests = [
      null,
      { ...basePayload, subtotal: ["500"], supplier: "secret-bill-array-subtotal-token" },
      { ...basePayload, subtotal: { value: 500, token: "secret-bill-object-subtotal-token" } },
      { ...basePayload, subtotal: "500\nsecret-bill-control-subtotal-token" },
      { ...basePayload, vat: ["100"], supplier: "secret-bill-array-vat-token" },
      { ...basePayload, vat: { value: 100, token: "secret-bill-object-vat-token" } },
      { ...basePayload, vat: -1, supplier: "secret-bill-negative-vat-token" },
      { ...basePayload, vat: "-0.1", supplier: "secret-bill-fractional-negative-vat-token" },
      { ...basePayload, billDate: [`${openPeriod}-05`], supplier: "secret-bill-array-bill-date-token" },
      { ...basePayload, billDate: `${openPeriod}-05\nsecret-bill-control-bill-date-token` },
      { ...basePayload, billDate: "not-a-date-secret-bill-date-token" },
      { ...basePayload, billDate: "2026-02-30", supplier: "secret-bill-impossible-bill-date-token" },
      { ...basePayload, dueDate: [`${openPeriod}-10`], supplier: "secret-bill-array-due-date-token" },
      { ...basePayload, dueDate: `${openPeriod}-10\nsecret-bill-control-due-date-token` },
      { ...basePayload, dueDate: "not-a-date-secret-bill-due-date-token" },
      { ...basePayload, dueDate: "2026-02-30", supplier: "secret-bill-impossible-due-date-token" },
      { ...basePayload, supplier: { text: "Acme", token: "secret-bill-object-supplier-token" } },
      { ...basePayload, supplier: "Acme\nsecret-bill-control-supplier-token" },
      { ...basePayload, supplier: `${"S".repeat(161)}secret-bill-long-supplier-token` },
      { ...basePayload, description: { text: "Cloud hosting", token: "secret-bill-object-description-token" } },
      { ...basePayload, description: "Cloud hosting\nsecret-bill-control-description-token" },
      { ...basePayload, description: `${"D".repeat(201)}secret-bill-long-description-token` },
      ["secret-bill-array-body-token"]
    ];

    for (const payload of malformedRequests) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/finance/bills",
        headers: { cookie },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.doesNotMatch(rejected.body, /secret-bill-/);
    }

    assert.strictEqual(billCount(), billCountBefore);
    assert.strictEqual(billSecretCount(), 0);
    assert.strictEqual(ledgerCount(), ledgerCountBefore);
    assert.strictEqual(ledgerSecretCount(), 0);
    assert.strictEqual(auditCount(), auditCountBefore);

    const created = await app.inject({
      method: "POST",
      url: "/api/finance/bills",
      headers: { cookie },
      payload: {
        supplier: "Acme",
        description: "Guarded cloud hosting",
        subtotal: "500",
        vat: "100",
        billDate: `${openPeriod}-06`,
        dueDate: `${openPeriod}-11`
      }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    assert.strictEqual(created.json().bill.supplier, "Acme");
    assert.strictEqual(created.json().bill.subtotal, 500);
    assert.strictEqual(created.json().bill.vat, 100);
    assert.strictEqual(created.json().bill.total, 600);
    assert.strictEqual(created.json().bill.billDate, `${openPeriod}-06`);
    assert.strictEqual(created.json().bill.dueDate, `${openPeriod}-11`);
  } finally { await app.close(); }
});

test("bill payment rejects malformed metadata before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const created = await app.inject({
      method: "POST",
      url: "/api/finance/bills",
      headers: { cookie },
      payload: {
        supplier: "Acme",
        description: "Payment guard setup",
        subtotal: 500,
        vat: 100,
        billDate: `${openPeriod}-05`,
        dueDate: `${openPeriod}-10`
      }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    const billId = created.json().bill.id;
    const paymentCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM bill_payments
      WHERE org_id = ? AND bill_id = ?
    `).get(orgId, billId).count;
    const paymentSecretCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM bill_payments
      WHERE org_id = ?
        AND (
          paid_at LIKE ?
          OR method LIKE ?
          OR reference LIKE ?
          OR method = ?
          OR reference = ?
        )
    `).get(
      orgId,
      "%secret-bill-payment-%",
      "%secret-bill-payment-%",
      "%secret-bill-payment-%",
      "[object Object]",
      "[object Object]"
    ).count;
    const ledgerCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM ledger_journal
    `).get().count;
    const auditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE type = ?
    `).get("finance.bill.paid").count;
    const billStatus = () => app.db.prepare(`
      SELECT status
      FROM bills
      WHERE org_id = ? AND id = ?
    `).get(orgId, billId).status;

    const paymentCountBefore = paymentCount();
    const ledgerCountBefore = ledgerCount();
    const auditCountBefore = auditCount();
    const basePayload = {
      amount: 600,
      paidAt: `${openPeriod}-20`,
      method: "bank-transfer",
      reference: "WIRE-guard"
    };

    const malformedPath = await app.inject({
      method: "POST",
      url: `/api/finance/bills/${billId}%0Asecret-bill-payment-path-token/pay`,
      headers: { cookie },
      payload: {
        ...basePayload,
        reference: "secret-bill-payment-path-body-token"
      }
    });
    assert.strictEqual(malformedPath.statusCode, 400, malformedPath.body);
    assert.match(malformedPath.body, /Invalid finance bill id/);
    assert.doesNotMatch(malformedPath.body, /secret-bill-payment-path-/);

    const malformedDecodedPath = await app.inject({
      method: "POST",
      url: "/api/finance/bills/bill_guard_secret-bill-payment-path-token/pay",
      headers: { cookie },
      payload: basePayload
    });
    assert.strictEqual(malformedDecodedPath.statusCode, 400, malformedDecodedPath.body);
    assert.match(malformedDecodedPath.body, /Invalid finance bill id/);
    assert.doesNotMatch(malformedDecodedPath.body, /secret-bill-payment-path-token/);

    const missingPath = await app.inject({
      method: "POST",
      url: "/api/finance/bills/bill-missing-safe/pay",
      headers: { cookie },
      payload: {
        ...basePayload,
        reference: "secret-bill-payment-missing-body-token"
      }
    });
    assert.strictEqual(missingPath.statusCode, 404, missingPath.body);
    assert.match(missingPath.body, /Bill not found/);
    assert.doesNotMatch(missingPath.body, /secret-bill-payment-missing/);

    const malformedRequests = [
      null,
      { ...basePayload, amount: ["600"], reference: "secret-bill-payment-array-amount-token" },
      { ...basePayload, amount: { value: 600, token: "secret-bill-payment-object-amount-token" } },
      { ...basePayload, amount: "600\nsecret-bill-payment-control-amount-token" },
      { ...basePayload, amount: 0, reference: "secret-bill-payment-zero-amount-token" },
      { ...basePayload, amount: -1, reference: "secret-bill-payment-negative-amount-token" },
      { ...basePayload, amount: "-0.1", reference: "secret-bill-payment-fractional-negative-amount-token" },
      { ...basePayload, paidAt: [`${openPeriod}-20`], reference: "secret-bill-payment-array-paid-at-token" },
      { ...basePayload, paidAt: `${openPeriod}-20\nsecret-bill-payment-control-paid-at-token` },
      { ...basePayload, paidAt: "not-a-date-secret-bill-payment-date-token" },
      { ...basePayload, paidAt: "2026-02-30", reference: "secret-bill-payment-impossible-date-token" },
      { ...basePayload, method: { text: "bank-transfer", token: "secret-bill-payment-object-method-token" } },
      { ...basePayload, method: "bank-transfer\nsecret-bill-payment-control-method-token" },
      { ...basePayload, method: `${"M".repeat(81)}secret-bill-payment-long-method-token` },
      { ...basePayload, reference: { text: "WIRE", token: "secret-bill-payment-object-reference-token" } },
      { ...basePayload, reference: "WIRE\nsecret-bill-payment-control-reference-token" },
      { ...basePayload, reference: `${"R".repeat(161)}secret-bill-payment-long-reference-token` },
      ["secret-bill-payment-array-body-token"]
    ];

    for (const payload of malformedRequests) {
      const rejected = await app.inject({
        method: "POST",
        url: `/api/finance/bills/${billId}/pay`,
        headers: { cookie },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.doesNotMatch(rejected.body, /secret-bill-payment-/);
    }

    assert.strictEqual(paymentCount(), paymentCountBefore);
    assert.strictEqual(paymentSecretCount(), 0);
    assert.strictEqual(ledgerCount(), ledgerCountBefore);
    assert.strictEqual(auditCount(), auditCountBefore);
    assert.strictEqual(billStatus(), "open");

    const paid = await app.inject({
      method: "POST",
      url: `/api/finance/bills/${billId}/pay`,
      headers: { cookie },
      payload: {
        amount: "600",
        paidAt: `${openPeriod}-21`,
        method: "bank-transfer",
        reference: "WIRE-guard-valid"
      }
    });
    assert.strictEqual(paid.statusCode, 200, paid.body);
    assert.strictEqual(paid.json().payment.billId, billId);
    assert.strictEqual(paid.json().payment.amount, 600);
    assert.strictEqual(paid.json().payment.paidAt, `${openPeriod}-21`);
    assert.strictEqual(paid.json().payment.status, "paid");
    const paymentRow = app.db.prepare(`
      SELECT method, reference
      FROM bill_payments
      WHERE org_id = ? AND bill_id = ?
    `).get(orgId, billId);
    assert.strictEqual(paymentRow.method, "bank-transfer");
    assert.strictEqual(paymentRow.reference, "WIRE-guard-valid");
  } finally { await app.close(); }
});
