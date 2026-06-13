"use strict";

// Locale-aware opening-balance posting rules. Each openable balance-sheet account has a
// normal side; an opening balance posts that account against the opening-balance EQUITY
// account (RA 331 / RU 84). AM = the reviewed Republic-of-Armenia set (byte-identical to the
// previous ledger.js constants). RU = the standard openable accounts of План счетов 94н with
// their normal side — a documented default for accountant review (assets/expenses debit,
// liabilities/equity credit). The equity account itself is never directly openable.
const OPENING_BALANCE_CONFIG = Object.freeze({
  am: Object.freeze({
    equityCode: "331",
    rules: Object.freeze([
      { code: "111", side: "debit" },
      { code: "112", side: "credit" },
      { code: "221", side: "debit" },
      { code: "226", side: "debit" },
      { code: "251", side: "debit" },
      { code: "252", side: "debit" },
      { code: "521", side: "credit" },
      { code: "524", side: "credit" },
      { code: "525", side: "credit" },
    ]),
  }),
  ru: Object.freeze({
    equityCode: "84", // Нераспределённая прибыль (opening-balance offset)
    rules: Object.freeze([
      { code: "01", side: "debit" }, // основные средства
      { code: "02", side: "credit" }, // амортизация основных средств
      { code: "04", side: "debit" }, // НМА
      { code: "05", side: "credit" }, // амортизация НМА
      { code: "10", side: "debit" }, // материалы
      { code: "41", side: "debit" }, // товары
      { code: "43", side: "debit" }, // готовая продукция
      { code: "50", side: "debit" }, // касса
      { code: "51", side: "debit" }, // расчётный счёт
      { code: "52", side: "debit" }, // валютный счёт
      { code: "55", side: "debit" }, // специальные счета в банках
      { code: "57", side: "debit" }, // переводы в пути
      { code: "58", side: "debit" }, // финансовые вложения
      { code: "62", side: "debit", sides: Object.freeze(["debit", "credit"]) }, // расчёты с покупателями (AR / advances)
      { code: "19", side: "debit" }, // входной НДС
      { code: "60", side: "credit", sides: Object.freeze(["credit", "debit"]) }, // расчёты с поставщиками (AP / prepayments)
      { code: "66", side: "credit" }, // краткосрочные кредиты
      { code: "67", side: "credit" }, // долгосрочные кредиты
      { code: "68", side: "credit" }, // налоги и сборы
      { code: "69", side: "credit" }, // соцстрах
      { code: "70", side: "credit" }, // расчёты по оплате труда
      { code: "80", side: "credit" }, // уставный капитал
      { code: "82", side: "credit" }, // резервный капитал
      { code: "83", side: "credit" }, // добавочный капитал
    ]),
  }),
});

function openingBalanceConfigFor(localeCode) {
  return OPENING_BALANCE_CONFIG[localeCode] || OPENING_BALANCE_CONFIG.am;
}

module.exports = { OPENING_BALANCE_CONFIG, openingBalanceConfigFor };
