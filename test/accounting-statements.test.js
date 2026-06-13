"use strict";
// Characterization tests for the financial-statement assembly in server/accounting.js:
//   financialStatements (income statement, balance sheet, cash flow) + expenseBreakdown.
// The balance-sheet identity is the headline invariant: a correctly-kept double-entry book
// balances ONLY when current-period net profit is counted on the equity side (retained
// earnings), because it hasn't been closed into an equity account yet. Values verified live.
// Pure engine: require the module directly, no server/app.js, no DB.
const test = require("node:test");
const assert = require("node:assert");
const accounting = require("../server/accounting");

const { financialStatements, expenseBreakdown } = accounting;

// A small, genuinely-balanced book: 200k equity injection to cash, 100k revenue to cash,
// 30k rent + 12k supplies paid from cash.
function balancedBook() {
  return {
    accounts: [
      { id: "251", code: "251", name: "Cash", type: "asset" },
      { id: "311", code: "311", name: "Capital", type: "equity" },
      { id: "611", code: "611", name: "Revenue", type: "income" },
      { id: "711", code: "711", name: "Rent", type: "expense" },
      { id: "712", code: "712", name: "Supplies", type: "expense" },
    ],
    journal: [
      { date: "2026-02-01", debitAccount: "251", creditAccount: "311", amount: 200000 },
      { date: "2026-02-10", debitAccount: "251", creditAccount: "611", amount: 100000 },
      { date: "2026-02-15", debitAccount: "711", creditAccount: "251", amount: 30000 },
      { date: "2026-02-20", debitAccount: "712", creditAccount: "251", amount: 12000 },
    ],
    invoices: [], expenses: [],
  };
}

test("accounting-statements: income statement nets revenue against expenses", () => {
  const fs = financialStatements(balancedBook());
  const is = fs.incomeStatement;
  assert.strictEqual(is.totalIncome, 100000);
  assert.strictEqual(is.totalExpense, 42000, "30000 rent + 12000 supplies");
  assert.strictEqual(is.netProfit, 58000);
  // Income/expense rows surface their natural (positive) magnitudes, sorted by code.
  assert.deepStrictEqual(is.income.map((r) => r.amount), [100000]);
  assert.deepStrictEqual(is.expense.map((r) => [r.code, r.amount]), [["711", 30000], ["712", 12000]]);
});

test("accounting-statements: the balance sheet balances WITH net profit on the equity side", () => {
  const fs = financialStatements(balancedBook());
  const bs = fs.balanceSheet;
  assert.strictEqual(bs.totalAssets, 258000, "cash 200k + 100k - 30k - 12k");
  assert.strictEqual(bs.totalLiabilities, 0);
  assert.strictEqual(bs.totalEquity, 200000, "the capital injection");
  assert.strictEqual(bs.retainedEarnings, 58000, "current-period net profit, not yet closed to equity");
  assert.strictEqual(bs.totalEquityAndLiabilities, 258000, "liabilities + equity + net profit");
  assert.strictEqual(bs.balanced, true, "assets == liabilities + equity + net profit");
  // The identity must hold exactly: omitting net profit would (wrongly) look unbalanced.
  assert.strictEqual(bs.totalAssets, bs.totalLiabilities + bs.totalEquity + bs.retainedEarnings);
});

test("accounting-statements: cash flow tracks debits/credits to cash (25x) accounts", () => {
  const fs = financialStatements(balancedBook());
  const cf = fs.cashFlow;
  assert.strictEqual(cf.cashIn, 300000, "200k equity + 100k revenue both debit cash");
  assert.strictEqual(cf.cashOut, 42000, "30k + 12k credited out of cash");
  assert.strictEqual(cf.netCashChange, 258000, "matches the ending cash balance");
});

test("accounting-statements: an empty book balances trivially (all zero)", () => {
  const fs = financialStatements({ accounts: [], journal: [], invoices: [], expenses: [] });
  assert.strictEqual(fs.incomeStatement.netProfit, 0);
  assert.strictEqual(fs.balanceSheet.totalAssets, 0);
  assert.strictEqual(fs.balanceSheet.balanced, true, "0 == 0");
  assert.strictEqual(fs.cashFlow.netCashChange, 0);
});

test("accounting-statements: expenseBreakdown is a descending Pareto of expense accounts", () => {
  const rows = expenseBreakdown(balancedBook());
  assert.deepStrictEqual(
    rows.map((r) => [r.label, r.amount]),
    [["Rent", 30000], ["Supplies", 12000]],
    "biggest cost first; zero/non-expense accounts excluded"
  );
  // No revenue/asset accounts leak in, and nothing with a zero amount.
  assert.ok(rows.every((r) => r.amount > 0));
});

test("accounting-statements: expenseBreakdown on a book with no expenses is empty", () => {
  const noExpenses = {
    accounts: [{ id: "611", code: "611", name: "Revenue", type: "income" }, { id: "251", code: "251", name: "Cash", type: "asset" }],
    journal: [{ date: "2026-02-10", debitAccount: "251", creditAccount: "611", amount: 5000 }],
    invoices: [], expenses: [],
  };
  assert.deepStrictEqual(expenseBreakdown(noExpenses), []);
});
