"use strict";
const crypto = require("node:crypto");
const accounting = require("./accounting");
const locale = require("./locale");
const { projectAccount, chartSourceFor } = require("./chartProjection");
const { postingCodesFor } = require("./postingCodes");
const { openingBalanceConfigFor } = require("./openingBalanceRules");

// Locale-aware chart of accounts. The active fiscal profile (A1_LOCALE → "am" default | "ru")
// is resolved through the locale facade and projected onto the seeding shape {code,name,type}:
// AM is the historical identity (name=hy, type=type); RU is План счетов 94н (name=ru, derived
// type). Resolved charts are cached per locale; activeChart() never freezes to one locale at
// module load, so the runtime switch reaches seeding/reports. The exported CHART/CHART_SOURCE
// stay the AM projection for backward compatibility — all internal logic uses activeChart().
const _chartCache = new Map();
function activeChart() {
  const code = locale.activeLocale();
  let chart = _chartCache.get(code);
  if (!chart) {
    chart = Object.freeze(
      locale.profileFor(code).chartOfAccounts.accounts().map((a) => projectAccount(code, a))
    );
    _chartCache.set(code, chart);
  }
  return chart;
}
function activeClasses() {
  return locale.profileFor(locale.activeLocale()).chartOfAccounts.classes();
}
function activeChartSource() {
  return chartSourceFor(locale.activeLocale(), activeChart().length);
}

const CHART = Object.freeze(
  locale.profileFor("am").chartOfAccounts.accounts().map((a) => projectAccount("am", a))
);

const INPUT_VAT_ACCOUNT_CODE = "226";
const LEGACY_INPUT_VAT_ACCOUNT_CODE = "526";
const INPUT_VAT_ACCOUNT_CODES = [INPUT_VAT_ACCOUNT_CODE, LEGACY_INPUT_VAT_ACCOUNT_CODE];

// Locale-aware opening-balance rules (equity offset + openable accounts/sides), cached per
// locale and resolved via server/openingBalanceRules.js. Internal logic uses obConfig();
// the exported AM constants below stay the Republic-of-Armenia set for backward compatibility.
const _obCache = new Map();
function openingRuleSides(rule) {
  return Array.isArray(rule.sides) && rule.sides.length ? rule.sides : [rule.side];
}

function obConfig() {
  const code = locale.activeLocale();
  let c = _obCache.get(code);
  if (!c) {
    const cfg = openingBalanceConfigFor(code);
    const ruleByCode = new Map();
    const codes = [];
    for (const rule of cfg.rules) {
      if (!ruleByCode.has(rule.code)) {
        ruleByCode.set(rule.code, rule);
        codes.push(rule.code);
      }
    }
    c = {
      equityCode: cfg.equityCode,
      rules: cfg.rules,
      ruleByCode,
      codes,
    };
    _obCache.set(code, c);
  }
  return c;
}
const OPENING_BALANCE_EQUITY_CODE = openingBalanceConfigFor("am").equityCode;
const OPENING_BALANCE_ACCOUNT_CODES = Object.freeze(openingBalanceConfigFor("am").rules.map((r) => r.code));
const CHART_SOURCE = chartSourceFor("am", CHART.length);

function ensureChartOfAccounts(db, orgId) {
  const chart = activeChart();
  const codes = chart.map((a) => a.code);
  if (codes.length) {
    db.prepare(`DELETE FROM ledger_accounts WHERE org_id = ? AND code NOT IN (${codes.map(() => "?").join(", ")})`)
      .run(orgId, ...codes);
  }
  const insert = db.prepare("INSERT OR IGNORE INTO ledger_accounts (id, org_id, code, name, type) VALUES (?, ?, ?, ?, ?)");
  const update = db.prepare("UPDATE ledger_accounts SET name = ?, type = ? WHERE org_id = ? AND code = ?");
  for (const a of chart) {
    insert.run(`acct-${orgId}-${a.code}`, orgId, a.code, a.name, a.type);
    update.run(a.name, a.type, orgId, a.code);
  }
}

function chartOfAccounts() {
  const ob = obConfig();
  return {
    source: activeChartSource(),
    classes: activeClasses(),
    openingBalanceEquityCode: ob.equityCode,
    openingBalanceAccountCodes: [...ob.codes],
    openingBalanceAccounts: ob.rules.map(rule => {
      const account = accountByCode(rule.code) || {};
      return { code: rule.code, name: account.name || rule.code, type: account.type || "", side: rule.side, sides: openingRuleSides(rule) };
    }),
    accounts: activeChart()
  };
}

