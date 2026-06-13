"use strict";

// Locale-keyed business-event → account-code map for ledger postings.
//
// AM = the historical Republic-of-Armenia literals (byte-identical to the previous
// hardcoded codes). RU = standard РСБУ / План счетов 94н (confirmed with the product owner).
// Resolved per active locale by server/ledger.js so RU invoices/payments/expenses/bills/
// payroll post to real RU accounts (which slice 1 already seeds into ledger_accounts).
//
// NOTE: in РСБУ the synthetic account 68 carries BOTH output VAT and НДФЛ (subaccounts
// 68.02 / 68.01 are out of scope for this synthetic-only chart), so the ledger-derived VAT
// report (ledger.vatReport) stays indicative for RU — use POST /api/finance/vat-return/compute
// (server/ruVatReturn.js) for the clean, source-driven RF НДС settlement.
const POSTING_CODES = Object.freeze({
  am: Object.freeze({
    receivable: "221", // расчёты с покупателями (AR)
    revenue: "611", // доход
    outputVat: "524", // ԱԱՀ к уплате (output VAT)
    cash: "251", // դрамարկղ / cash
    payable: "521", // расчёты с поставщиками (AP)
    inputVat: "226", // зачётный ԱԱՀ (input VAT)
    expense: "711", // расход
    payrollExpense: "714", // расход на оплату труда
    payrollNet: "521", // net wages → AP
    payrollWithholdings: "525", // удержания
    payrollContributions: null, // no separate employer-contribution account in the RA model
  }),
  ru: Object.freeze({
    receivable: "62", // Расчёты с покупателями и заказчиками
    revenue: "90", // Продажи
    outputVat: "68", // Расчёты по налогам и сборам (НДС)
    cash: "51", // Расчётные счета
    payable: "60", // Расчёты с поставщиками и подрядчиками
    inputVat: "19", // НДС по приобретённым ценностям
    expense: "26", // Общехозяйственные расходы
    payrollExpense: "26", // расход на оплату труда
    payrollNet: "70", // Расчёты с персоналом по оплате труда (net)
    payrollWithholdings: "68", // НДФЛ (Расчёты по налогам и сборам)
    payrollContributions: "69", // Страховые взносы (employer social contributions)
  }),
});

function postingCodesFor(localeCode) {
  return POSTING_CODES[localeCode] || POSTING_CODES.am;
}

// Cash-account matcher for cash-flow statements. RA cash = 25x prefix; RF cash = касса /
// расчётный / валютный / спец / переводы в пути (50/51/52/55/57). Used by
// accounting.financialStatements (which stays pure — the matcher is injected by the caller).
const RU_CASH_CODES = new Set(["50", "51", "52", "55", "57"]);
function cashMatcherFor(localeCode) {
  if (localeCode === "ru") {
    return (a) => a.type === "asset" && RU_CASH_CODES.has(String(a.code));
  }
  return (a) => a.type === "asset" && /^25/.test(String(a.code));
}

module.exports = { POSTING_CODES, postingCodesFor, cashMatcherFor };
