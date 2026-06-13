/**
 * Shared accounting calculations for HayHashvapah Web Claude (Phase 3).
 *
 * Single source of truth used by BOTH the Node server (require) and the browser
 * client (window.HHVAccounting), so reports computed offline match the API
 * exactly. Pure functions, no I/O. UMD wrapper makes it load in either runtime.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.HHVAccounting = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const LEGACY_MONEY_SCALE = Object.freeze({
    injected: false,
    toMinor: (value) => Math.round((Number(value) || 0) * 100),
    fromMinor: (value) => Math.round((Number(value) || 0)) / 100,
    fromStored: (value) => Math.round((Number(value) || 0) * 100) / 100,
    nonZero: (value) => Math.abs(value) > 0.0001,
    balanced: (left, right) => Math.abs(left - right) < 0.01,
  });

  function moneyScaleFromOptions(options = {}) {
    const money = options.money || options.moneyScale;
    if (!money || typeof money.toMinor !== "function" || typeof money.fromMinor !== "function") {
      return LEGACY_MONEY_SCALE;
    }
    return {
      injected: true,
      subunit: Number.isInteger(money.subunit) ? money.subunit : 0,
      toMinor: (value) => money.toMinor(value),
      fromMinor: (value) => money.fromMinor(value),
      // With an injected scale the accounting model stores integer minor units already.
      fromStored: (value) => money.fromMinor(Math.round(Number(value) || 0)),
      nonZero: (minorValue) => Math.abs(Math.round(Number(minorValue) || 0)) >= 1,
      balanced: (leftMinor, rightMinor) => Math.round(leftMinor) === Math.round(rightMinor),
    };
  }

  function roundMoney(value, options = {}) {
    const scale = moneyScaleFromOptions(options);
    if (!scale.injected) return scale.fromStored(value);
    return scale.fromMinor(scale.toMinor(value));
  }

  function isValidDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function inPeriod(value, period = {}) {
    if (!value) return false;
    const date = String(value).slice(0, 10);
    if (period.start && date < period.start) return false;
    if (period.end && date > period.end) return false;
    return true;
  }

  function filterByPeriod(items, period = {}) {
    return (items || []).filter((item) => inPeriod(item.date || item.createdAt, period));
  }

  function calculateSummary(account, period = {}) {
    const revenueIds = new Set(account.accounts.filter((item) => item.type === "income").map((item) => item.id));
    const expenseIds = new Set(account.accounts.filter((item) => item.type === "expense").map((item) => item.id));
    const journal = filterByPeriod(account.journal, period);
    const invoices = filterByPeriod(account.invoices, period);
    const expensesList = filterByPeriod(account.expenses, period);
    let revenue = 0;
    let expenses = 0;

    journal.forEach((entry) => {
      if (revenueIds.has(entry.creditAccount)) {
        revenue += Number(entry.amount) || 0;
      }
      if (expenseIds.has(entry.debitAccount)) {
        expenses += Number(entry.amount) || 0;
      }
    });

    revenue = roundMoney(revenue);
    expenses = roundMoney(expenses);

    return {
      revenue,
      expenses,
      profit: roundMoney(revenue - expenses),
      invoiceCount: invoices.length,
      expenseCount: expensesList.length,
      journalCount: journal.length,
    };
  }

  function calculateBalances(account, period = {}) {
    return filterByPeriod(account.journal, period).reduce((balances, entry) => {
      if (!balances[entry.debitAccount]) {
        balances[entry.debitAccount] = { debit: 0, credit: 0, balance: 0 };
      }
      if (!balances[entry.creditAccount]) {
        balances[entry.creditAccount] = { debit: 0, credit: 0, balance: 0 };
      }

      balances[entry.debitAccount].debit += Number(entry.amount) || 0;
      balances[entry.creditAccount].credit += Number(entry.amount) || 0;
      balances[entry.debitAccount].balance += Number(entry.amount) || 0;
      balances[entry.creditAccount].balance -= Number(entry.amount) || 0;

      return balances;
    }, {});
  }

  function calculateTaxReport(account, period = {}) {
    const invoices = filterByPeriod(account.invoices, period);
    const expenses = filterByPeriod(account.expenses, period);
    const taxableSales = invoices.filter((invoice) => Number(invoice.vatRate) > 0);
    const nonVatSales = invoices.filter((invoice) => Number(invoice.vatRate) <= 0);
    const outputVat = roundMoney(taxableSales.reduce((sum, invoice) => sum + (Number(invoice.vatAmount) || 0), 0));
    const inputVat = roundMoney(expenses.reduce((sum, expense) => sum + (Number(expense.vatAmount) || 0), 0));
    const salesNet = roundMoney(invoices.reduce((sum, invoice) => sum + (Number(invoice.netAmount) || 0), 0));
    const salesGross = roundMoney(invoices.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0));
    const expenseNet = roundMoney(expenses.reduce((sum, expense) => sum + (Number(expense.netAmount) || 0), 0));
    const expenseGross = roundMoney(expenses.reduce((sum, expense) => sum + (Number(expense.total) || 0), 0));

    return {
      salesNet,
      salesGross,
      expenseNet,
      expenseGross,
      taxableSalesNet: roundMoney(taxableSales.reduce((sum, invoice) => sum + (Number(invoice.netAmount) || 0), 0)),
      nonVatSalesNet: roundMoney(nonVatSales.reduce((sum, invoice) => sum + (Number(invoice.netAmount) || 0), 0)),
      outputVat,
      inputVat,
      netVatPayable: roundMoney(outputVat - inputVat),
      invoiceCount: invoices.length,
      expenseCount: expenses.length,
      note: "Indicative VAT and turnover summary; review with an Armenian accountant before filing.",
    };
  }

  function agingBucket(daysPastDue) {
    if (daysPastDue <= 0) return "current";
    if (daysPastDue <= 30) return "days1To30";
    if (daysPastDue <= 60) return "days31To60";
    if (daysPastDue <= 90) return "days61To90";
    return "over90";
  }

  function calculateDaysPastDue(dueDate, asOf) {
    const due = Date.parse(`${String(dueDate).slice(0, 10)}T00:00:00Z`);
    const current = Date.parse(`${String(asOf).slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(due) || !Number.isFinite(current)) return 0;
    return Math.max(0, Math.floor((current - due) / DAY_MS));
  }

  function invoicePaidAmount(invoice) {
    if (invoice.paidAmount !== undefined && invoice.paidAmount !== null && invoice.paidAmount !== "") {
      return roundMoney(Math.max(0, Number(invoice.paidAmount) || 0));
    }

    const explicit = Number(invoice.paidAmount);
    if (Number.isFinite(explicit) && explicit > 0) {
      return roundMoney(explicit);
    }

    const paymentsTotal = Array.isArray(invoice.payments)
      ? invoice.payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
      : 0;
    if (paymentsTotal > 0) {
      return roundMoney(paymentsTotal);
    }

    return invoice.status === "paid" ? roundMoney(Number(invoice.total) || 0) : 0;
  }

  function invoiceOutstanding(invoice) {
    return Math.max(0, roundMoney((Number(invoice.total) || 0) - invoicePaidAmount(invoice)));
  }

  function defaultInvoiceDueDate(date) {
    const base = Date.parse(`${String(date || new Date().toISOString()).slice(0, 10)}T00:00:00Z`);
    const due = Number.isFinite(base) ? new Date(base + 14 * DAY_MS) : new Date(Date.now() + 14 * DAY_MS);
    return due.toISOString().slice(0, 10);
  }

  function buildAgingTotals(invoices) {
    return invoices.reduce(
      (totals, invoice) => {
        totals[invoice.agingBucket] = roundMoney((totals[invoice.agingBucket] || 0) + invoice.outstanding);
        return totals;
      },
      { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, over90: 0 },
    );
  }

  function calculateReceivables(account, period = {}) {
    const asOf = period.asOf || period.end || new Date().toISOString().slice(0, 10);
    const invoices = filterByPeriod(account.invoices, period)
      .filter((invoice) => invoice.status !== "draft")
      .map((invoice) => {
        const paidAmount = invoicePaidAmount(invoice);
        const outstanding = invoiceOutstanding(invoice);
        const dueDate = invoice.dueDate || defaultInvoiceDueDate(invoice.date);
        const daysPastDue = outstanding > 0 ? calculateDaysPastDue(dueDate, asOf) : 0;
        return {
          id: invoice.id,
          customer: invoice.customer,
          customerContactId: invoice.customerContactId || "",
          date: invoice.date,
          dueDate,
          description: invoice.description,
          total: roundMoney(Number(invoice.total) || 0),
          paidAmount,
          outstanding,
          status: invoice.status,
          daysPastDue,
          agingBucket: agingBucket(daysPastDue),
          paymentCount: Array.isArray(invoice.payments) ? invoice.payments.length : 0,
        };
      });
    const openInvoices = invoices.filter((invoice) => invoice.outstanding > 0);
    const aging = buildAgingTotals(openInvoices);

    return {
      asOf,
      totalInvoiced: roundMoney(invoices.reduce((sum, invoice) => sum + invoice.total, 0)),
      totalPaid: roundMoney(invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0)),
      totalOutstanding: roundMoney(openInvoices.reduce((sum, invoice) => sum + invoice.outstanding, 0)),
      overdueOutstanding: roundMoney(
        openInvoices.reduce((sum, invoice) => sum + (invoice.daysPastDue > 0 ? invoice.outstanding : 0), 0),
      ),
      invoiceCount: invoices.length,
      openCount: openInvoices.length,
      aging,
      openInvoices,
      invoices,
    };
  }

  // Accounts payable aging from supplier bills (mirror of calculateReceivables).
  function calculatePayables(account, period = {}) {
    const asOf = period.asOf || period.end || new Date().toISOString().slice(0, 10);
    const bills = filterByPeriod(account.bills || [], period).map((bill) => {
      const paidAmount = invoicePaidAmount(bill);
      const outstanding = invoiceOutstanding(bill);
      const dueDate = bill.dueDate || defaultInvoiceDueDate(bill.date);
      const daysPastDue = outstanding > 0 ? calculateDaysPastDue(dueDate, asOf) : 0;
      return {
        id: bill.id,
        supplier: bill.supplier,
        date: bill.date,
        dueDate,
        description: bill.description,
        total: roundMoney(Number(bill.total) || 0),
        paidAmount,
        outstanding,
        status: bill.status,
        daysPastDue,
        agingBucket: agingBucket(daysPastDue),
      };
    });
    const openBills = bills.filter((bill) => bill.outstanding > 0);
    const aging = buildAgingTotals(openBills);
    return {
      asOf,
      totalBilled: roundMoney(bills.reduce((sum, b) => sum + b.total, 0)),
      totalPaid: roundMoney(bills.reduce((sum, b) => sum + b.paidAmount, 0)),
      totalOutstanding: roundMoney(openBills.reduce((sum, b) => sum + b.outstanding, 0)),
      overdueOutstanding: roundMoney(openBills.reduce((sum, b) => sum + (b.daysPastDue > 0 ? b.outstanding : 0), 0)),
      billCount: bills.length,
      openCount: openBills.length,
      aging,
      openBills,
      bills,
    };
  }

  /**
   * Formal financial statements from the ledger: income statement (P&L),
   * balance sheet, and a direct cash-flow summary. Pure function — same result
   * on server, client, and in tests.
   */
  function financialStatements(account, period = {}, options = {}) {
    const scale = moneyScaleFromOptions(options);
    const accById = new Map((account.accounts || []).map((a) => [a.id, a]));
    const balances = calculateBalances(account, period);
    const groups = { asset: [], liability: [], equity: [], income: [], expense: [] };

    for (const [id, bal] of Object.entries(balances)) {
      const acc = accById.get(id);
      if (!acc || !groups[acc.type]) continue;
      // Assets and expenses are debit-natured; liabilities, equity, income are credit-natured.
      const debitNatured = acc.type === "asset" || acc.type === "expense";
      const rawAmount = debitNatured ? bal.balance : -bal.balance;
      const minorAmount = scale.injected ? Math.round(Number(rawAmount) || 0) : roundMoney(rawAmount);
      groups[acc.type].push({ id, code: acc.code, name: acc.name, amount: scale.fromStored(rawAmount), minorAmount });
    }

    const sumMinor = (rows) => rows.reduce((s, r) => s + r.minorAmount, 0);
    const display = (value) => scale.injected ? scale.fromMinor(value) : roundMoney(value);
    const publicRows = (rows) => rows
      .filter((r) => scale.nonZero(scale.injected ? r.minorAmount : r.amount))
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map(({ minorAmount, ...row }) => row);

    const totalIncomeMinor = sumMinor(groups.income);
    const totalExpenseMinor = sumMinor(groups.expense);
    const netProfitMinor = totalIncomeMinor - totalExpenseMinor;

    const totalAssetsMinor = sumMinor(groups.asset);
    const totalLiabilitiesMinor = sumMinor(groups.liability);
    const totalEquityMinor = sumMinor(groups.equity);

    // Cash detection is locale-specific (RA cash = 25x; RF = 50/51/52/55/57). The caller may
    // inject `options.isCashAccount`; default to the historical RA /^25/ prefix.
    const isCashAccount = typeof options.isCashAccount === "function"
      ? options.isCashAccount
      : (a) => a.type === "asset" && /^25/.test(String(a.code));
    const cashIds = new Set((account.accounts || []).filter(isCashAccount).map((a) => a.id));
    let cashIn = 0;
    let cashOut = 0;
    filterByPeriod(account.journal, period).forEach((entry) => {
      if (cashIds.has(entry.debitAccount)) cashIn += Number(entry.amount) || 0;
      if (cashIds.has(entry.creditAccount)) cashOut += Number(entry.amount) || 0;
    });

    const equityAndLiabilitiesMinor = totalLiabilitiesMinor + totalEquityMinor + netProfitMinor;

    return {
      incomeStatement: {
        income: publicRows(groups.income),
        expense: publicRows(groups.expense),
        totalIncome: display(totalIncomeMinor),
        totalExpense: display(totalExpenseMinor),
        netProfit: display(netProfitMinor),
      },
      balanceSheet: {
        assets: publicRows(groups.asset),
        liabilities: publicRows(groups.liability),
        equity: publicRows(groups.equity),
        totalAssets: display(totalAssetsMinor),
        totalLiabilities: display(totalLiabilitiesMinor),
        totalEquity: display(totalEquityMinor),
        retainedEarnings: display(netProfitMinor),
        totalEquityAndLiabilities: display(equityAndLiabilitiesMinor),
        balanced: scale.balanced(totalAssetsMinor, equityAndLiabilitiesMinor),
      },
      cashFlow: {
        cashIn: scale.fromStored(cashIn),
        cashOut: scale.fromStored(cashOut),
        netCashChange: scale.fromStored(cashIn - cashOut),
      },
    };
  }

  /**
   * Budget vs actual for the selected period. Actual is the account's natural-sign
   * balance from the ledger; variance = actual − budget.
   */
  function budgetReport(account, period = {}) {
    const accById = new Map((account.accounts || []).map((a) => [a.id, a]));
    const balances = calculateBalances(account, period);
    const rows = (account.budgets || [])
      .map((b) => {
        const acc = accById.get(b.accountId);
        if (!acc) return null;
        const bal = balances[b.accountId] || { balance: 0 };
        const debitNatured = acc.type === "asset" || acc.type === "expense";
        const actual = roundMoney(debitNatured ? bal.balance : -bal.balance);
        const budget = roundMoney(Number(b.amount) || 0);
        return {
          accountId: b.accountId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          budget,
          actual,
          variance: roundMoney(actual - budget),
          percent: budget > 0 ? Math.round((actual / budget) * 100) : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
    const totals = rows.reduce((t, r) => ({ budget: t.budget + r.budget, actual: t.actual + r.actual }), { budget: 0, actual: 0 });
    totals.budget = roundMoney(totals.budget);
    totals.actual = roundMoney(totals.actual);
    totals.variance = roundMoney(totals.actual - totals.budget);
    return { rows, totals };
  }

  /**
   * Monthly revenue/expense series for dashboard charts (Phase 3).
   * Returns { months: ["YYYY-MM", ...], revenue: [...], expenses: [...] }.
   */
  function monthlySeries(account, monthsBack = 6) {
    const revenueIds = new Set(account.accounts.filter((i) => i.type === "income").map((i) => i.id));
    const expenseIds = new Set(account.accounts.filter((i) => i.type === "expense").map((i) => i.id));
    const months = [];
    const now = new Date();
    for (let i = monthsBack - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const revenue = months.map(() => 0);
    const expenses = months.map(() => 0);
    (account.journal || []).forEach((entry) => {
      const key = String(entry.date || entry.createdAt || "").slice(0, 7);
      const idx = months.indexOf(key);
      if (idx === -1) return;
      if (revenueIds.has(entry.creditAccount)) revenue[idx] += Number(entry.amount) || 0;
      if (expenseIds.has(entry.debitAccount)) expenses[idx] += Number(entry.amount) || 0;
    });
    return {
      months,
      revenue: revenue.map(roundMoney),
      expenses: expenses.map(roundMoney),
    };
  }

  /**
   * Expense totals grouped by expense account, for a breakdown chart.
   * Returns [{ id, label, amount }] sorted desc.
   */
  function expenseBreakdown(account, period = {}) {
    const expenseAccounts = new Map(
      account.accounts.filter((i) => i.type === "expense").map((i) => [i.id, i.name]),
    );
    const totals = {};
    filterByPeriod(account.journal, period).forEach((entry) => {
      if (expenseAccounts.has(entry.debitAccount)) {
        totals[entry.debitAccount] = roundMoney((totals[entry.debitAccount] || 0) + (Number(entry.amount) || 0));
      }
    });
    return Object.entries(totals)
      .map(([id, amount]) => ({ id, label: expenseAccounts.get(id) || id, amount }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }

  return {
    DAY_MS,
    roundMoney,
    moneyScaleFromOptions,
    isValidDate,
    inPeriod,
    filterByPeriod,
    calculateSummary,
    calculateBalances,
    calculateTaxReport,
    agingBucket,
    calculateDaysPastDue,
    invoicePaidAmount,
    invoiceOutstanding,
    defaultInvoiceDueDate,
    buildAgingTotals,
    calculateReceivables,
    calculatePayables,
    financialStatements,
    budgetReport,
    monthlySeries,
    expenseBreakdown,
  };
});
