"use strict";

// Projects a locale facade chart-of-accounts account onto the ledger SEEDING shape
// { code, name, type } used by server/ledger.js → ledger_accounts.
//
// AM is the historical identity (name = a.hy, type = a.type) — byte-identical to the
// previous static CHART. RU (План счетов, Приказ Минфина 94н) derives name = a.ru and a
// balance-sheet/P&L `type` from the РСБУ account classification below. `type` feeds
// accounting.js grouping (asset/liability/equity/income/expense); off-balance memorandum
// accounts (001–011) get "offBalance" and are not part of balance-sheet/P&L grouping.
//
// NOTE: a handful of активно-пассивные accounts (40, 60 vs 62, 75, 76, 79, 86, 99) have no
// single unambiguous balance-sheet side; the choices below follow standard РСБУ balance-sheet
// placement and are documented for accountant review. Pure, dependency-free.

// Curated РСБУ type classification (synthetic accounts only; 62 of them). Contra accounts
// (02, 05, 14, 42, 59, 63, 81) are grouped with the class they offset.
const RU_ACCOUNT_TYPE = new Map([
  // Раздел I–II — внеоборотные активы + запасы → asset
  ["01", "asset"], ["02", "asset"], ["03", "asset"], ["04", "asset"], ["05", "asset"],
  ["07", "asset"], ["08", "asset"], ["09", "asset"],
  ["10", "asset"], ["11", "asset"], ["14", "asset"], ["15", "asset"], ["16", "asset"], ["19", "asset"],
  // Раздел III — затраты (WIP on the balance sheet vs period expense)
  ["20", "asset"], ["21", "asset"], ["23", "asset"], ["29", "asset"],
  ["25", "expense"], ["26", "expense"], ["28", "expense"],
  // Раздел IV — готовая продукция и товары → asset (42 — contra)
  ["40", "asset"], ["41", "asset"], ["42", "asset"], ["43", "asset"], ["45", "asset"], ["46", "asset"],
  ["44", "expense"],
  // Раздел V — денежные средства → asset (59 — contra)
  ["50", "asset"], ["51", "asset"], ["52", "asset"], ["55", "asset"], ["57", "asset"], ["58", "asset"], ["59", "asset"],
  // Раздел VI — расчёты: receivable-side → asset; payable/tax/loan-side → liability
  ["62", "asset"], ["63", "asset"], ["71", "asset"], ["73", "asset"], ["76", "asset"], ["79", "asset"],
  ["60", "liability"], ["66", "liability"], ["67", "liability"], ["68", "liability"], ["69", "liability"],
  ["70", "liability"], ["75", "liability"], ["77", "liability"],
  // Раздел VII — капитал → equity (81 — contra)
  ["80", "equity"], ["81", "equity"], ["82", "equity"], ["83", "equity"], ["84", "equity"], ["86", "equity"],
  // Раздел VIII — финансовые результаты
  ["90", "income"], ["91", "income"],
  ["94", "expense"],
  ["96", "liability"], ["98", "liability"],
  ["97", "asset"],
  ["99", "equity"], // прибыли и убытки — result accumulator, closes to 84
]);

function ruType(account) {
  const code = String(account.code);
  if (code.length === 3) return "offBalance"; // забалансовые счета 001–011
  const mapped = RU_ACCOUNT_TYPE.get(code);
  if (mapped) return mapped;
  // Defensive fallback (should not hit for the 73 known 94н codes).
  if (account.nature === "passive") return "liability";
  return "asset";
}

function projectAccount(localeCode, account) {
  if (localeCode === "ru") {
    return { code: account.code, name: account.ru, type: ruType(account) };
  }
  // AM (and any default): the historical identity projection.
  return { code: account.code, name: account.hy, type: account.type };
}

function chartSourceFor(localeCode, accountCount) {
  if (localeCode === "ru") {
    return Object.freeze({
      title: "План счетов бухгалтерского учёта финансово-хозяйственной деятельности организаций",
      sourceUrl: "https://www.consultant.ru/document/cons_doc_LAW_29165/",
      publisher: "Минфин России",
      orderNumber: "Приказ Минфина РФ № 94н от 31.10.2000",
      accountCount,
    });
  }
  return Object.freeze({
    title: "ՀՀ հաշվապահական հաշվառման հաշվային պլան",
    sourceUrl: "https://www.arlis.am/hy/acts/75961",
    publisher: "ՀՀ ֆինանսների նախարարություն",
    accountCount,
  });
}

module.exports = { projectAccount, chartSourceFor, ruType, RU_ACCOUNT_TYPE };
