"use strict";
const test = require("node:test");
const assert = require("node:assert");
const acc = require("../server/accounting");
const locale = require("../server/locale");

function model() {
  return {
    accounts: [
      { id: "a-cash", code: "251", name: "Դրամարկղ", type: "asset" },
      { id: "a-rev", code: "611", name: "Հասույթ", type: "income" },
      { id: "a-rec", code: "221", name: "Դեբիտորական", type: "asset" },
      { id: "a-vat", code: "524", name: "ԱԱՀ վճարվելիք", type: "liability" }
    ],
    journal: [
      { date: "2026-05-10", debitAccount: "a-cash", creditAccount: "a-rev", amount: 1000 }
    ],
    invoices: [
      { id: "inv1", date: "2026-05-10", status: "posted", vatRate: 20, vatAmount: 200, netAmount: 1000, total: 1200 }
    ],
    expenses: []
  };
}

test("calculateBalances reflects a Dt cash / Kt revenue entry", () => {
  const b = acc.calculateBalances(model());
  assert.strictEqual(b["a-cash"].balance, 1000);
  assert.strictEqual(b["a-rev"].balance, -1000);
});

test("financialStatements: income 1000, net profit 1000, balanced", () => {
  const s = acc.financialStatements(model());
  assert.strictEqual(s.incomeStatement.totalIncome, 1000);
  assert.strictEqual(s.incomeStatement.netProfit, 1000);
  assert.strictEqual(s.balanceSheet.balanced, true);
});

test("calculateTaxReport computes output VAT and net payable", () => {
  const r = acc.calculateTaxReport(model());
  assert.strictEqual(r.outputVat, 200);
  assert.strictEqual(r.inputVat, 0);
  assert.strictEqual(r.netVatPayable, 200);
});

test("roundMoney rounds to 2 decimals", () => {
  assert.strictEqual(acc.roundMoney(1.234), 1.23);
});

test("roundMoney honors injected locale money scale", () => {
  assert.strictEqual(acc.roundMoney(1.234, { money: locale.profileFor("am").money }), 1);
  assert.strictEqual(acc.roundMoney(123.455, { money: locale.profileFor("ru").money }), 123.46);
});

test("financialStatements descales RU integer kopecks for display", () => {
  const ruMoney = locale.profileFor("ru").money;
  const s = acc.financialStatements({
    accounts: [
      { id: "51", code: "51", name: "Расчетный счет", type: "asset" },
      { id: "80", code: "80", name: "Уставный капитал", type: "equity" },
      { id: "90", code: "90.01", name: "Выручка", type: "income" },
      { id: "26", code: "26", name: "Общехозяйственные расходы", type: "expense" },
    ],
    journal: [
      { date: "2026-05-01", debitAccount: "51", creditAccount: "80", amount: 100000 },
      { date: "2026-05-10", debitAccount: "51", creditAccount: "90", amount: 12345 },
      { date: "2026-05-11", debitAccount: "26", creditAccount: "51", amount: 2345 },
    ],
    invoices: [],
    expenses: []
  }, {}, { money: ruMoney, isCashAccount: (account) => account.code === "51" });

  assert.strictEqual(s.incomeStatement.totalIncome, 123.45);
  assert.strictEqual(s.incomeStatement.totalExpense, 23.45);
  assert.strictEqual(s.incomeStatement.netProfit, 100);
  assert.strictEqual(s.balanceSheet.totalAssets, 1100);
  assert.strictEqual(s.balanceSheet.totalEquity, 1000);
  assert.strictEqual(s.balanceSheet.retainedEarnings, 100);
  assert.strictEqual(s.balanceSheet.balanced, true);
  assert.strictEqual(s.cashFlow.cashIn, 1123.45);
  assert.strictEqual(s.cashFlow.cashOut, 23.45);
});

test("financialStatements with injected scale does not hide a one-minor-unit imbalance", () => {
  const ruMoney = locale.profileFor("ru").money;
  const s = acc.financialStatements({
    accounts: [
      { id: "51", code: "51", name: "Расчетный счет", type: "asset" },
      { id: "unknown-income", code: "X", name: "Unmapped revenue", type: "income" },
    ],
    journal: [
      { date: "2026-05-01", debitAccount: "51", creditAccount: "missing", amount: 1 },
    ],
    invoices: [],
    expenses: []
  }, {}, { money: ruMoney, isCashAccount: (account) => account.code === "51" });

  assert.strictEqual(s.balanceSheet.totalAssets, 0.01);
  assert.strictEqual(s.balanceSheet.totalEquityAndLiabilities, 0);
  assert.strictEqual(s.balanceSheet.balanced, false);
});
