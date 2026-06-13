"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { openDatabase } = require("../server/db");
const ledger = require("../server/ledger");

function withLocale(value, fn) {
  const prev = process.env.A1_LOCALE;
  if (value === undefined) delete process.env.A1_LOCALE;
  else process.env.A1_LOCALE = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.A1_LOCALE;
    else process.env.A1_LOCALE = prev;
  }
}

function freshDb() {
  const db = openDatabase(":memory:");
  const orgId = db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
  return { db, orgId };
}

function balances(db, orgId) {
  return Object.fromEntries(ledger.trialBalance(db, orgId).rows.map((r) => [r.code, r]));
}

test("RU invoice → DR62 (AR) / CR90 (revenue) + CR68 (output VAT), balanced", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postInvoicePosted(db, orgId, { id: "inv-1", number: "INV-1", total: 1220, vat: 220, date: "2026-05-10" });
    const tb = ledger.trialBalance(db, orgId);
    assert.equal(tb.balanced, true);
    const b = balances(db, orgId);
    assert.equal(b["62"].balance, 1220); // AR debit
    assert.equal(b["90"].balance, -1000); // revenue credit
    assert.equal(b["68"].balance, -220); // output VAT credit
    assert.match(b["62"].name, /покупател/); // RU name from seeded chart
  });
});

test("RU invoice with kopecks stores integer minor units and displays rubles", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postInvoicePosted(db, orgId, {
      id: "inv-kopecks",
      number: "INV-K",
      subtotal: 1000.45,
      vat: 220.1,
      total: 1220.55,
      date: "2026-05-10"
    });

    const raw = db.prepare(`
      SELECT debit_code AS debitCode, credit_code AS creditCode, amount
      FROM ledger_journal
      WHERE org_id = ?
      ORDER BY memo
    `).all(orgId);
    assert.deepEqual(raw.map((r) => r.amount).sort((a, b) => a - b), [22010, 100045]);

    const b = balances(db, orgId);
    assert.equal(b["62"].balance, 1220.55);
    assert.equal(b["90"].balance, -1000.45);
    assert.equal(b["68"].balance, -220.1);
    assert.equal(ledger.trialBalance(db, orgId).balanced, true);
  });
});

test("RU payment → DR51 (bank) / CR62 (AR)", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postInvoicePosted(db, orgId, { id: "inv-1", total: 1000, vat: 0, date: "2026-05-10" });
    ledger.postPaymentReceived(db, orgId, { id: "pay-1", amount: 1000, date: "2026-05-12" });
    const b = balances(db, orgId);
    assert.equal(b["51"].balance, 1000); // bank debit
    assert.equal(b["62"].balance, 0); // AR settled
  });
});

test("RU payment with kopecks clears AR using integer minor units", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postInvoicePosted(db, orgId, { id: "inv-1", total: 1220.55, vat: 220.1, subtotal: 1000.45, date: "2026-05-10" });
    ledger.postPaymentReceived(db, orgId, { id: "pay-1", amount: 1220.55, date: "2026-05-12" });
    const rawPayment = db.prepare("SELECT amount FROM ledger_journal WHERE org_id = ? AND source_type = 'payment'").get(orgId);
    assert.equal(rawPayment.amount, 122055);
    const b = balances(db, orgId);
    assert.equal(b["51"].balance, 1220.55);
    assert.equal(b["62"].balance, 0);
  });
});

test("RU expense → DR26 (expense) / CR60 (AP) + DR19 (input VAT)", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postExpensePosted(db, orgId, { id: "exp-1", total: 1220, vat: 220, date: "2026-05-10" });
    const tb = ledger.trialBalance(db, orgId);
    assert.equal(tb.balanced, true);
    const b = balances(db, orgId);
    assert.equal(b["26"].balance, 1000); // expense debit
    assert.equal(b["19"].balance, 220); // input VAT debit
    assert.equal(b["60"].balance, -1220); // AP credit
  });
});

test("postEntry contract: direct amount is already integer minor units", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    const id = ledger.postEntry(db, orgId, {
      date: "2026-05-10",
      debitCode: "51",
      creditCode: "90",
      amount: 12345,
      sourceType: "manual",
      sourceId: "manual-kopecks"
    });
    assert.ok(id);
    const raw = db.prepare("SELECT amount FROM ledger_journal WHERE org_id = ? AND id = ?").get(orgId, id);
    assert.equal(raw.amount, 12345);
    const b = balances(db, orgId);
    assert.equal(b["51"].balance, 123.45);
    assert.throws(() => ledger.postEntry(db, orgId, {
      date: "2026-05-10",
      debitCode: "51",
      creditCode: "90",
      amount: 123.45,
      sourceType: "manual",
      sourceId: "manual-decimal"
    }), /minor-unit integer/);
  });
});

test("RU bill + bill payment → AP 60 settled, bank 51 out", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postBillPosted(db, orgId, { id: "bill-1", total: 600, vat: 0, date: "2026-05-10" });
    ledger.postBillPayment(db, orgId, { id: "bp-1", amount: 600, date: "2026-05-12" });
    const tb = ledger.trialBalance(db, orgId);
    assert.equal(tb.balanced, true);
    const b = balances(db, orgId);
    assert.equal(b["60"].balance, 0); // AP settled
    assert.equal(b["51"].balance, -600); // bank credit (paid out)
    assert.equal(b["26"].balance, 600); // expense
  });
});

test("RU payroll → DR26 / CR70 (net) + CR68 (НДФЛ)", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postPayrollRun(db, orgId, { id: "pr-1", gross: 100000, net: 87000, totalDeductions: 13000, date: "2026-05-31" });
    const tb = ledger.trialBalance(db, orgId);
    assert.equal(tb.balanced, true);
    const b = balances(db, orgId);
    assert.equal(b["26"].balance, 100000); // expense (gross)
    assert.equal(b["70"].balance, -87000); // net wages payable
    assert.equal(b["68"].balance, -13000); // НДФЛ payable
  });
});

test("AM postings unchanged under the default locale (regression guard)", () => {
  withLocale(undefined, () => {
    const { db, orgId } = freshDb();
    ledger.postInvoicePosted(db, orgId, { id: "inv-1", total: 1200, vat: 200, date: "2026-05-10" });
    const b = balances(db, orgId);
    assert.equal(b["221"].balance, 1200);
    assert.equal(b["611"].balance, -1000);
    assert.equal(b["524"].balance, -200);
  });
});
