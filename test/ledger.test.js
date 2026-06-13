"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { openDatabase } = require("../server/db");
const ledger = require("../server/ledger");
const accounting = require("../server/accounting");

function freshDb() {
  const db = openDatabase(":memory:");
  const orgId = db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
  return { db, orgId };
}

test("posting an invoice creates balanced Dt receivable / Kt revenue+VAT entries", () => {
  const { db, orgId } = freshDb();
  ledger.postInvoicePosted(db, orgId, { id: "inv-t1", number: "INV-1", total: 1200, vat: 200, date: "2026-05-10", period_key: "" });
  const tb = ledger.trialBalance(db, orgId);
  assert.strictEqual(tb.balanced, true);
  const byCode = Object.fromEntries(tb.rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["221"].balance, 1200);
  assert.strictEqual(byCode["611"].balance, -1000);
  assert.strictEqual(byCode["524"].balance, -200);
});

test("ledger seeds the full official RA chart of accounts", () => {
  const { db, orgId } = freshDb();
  ledger.ensureChartOfAccounts(db, orgId);
  const count = db.prepare("SELECT COUNT(*) AS count FROM ledger_accounts WHERE org_id = ?").get(orgId).count;
  const inputVat = db.prepare("SELECT name, type FROM ledger_accounts WHERE org_id = ? AND code = '226'").get(orgId);
  const legacyInputVat = db.prepare("SELECT id FROM ledger_accounts WHERE org_id = ? AND code = '526'").get(orgId);
  assert.ok(count >= 600, `expected official chart, got ${count}`);
  assert.match(inputVat.name, /անուղղակի հարկեր/);
  assert.strictEqual(inputVat.type, "asset");
  assert.strictEqual(legacyInputVat, undefined);
});

test("statements show revenue and a balanced sheet", () => {
  const { db, orgId } = freshDb();
  ledger.postInvoicePosted(db, orgId, { id: "inv-t1", total: 1200, vat: 200, date: "2026-05-10" });
  const s = accounting.financialStatements(ledger.buildLedgerModel(db, orgId));
  assert.strictEqual(s.incomeStatement.totalIncome, 1000);
  assert.strictEqual(s.balanceSheet.balanced, true);
});

test("payment posts Dt cash / Kt receivable and clears the receivable", () => {
  const { db, orgId } = freshDb();
  ledger.postInvoicePosted(db, orgId, { id: "inv-t1", total: 1200, vat: 200, date: "2026-05-10" });
  ledger.postPaymentReceived(db, orgId, { id: "pay-t1", invoice_id: "inv-t1", amount: 1200, date: "2026-05-12" });
  const byCode = Object.fromEntries(ledger.trialBalance(db, orgId).rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["221"].balance, 0);
  assert.strictEqual(byCode["251"].balance, 1200);
});

test("posting is idempotent per source", () => {
  const { db, orgId } = freshDb();
  ledger.postInvoicePosted(db, orgId, { id: "inv-t1", total: 1200, vat: 200, date: "2026-05-10" });
  ledger.postInvoicePosted(db, orgId, { id: "inv-t1", total: 1200, vat: 200, date: "2026-05-10" });
  const count = db.prepare("SELECT COUNT(*) AS c FROM ledger_journal WHERE org_id = ?").get(orgId).c;
  assert.strictEqual(count, 2);
});

test("invoice net is taken from the source subtotal when provided", () => {
  const { db, orgId } = freshDb();
  // total/vat round-trip would mis-split; subtotal is authoritative.
  ledger.postInvoicePosted(db, orgId, { id: "inv-sub", total: 151, vat: 50, subtotal: 101, date: "2026-05-10" });
  const byCode = Object.fromEntries(ledger.trialBalance(db, orgId).rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["611"].balance, -101);
  assert.strictEqual(byCode["524"].balance, -50);
  assert.strictEqual(byCode["221"].balance, 151);
});

