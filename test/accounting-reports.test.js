"use strict";
// Characterization tests for the remaining untested accounting.js report engines:
//   calculateSummary, budgetReport, monthlySeries.
// These drive dashboards and the budget-vs-actual report, so the sign conventions and
// divide-by-zero guards are high-stakes. Values verified against the live engine.
// Pure engine: require the module directly, no server/app.js, no DB.
const test = require("node:test");
const assert = require("node:assert");
const accounting = require("../server/accounting");

const { calculateSummary, budgetReport, monthlySeries } = accounting;

function baseAccount() {
  return {
    accounts: [
      { id: "611", code: "611", name: "Revenue", type: "income" },
      { id: "711", code: "711", name: "Expense", type: "expense" },
      { id: "251", code: "251", name: "Cash", type: "asset" },
    ],
    journal: [
      { date: "2026-02-10", debitAccount: "251", creditAccount: "611", amount: 100000 }, // revenue 100k
      { date: "2026-02-15", debitAccount: "711", creditAccount: "251", amount: 30000 },  // expense 30k
    ],
    invoices: [],
    expenses: [],
    budgets: [
      { accountId: "611", amount: 120000 },
      { accountId: "711", amount: 25000 },
    ],
  };
}

test("accounting-reports: calculateSummary tallies revenue/expense/profit and counts", () => {
  const s = calculateSummary(baseAccount());
  assert.strictEqual(s.revenue, 100000, "credits to income accounts = revenue");
  assert.strictEqual(s.expenses, 30000, "debits to expense accounts = expenses");
  assert.strictEqual(s.profit, 70000, "profit = revenue - expenses");
  assert.strictEqual(s.journalCount, 2);
  assert.strictEqual(s.invoiceCount, 0);
  assert.strictEqual(s.expenseCount, 0);
});

test("accounting-reports: calculateSummary on an empty account is all-zero", () => {
  const s = calculateSummary({ accounts: [], journal: [], invoices: [], expenses: [] });
  assert.deepStrictEqual(
    { revenue: s.revenue, expenses: s.expenses, profit: s.profit, journalCount: s.journalCount },
    { revenue: 0, expenses: 0, profit: 0, journalCount: 0 }
  );
});

test("accounting-reports: budgetReport sign convention — income actual is the negated credit balance", () => {
  const r = budgetReport(baseAccount());
  const rev = r.rows.find((x) => x.accountId === "611");
  const exp = r.rows.find((x) => x.accountId === "711");

  // Income is credit-natured: actual is read as -balance so revenue shows POSITIVE.
  assert.strictEqual(rev.actual, 100000, "income actual surfaces positive");
  assert.strictEqual(rev.budget, 120000);
  assert.strictEqual(rev.variance, -20000, "under budget on revenue → negative variance");
  assert.strictEqual(rev.percent, 83, "round(100000/120000*100)");

  // Expense is debit-natured: actual is the balance directly.
  assert.strictEqual(exp.actual, 30000);
  assert.strictEqual(exp.variance, 5000, "over budget on expense → positive variance");
  assert.strictEqual(exp.percent, 120);

  // Rows are sorted by account code; totals roll up.
  assert.deepStrictEqual(r.rows.map((x) => x.code), ["611", "711"]);
  assert.deepStrictEqual(r.totals, { budget: 145000, actual: 130000, variance: -15000 });
});

test("accounting-reports: budgetReport guards divide-by-zero and drops unknown accounts", () => {
  // budget 0 → percent is null (NOT 0, NOT Infinity) so the UI can render an em-dash.
  const zeroBudget = {
    accounts: [{ id: "711", code: "711", name: "E", type: "expense" }],
    journal: [{ date: "2026-02-01", debitAccount: "711", creditAccount: "251", amount: 5000 }],
    invoices: [], expenses: [],
    budgets: [{ accountId: "711", amount: 0 }],
  };
  assert.strictEqual(budgetReport(zeroBudget).rows[0].percent, null, "budget=0 → percent null");

  // A budget line referencing an unknown account is dropped, not crashed on.
  const unknown = { accounts: [], journal: [], invoices: [], expenses: [], budgets: [{ accountId: "nope", amount: 100 }] };
  const r = budgetReport(unknown);
  assert.strictEqual(r.rows.length, 0);
  assert.deepStrictEqual(r.totals, { budget: 0, actual: 0, variance: 0 });
});

test("accounting-reports: monthlySeries returns a sorted window ending in the current month", () => {
  const m = monthlySeries(baseAccount(), 6);
  assert.strictEqual(m.months.length, 6, "monthsBack months returned");
  assert.strictEqual(m.revenue.length, 6);
  assert.strictEqual(m.expenses.length, 6);
  assert.deepStrictEqual(m.months, [...m.months].sort(), "ascending chronological order");
  // The last bucket is the current month (YYYY-MM).
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  assert.strictEqual(m.months[5], ym, "last bucket is the current month");
});

test("accounting-reports: monthlySeries buckets in-window entries and ignores out-of-window ones", () => {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const inWindow = {
    accounts: [{ id: "611", code: "611", type: "income" }, { id: "711", code: "711", type: "expense" }],
    journal: [
      { date: `${ym}-05`, debitAccount: "251", creditAccount: "611", amount: 50000 },
      { date: `${ym}-06`, debitAccount: "711", creditAccount: "251", amount: 8000 },
    ],
  };
  const m = monthlySeries(inWindow, 6);
  assert.strictEqual(m.revenue[5], 50000, "current-month revenue bucketed");
  assert.strictEqual(m.expenses[5], 8000, "current-month expense bucketed");

  // An entry a decade old falls outside the 6-month window → contributes nothing.
  const old = {
    accounts: [{ id: "611", code: "611", type: "income" }],
    journal: [{ date: "2016-01-05", debitAccount: "251", creditAccount: "611", amount: 99999 }],
  };
  const mo = monthlySeries(old, 6);
  assert.strictEqual(mo.revenue.reduce((s, x) => s + x, 0), 0, "out-of-window entry ignored");
});
