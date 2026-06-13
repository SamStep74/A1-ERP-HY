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

test("opening balances keep the trial balance and balance sheet balanced", () => {
  const { db, orgId } = freshDb();
  ledger.postOpeningBalances(db, orgId, { asOf: "2026-01-01", entries: [
    { code: "251", amount: 1000000 }, // cash
    { code: "521", amount: 400000 },  // payable
  ] });
  const tb = ledger.trialBalance(db, orgId);
  assert.strictEqual(tb.balanced, true);
  const byCode = Object.fromEntries(tb.rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["251"].balance, 1000000);
  assert.strictEqual(byCode["521"].balance, -400000);
  assert.strictEqual(byCode["331"].balance, -600000); // net opening equity (credit)
  const s = accounting.financialStatements(ledger.buildLedgerModel(db, orgId));
  assert.strictEqual(s.balanceSheet.balanced, true);
  assert.strictEqual(s.balanceSheet.totalAssets, 1000000);
  assert.strictEqual(s.balanceSheet.totalLiabilities, 400000);
  assert.strictEqual(s.balanceSheet.totalEquity, 600000);
});

test("opening balances are idempotent per account + date", () => {
  const { db, orgId } = freshDb();
  const payload = { asOf: "2026-01-01", entries: [{ code: "251", amount: 1000000 }] };
  ledger.postOpeningBalances(db, orgId, payload);
  ledger.postOpeningBalances(db, orgId, payload);
  const count = db.prepare("SELECT COUNT(*) AS c FROM ledger_journal WHERE org_id = ? AND source_type = 'opening_balance'").get(orgId).c;
  assert.strictEqual(count, 1);
});

test("openingBalances() lists entries and net opening equity", () => {
  const { db, orgId } = freshDb();
  ledger.postOpeningBalances(db, orgId, { asOf: "2026-01-01", entries: [
    { code: "251", amount: 1000000 },
    { code: "521", amount: 400000 },
  ] });
  const ob = ledger.openingBalances(db, orgId);
  assert.strictEqual(ob.count, 2);
  assert.strictEqual(ob.openingEquity, 600000);
  const cash = ob.entries.find(e => e.code === "251");
  assert.strictEqual(cash.side, "debit");
  assert.strictEqual(cash.amount, 1000000);
});

test("the opening-balance contra account (331) cannot be set directly, unknown codes are skipped", () => {
  const { db, orgId } = freshDb();
  const res = ledger.postOpeningBalances(db, orgId, { asOf: "2026-01-01", entries: [
    { code: "331", amount: 500000 }, // contra — ignored
    { code: "999", amount: 500000 }, // unknown — ignored
  ] });
  assert.strictEqual(res.count, 0);
});

test("opening balances support official contra-asset credit-side accounts", () => {
  const { db, orgId } = freshDb();
  const res = ledger.postOpeningBalances(db, orgId, { asOf: "2026-01-01", entries: [
    { code: "111", amount: 1000000 }, // depreciable fixed assets
    { code: "112", amount: 200000 },  // accumulated depreciation defaults to credit side
  ] });
  assert.strictEqual(res.count, 2);
  const byCode = Object.fromEntries(ledger.trialBalance(db, orgId).rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["111"].balance, 1000000);
  assert.strictEqual(byCode["112"].balance, -200000);
  assert.strictEqual(byCode["331"].balance, -800000);
  const ob = ledger.openingBalances(db, orgId);
  assert.strictEqual(ob.openingEquity, 800000);
  assert.strictEqual(ob.entries.find(entry => entry.code === "112").side, "credit");
  const statements = accounting.financialStatements(ledger.buildLedgerModel(db, orgId));
  assert.strictEqual(statements.balanceSheet.totalAssets, 800000);
  assert.strictEqual(statements.balanceSheet.totalEquity, 800000);
  assert.strictEqual(statements.balanceSheet.balanced, true);
});

test("opening balances skip side mismatches for configured accounts", () => {
  const { db, orgId } = freshDb();
  const res = ledger.postOpeningBalances(db, orgId, { asOf: "2026-01-01", entries: [
    { code: "111", amount: 1000000, side: "credit" },
    { code: "112", amount: 200000, side: "debit" },
  ] });
  assert.strictEqual(res.count, 0);
  const count = db.prepare("SELECT COUNT(*) AS c FROM ledger_journal WHERE org_id = ? AND source_type = 'opening_balance'").get(orgId).c;
  assert.strictEqual(count, 0);
});

test("re-submitting an opening balance corrects it (replace semantics, single row)", () => {
  const { db, orgId } = freshDb();
  ledger.postOpeningBalances(db, orgId, { asOf: "2026-01-01", entries: [{ code: "251", amount: 1000000 }] });
  ledger.postOpeningBalances(db, orgId, { asOf: "2026-02-01", entries: [{ code: "251", amount: 1200000 }] });
  const rows = db.prepare("SELECT COUNT(*) AS c FROM ledger_journal WHERE org_id = ? AND source_type = 'opening_balance' AND (debit_code = '251' OR credit_code = '251')").get(orgId).c;
  assert.strictEqual(rows, 1); // corrected in place, not duplicated across dates
  const byCode = Object.fromEntries(ledger.trialBalance(db, orgId).rows.map(r => [r.code, r]));
  assert.strictEqual(byCode["251"].balance, 1200000);
  assert.strictEqual(ledger.openingBalances(db, orgId).openingEquity, 1200000);
});

test("submitting amount 0 clears an account's opening balance", () => {
  const { db, orgId } = freshDb();
  ledger.postOpeningBalances(db, orgId, { asOf: "2026-01-01", entries: [{ code: "251", amount: 1000000 }] });
  ledger.postOpeningBalances(db, orgId, { asOf: "2026-01-01", entries: [{ code: "251", amount: 0 }] });
  assert.strictEqual(ledger.openingBalances(db, orgId).count, 0);
});