class PeriodLockedError extends Error {
  constructor(periodKey) {
    super(`finance period ${periodKey} is closed — cannot post ledger entries`);
    this.name = "PeriodLockedError";
    this.code = "PERIOD_LOCKED";
    this.statusCode = 409;
  }
}

function assertPeriodOpen(db, orgId, periodKey) {
  if (!periodKey) return;
  const row = db.prepare("SELECT status FROM finance_periods WHERE org_id = ? AND period_key = ?").get(orgId, periodKey);
  if (row && row.status === "closed") throw new PeriodLockedError(periodKey);
}

function activeMoney() {
  return locale.active().money;
}

function toMinor(value) {
  const minor = activeMoney().toMinor(value);
  return Number.isSafeInteger(minor) ? minor : 0;
}

function fromMinor(value) {
  return activeMoney().fromMinor(Math.round(Number(value) || 0));
}

function assertMinorUnitInteger(amount) {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) {
    const err = new Error("Ledger amount must be a minor-unit integer");
    err.code = "INVALID_LEDGER_AMOUNT";
    err.statusCode = 400;
    throw err;
  }
  return value;
}

function postEntry(db, orgId, entry) {
  const { date, debitCode, creditCode, amount, memo = "", sourceType = "", sourceId = "", periodKey = "" } = entry;
  const value = assertMinorUnitInteger(amount);
  if (value <= 0) return null;
  assertPeriodOpen(db, orgId, periodKey);
  ensureChartOfAccounts(db, orgId);
  const id = `jrn-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const res = db.prepare(`
    INSERT OR IGNORE INTO ledger_journal
      (id, org_id, entry_date, debit_code, credit_code, amount, memo, source_type, source_id, period_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, orgId, String(date).slice(0, 10), debitCode, creditCode, value, memo, sourceType, sourceId, periodKey, now);
  return res.changes > 0 ? id : null;
}

function accountByCode(code) {
  return activeChart().find(a => a.code === String(code)) || null;
}

function isOpeningBalanceAccountCode(code) {
  return obConfig().codes.includes(String(code));
}

function openingBalanceAccountByCode(code) {
  const account = accountByCode(code);
  const rule = obConfig().ruleByCode.get(String(code));
  return account && rule ? { ...account, side: rule.side, sides: openingRuleSides(rule) } : null;
}

function openingBalanceSideForCode(code) {
  const rule = obConfig().ruleByCode.get(String(code));
  return rule ? rule.side : null;
}

function normalizeOpeningBalanceSide(account, side) {
  const expected = account.side || openingBalanceSideForCode(account.code);
  const allowed = Array.isArray(account.sides) && account.sides.length ? account.sides : [expected];
  if (side === undefined || side === null || side === "") return expected;
  if ((side === "debit" || side === "credit") && allowed.includes(side)) return side;
  return null;
}