test("posting into a closed period is blocked", () => {
  const { db, orgId } = freshDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO finance_periods (id, org_id, period_key, starts_on, ends_on, status, reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)`).run("per-closed", orgId, "2099-01", "2099-01-01", "2099-01-31", "closed", now, now);
  assert.throws(() => ledger.postEntry(db, orgId, { date: "2099-01-10", debitCode: "221", creditCode: "611", amount: 1000, sourceType: "invoice", sourceId: "inv-x", periodKey: "2099-01" }), /PERIOD_LOCKED|closed/);
});

test("expense posting debits expense + input VAT and credits payable", () => {
  const { db, orgId } = freshDb();
  ledger.postExpensePosted(db, orgId, { id: "exp-t1", subtotal: 500, vat: 100, total: 600, date: "2026-05-10" });
  const byCode = Object.fromEntries(ledger.trialBalance(db, orgId).rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["711"].balance, 500);
  assert.strictEqual(byCode["226"].balance, 100);
  assert.strictEqual(byCode["521"].balance, -600);
});

test("vatReport nets output VAT (524) against official input VAT (226)", () => {
  const { db, orgId } = freshDb();
  ledger.postInvoicePosted(db, orgId, { id: "inv-v1", total: 1200, vat: 200, subtotal: 1000, date: "2026-05-10" });
  ledger.postExpensePosted(db, orgId, { id: "exp-v1", subtotal: 500, vat: 100, total: 600, date: "2026-05-10" });
  const r = ledger.vatReport(db, orgId);
  assert.strictEqual(r.outputVat, 200);
  assert.strictEqual(r.inputVat, 100);
  assert.strictEqual(r.netVatPayable, 100);
});

test("vatReport still reads legacy 526 input VAT rows from older local databases", () => {
  const { db, orgId } = freshDb();
  ledger.postInvoicePosted(db, orgId, { id: "inv-v-legacy", total: 1200, vat: 200, subtotal: 1000, date: "2026-05-10" });
  ledger.postEntry(db, orgId, {
    date: "2026-05-11",
    debitCode: "526",
    creditCode: "521",
    amount: 100,
    memo: "Legacy input VAT",
    sourceType: "legacy-expense",
    sourceId: "legacy-expense-1"
  });
  const r = ledger.vatReport(db, orgId);
  assert.strictEqual(r.outputVat, 200);
  assert.strictEqual(r.inputVat, 100);
  assert.strictEqual(r.netVatPayable, 100);
});

test("payroll run posts a balanced Dt 714 / Kt 521+525 entry", () => {
  const { db, orgId } = freshDb();
  ledger.postPayrollRun(db, orgId, { id: "pr-1", gross: 600000, net: 436500, totalDeductions: 163500, date: "2026-05-31" });
  const tb = ledger.trialBalance(db, orgId);
  const byCode = Object.fromEntries(tb.rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["714"].balance, 600000);
  assert.strictEqual(byCode["521"].balance, -436500);
  assert.strictEqual(byCode["525"].balance, -163500);
  assert.strictEqual(tb.balanced, true);
});

test("posting a bill debits expense + input VAT and credits payable", () => {
  const { db, orgId } = freshDb();
  ledger.postBillPosted(db, orgId, { id: "bill-t1", subtotal: 500, vat: 100, total: 600, date: "2026-05-10" });
  const byCode = Object.fromEntries(ledger.trialBalance(db, orgId).rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["711"].balance, 500);
  assert.strictEqual(byCode["226"].balance, 100);
  assert.strictEqual(byCode["521"].balance, -600);
});

test("paying a bill settles the payable from cash, staying balanced", () => {
  const { db, orgId } = freshDb();
  ledger.postBillPosted(db, orgId, { id: "bill-t1", subtotal: 500, vat: 100, total: 600, date: "2026-05-10" });
  ledger.postBillPayment(db, orgId, { id: "bp-t1", amount: 600, date: "2026-05-12" });
  const tb = ledger.trialBalance(db, orgId);
  const byCode = Object.fromEntries(tb.rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["521"].balance, 0);
  assert.strictEqual(byCode["251"].balance, -600);
  assert.strictEqual(tb.balanced, true);
});

test("payablesReport ages an outstanding bill", () => {
  const { db, orgId } = freshDb();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO bills (id, org_id, supplier, subtotal, vat, total, currency, bill_date, due_date, status, created_at)
    VALUES ('bill-ap', ?, 'Acme', 500, 100, 600, 'AMD', '2026-04-01', '2026-04-15', 'open', ?)`).run(orgId, now);
  const r = ledger.payablesReport(db, orgId, "2026-05-29");
  assert.strictEqual(r.totalOutstanding, 600);
  assert.strictEqual(r.openBills.length, 1);
  assert.ok(r.openBills[0].daysPastDue > 0);
});
