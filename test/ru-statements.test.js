"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { openDatabase } = require("../server/db");
const ledger = require("../server/ledger");
const accounting = require("../server/accounting");
const locale = require("../server/locale");
const { cashMatcherFor } = require("../server/postingCodes");

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

test("cashMatcherFor: RU recognizes 50/51/52/55/57; AM recognizes 25x", () => {
  const ru = cashMatcherFor("ru");
  assert.equal(ru({ type: "asset", code: "51" }), true);
  assert.equal(ru({ type: "asset", code: "50" }), true);
  assert.equal(ru({ type: "asset", code: "62" }), false);
  const am = cashMatcherFor("am");
  assert.equal(am({ type: "asset", code: "251" }), true);
  assert.equal(am({ type: "asset", code: "51" }), false);
});

test("RU cash-flow statement detects the bank account (51) as cash", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postInvoicePosted(db, orgId, { id: "inv-1", total: 1000, vat: 0, date: "2026-05-10" });
    ledger.postPaymentReceived(db, orgId, { id: "pay-1", amount: 1000, date: "2026-05-12" }); // DR51 / CR62
    const model = ledger.buildLedgerModel(db, orgId);
    const fs = accounting.financialStatements(model, {}, {
      isCashAccount: cashMatcherFor("ru"),
      money: locale.profileFor("ru").money
    });
    assert.equal(fs.cashFlow.cashIn, 1000); // money into расчётный счёт 51
    assert.equal(fs.cashFlow.netCashChange, 1000);
  });
});

test("default cash detection (no matcher) stays AM /^25/ behavior", () => {
  withLocale(undefined, () => {
    const { db, orgId } = freshDb();
    ledger.postInvoicePosted(db, orgId, { id: "inv-1", total: 1000, vat: 0, date: "2026-05-10" });
    ledger.postPaymentReceived(db, orgId, { id: "pay-1", amount: 1000, date: "2026-05-12" }); // DR251 / CR221
    const model = ledger.buildLedgerModel(db, orgId);
    const fs = accounting.financialStatements(model); // no options → default /^25/
    assert.equal(fs.cashFlow.cashIn, 1000); // money into cash 251
  });
});