// Post one account's opening balance against the Opening Balance Equity account (331).
// Balance-sheet accounts use their reviewed opening side. Contra balances such
// as accumulated depreciation are modeled as credit-side account metadata, not
// client-controlled side overrides.
function postOpeningBalance(db, orgId, entry) {
  const equityCode = obConfig().equityCode;
  const code = String(entry.code || "");
  if (code === equityCode) return []; // never set the contra directly
  const account = openingBalanceAccountByCode(code);
  if (!account) return []; // unknown or non-balance-sheet account code — skip
  const side = normalizeOpeningBalanceSide(account, entry.side);
  if (!side) return [];
  ensureChartOfAccounts(db, orgId);
  // Replace semantics: an account's opening balance is set once and corrected by
  // re-submitting. Remove any prior opening-balance entry for this account (on
  // either leg) so the latest submission wins and the same account is never
  // double-counted across different as-of dates.
  db.prepare(
    "DELETE FROM ledger_journal WHERE org_id = ? AND source_type = 'opening_balance' AND (debit_code = ? OR credit_code = ?)"
  ).run(orgId, code, code);
  const amount = toMinor(entry.amount);
  if (amount <= 0) return []; // amount <= 0 clears this account's opening balance
  const date = String(entry.date || entry.asOf || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const periodKey = entry.period_key || entry.periodKey || "";
  const sourceId = `ob-${date}-${code}`;
  const leg = side === "debit"
    ? { debitCode: code, creditCode: equityCode }
    : { debitCode: equityCode, creditCode: code };
  const id = postEntry(db, orgId, {
    date, ...leg, amount,
    memo: `Opening balance ${code}`, sourceType: "opening_balance", sourceId, periodKey
  });
  return id ? [id] : [];
}

function postOpeningBalances(db, orgId, payload) {
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(payload.asOf || "")
    ? payload.asOf : new Date().toISOString().slice(0, 10);
  const periodKey = payload.period_key || payload.periodKey || "";
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  db.exec("BEGIN");
  try {
    const posted = [];
    for (const e of entries) {
      for (const id of postOpeningBalance(db, orgId, { code: e.code, amount: e.amount, side: e.side, date: asOf, period_key: periodKey })) {
        posted.push(id);
      }
    }
    db.exec("COMMIT");
    return { asOf, posted, count: posted.length };
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    throw err;
  }
}

// List current opening balances (one row per account whose opening balance was set),
// plus the net opening equity introduced (asset openings − liability openings).
function openingBalances(db, orgId) {
  ensureChartOfAccounts(db, orgId);
  const rows = db.prepare(
    "SELECT entry_date, debit_code, credit_code, amount FROM ledger_journal WHERE org_id = ? AND source_type = 'opening_balance' ORDER BY entry_date, id"
  ).all(orgId);
  const equityCode = obConfig().equityCode;
  const byCode = new Map(activeChart().map(a => [a.code, a]));
  const entries = rows.map(r => {
    const code = r.debit_code === equityCode ? r.credit_code : r.debit_code;
    const side = r.debit_code === equityCode ? "credit" : "debit";
    const acc = byCode.get(code) || {};
    return { code, name: acc.name || code, type: acc.type || "", side, amount: fromMinor(r.amount), amountMinor: Math.round(Number(r.amount) || 0), date: r.entry_date };
  });
  const openingEquity = fromMinor(entries.reduce((s, r) => s + (r.side === "debit" ? r.amountMinor : -r.amountMinor), 0));
  return { entries: entries.map(({ amountMinor, ...entry }) => entry), count: entries.length, openingEquity };
}

function postInvoicePosted(db, orgId, invoice) {
  const total = toMinor(invoice.total);
  const vat = toMinor(invoice.vat);
  // Prefer the source document's net (subtotal) so the ledger matches the invoice
  // exactly; fall back to total - vat when no subtotal is supplied.
  const hasSubtotal = invoice.subtotal !== undefined && invoice.subtotal !== null && invoice.subtotal !== "";
  const net = hasSubtotal ? toMinor(invoice.subtotal) : total - vat;
  const date = invoice.date || invoice.issue_date || new Date().toISOString().slice(0, 10);
  const periodKey = invoice.period_key || "";
  const C = postingCodesFor(locale.activeLocale());
  const ids = [];
  if (net > 0) ids.push(postEntry(db, orgId, { date, debitCode: C.receivable, creditCode: C.revenue, amount: net, memo: `Invoice ${invoice.number || invoice.id}`, sourceType: "invoice", sourceId: invoice.id, periodKey }));
  if (vat > 0) ids.push(postEntry(db, orgId, { date, debitCode: C.receivable, creditCode: C.outputVat, amount: vat, memo: `VAT ${invoice.number || invoice.id}`, sourceType: "invoice", sourceId: invoice.id, periodKey }));
  return ids.filter(Boolean);
}

function postPaymentReceived(db, orgId, payment) {
  const C = postingCodesFor(locale.activeLocale());
  return [postEntry(db, orgId, {
    date: payment.date || payment.paid_at || new Date().toISOString().slice(0, 10),
    debitCode: C.cash, creditCode: C.receivable, amount: toMinor(payment.amount),
    memo: `Payment ${payment.id}`, sourceType: "payment", sourceId: payment.id, periodKey: payment.period_key || ""
  })].filter(Boolean);
}

function buildLedgerModel(db, orgId) {
  ensureChartOfAccounts(db, orgId);
  const accounts = db.prepare("SELECT code, name, type FROM ledger_accounts WHERE org_id = ?").all(orgId)
    .map(a => ({ id: a.code, code: a.code, name: a.name, type: a.type }));
  const journal = db.prepare("SELECT entry_date, debit_code, credit_code, amount FROM ledger_journal WHERE org_id = ?").all(orgId)
    .map(j => ({ date: j.entry_date, debitAccount: j.debit_code, creditAccount: j.credit_code, amount: j.amount }));
  return { accounts, journal, invoices: [], expenses: [], bills: [], budgets: [] };
}

function trialBalance(db, orgId) {
  const model = buildLedgerModel(db, orgId);
  const balances = accounting.calculateBalances(model);
  const byCode = new Map(model.accounts.map(a => [a.code, a]));
  let totalDebit = 0, totalCredit = 0;
  const rows = Object.entries(balances).map(([code, b]) => {
    totalDebit += b.debit; totalCredit += b.credit;
    const acc = byCode.get(code) || {};
    return { code, name: acc.name || code, type: acc.type || "", debit: fromMinor(b.debit), credit: fromMinor(b.credit), balance: fromMinor(b.balance) };
  }).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  return { rows, totalDebit: fromMinor(totalDebit), totalCredit: fromMinor(totalCredit), balanced: Math.round(totalDebit) === Math.round(totalCredit) };
}

function postExpensePosted(db, orgId, expense) {
  const total = toMinor(expense.total);
  const vat = toMinor(expense.vat);
  const hasSubtotal = expense.subtotal !== undefined && expense.subtotal !== null && expense.subtotal !== "";
  const net = hasSubtotal ? toMinor(expense.subtotal) : total - vat;
  const date = expense.date || expense.incurred_on || new Date().toISOString().slice(0, 10);
  const periodKey = expense.period_key || "";
  const C = postingCodesFor(locale.activeLocale());
  const ids = [];
  if (net > 0) ids.push(postEntry(db, orgId, { date, debitCode: C.expense, creditCode: C.payable, amount: net, memo: `Expense ${expense.description || expense.id}`, sourceType: "expense", sourceId: expense.id, periodKey }));
  if (vat > 0) ids.push(postEntry(db, orgId, { date, debitCode: C.inputVat, creditCode: C.payable, amount: vat, memo: `Input VAT ${expense.id}`, sourceType: "expense", sourceId: expense.id, periodKey }));
  return ids.filter(Boolean);
}

function vatReport(db, orgId, periodKey = "") {
  // RU ledger VAT awaits the locale-aware posting-code remap (a later slice): RU postings
  // do not use the AM 524/226 codes this report filters on, so degrade honestly rather than
  // emit AM-branded zeros. The RF НДС settlement is available via the input-driven
  // POST /api/finance/vat-return/compute.
  if (locale.activeLocale() === "ru") {
    return {
      periodKey: periodKey || "all",
      currency: "RUB",
      outputVat: 0,
      inputVat: 0,
      netVatPayable: 0,
      note: "RU ledger-derived VAT is pending the locale-aware posting-code remap; use POST /api/finance/vat-return/compute for the RF НДС settlement.",
    };
  }
  const filter = periodKey ? "AND period_key = ?" : "";
  const args = periodKey ? [orgId, periodKey] : [orgId];
  const outputVat = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM ledger_journal WHERE org_id = ? AND credit_code = '524' ${filter}`).get(...args).v;
  const inputVat = db.prepare(`SELECT COALESCE(SUM(amount),0) AS v FROM ledger_journal WHERE org_id = ? AND debit_code IN (${INPUT_VAT_ACCOUNT_CODES.map(() => "?").join(", ")}) ${filter}`)
    .get(...(periodKey ? [orgId, ...INPUT_VAT_ACCOUNT_CODES, periodKey] : [orgId, ...INPUT_VAT_ACCOUNT_CODES])).v;
  return {
    periodKey: periodKey || "all",
    outputVat: fromMinor(outputVat),
    inputVat: fromMinor(inputVat),
    netVatPayable: fromMinor(outputVat - inputVat),
    note: "Indicative VAT from posted ledger entries; review with an Armenian accountant before filing."
  };
}

function postPayrollRun(db, orgId, run) {
  const gross = toMinor(run.gross);
  const net = toMinor(run.net);
  const deductions = run.totalDeductions != null ? toMinor(run.totalDeductions) : gross - net;
  const date = run.date || run.run_date || new Date().toISOString().slice(0, 10);
  const periodKey = run.period_key || "";
  const C = postingCodesFor(locale.activeLocale());
  const ids = [];
  if (net > 0) ids.push(postEntry(db, orgId, { date, debitCode: C.payrollExpense, creditCode: C.payrollNet, amount: net, memo: `Payroll net ${run.employeeName || run.id}`, sourceType: "payroll", sourceId: run.id, periodKey }));
  if (deductions > 0) ids.push(postEntry(db, orgId, { date, debitCode: C.payrollExpense, creditCode: C.payrollWithholdings, amount: deductions, memo: `Payroll withholdings ${run.id}`, sourceType: "payroll", sourceId: run.id, periodKey }));
  // Employer social contributions (RU страховые взносы → 69): an additional employer EXPENSE,
  // not withheld from the employee. Posted only when the caller supplies the amount AND the
  // active locale defines a contributions account (the RA model has none).
  const contributions = toMinor(run.employerContributions != null ? run.employerContributions : run.employerInsurance);
  if (contributions > 0 && C.payrollContributions) ids.push(postEntry(db, orgId, { date, debitCode: C.payrollExpense, creditCode: C.payrollContributions, amount: contributions, memo: `Payroll contributions ${run.id}`, sourceType: "payroll", sourceId: run.id, periodKey }));
  return ids.filter(Boolean);
}

function postBillPosted(db, orgId, bill) {
  const total = toMinor(bill.total);
  const vat = toMinor(bill.vat);
  const hasSubtotal = bill.subtotal !== undefined && bill.subtotal !== null && bill.subtotal !== "";
  const net = hasSubtotal ? toMinor(bill.subtotal) : total - vat;
  const date = bill.date || bill.bill_date || new Date().toISOString().slice(0, 10);
  const periodKey = bill.period_key || "";
  const C = postingCodesFor(locale.activeLocale());
  const ids = [];
  if (net > 0) ids.push(postEntry(db, orgId, { date, debitCode: C.expense, creditCode: C.payable, amount: net, memo: `Bill ${bill.supplier || bill.id}`, sourceType: "bill", sourceId: bill.id, periodKey }));
  if (vat > 0) ids.push(postEntry(db, orgId, { date, debitCode: C.inputVat, creditCode: C.payable, amount: vat, memo: `Bill VAT ${bill.id}`, sourceType: "bill", sourceId: bill.id, periodKey }));
  return ids.filter(Boolean);
}

function postBillPayment(db, orgId, payment) {
  const C = postingCodesFor(locale.activeLocale());
  return [postEntry(db, orgId, {
    date: payment.date || payment.paid_at || new Date().toISOString().slice(0, 10),
    debitCode: C.payable, creditCode: C.cash, amount: toMinor(payment.amount),
    memo: `Bill payment ${payment.id}`, sourceType: "bill_payment", sourceId: payment.id, periodKey: payment.period_key || ""
  })].filter(Boolean);
}

function buildPayablesModel(db, orgId) {
  const bills = db.prepare("SELECT id, supplier, bill_date AS date, due_date AS dueDate, total, status FROM bills WHERE org_id = ?").all(orgId).map(b => {
    const paid = db.prepare("SELECT COALESCE(SUM(amount),0) AS p FROM bill_payments WHERE org_id = ? AND bill_id = ?").get(orgId, b.id).p;
    return { ...b, paidAmount: paid };
  });
  return { bills };
}

function payablesReport(db, orgId, asOf) {
  return accounting.calculatePayables(buildPayablesModel(db, orgId), { asOf: asOf || new Date().toISOString().slice(0, 10) });
}

module.exports = { CHART, CHART_SOURCE, INPUT_VAT_ACCOUNT_CODE, LEGACY_INPUT_VAT_ACCOUNT_CODE, INPUT_VAT_ACCOUNT_CODES, OPENING_BALANCE_ACCOUNT_CODES, chartOfAccounts, ensureChartOfAccounts, postEntry, postInvoicePosted, postPaymentReceived, postExpensePosted, postPayrollRun, postBillPosted, postBillPayment, buildPayablesModel, payablesReport, vatReport, buildLedgerModel, trialBalance, assertPeriodOpen, PeriodLockedError, OPENING_BALANCE_EQUITY_CODE, openingBalanceAccountByCode, openingBalanceSideForCode, postOpeningBalance, postOpeningBalances, openingBalances };
