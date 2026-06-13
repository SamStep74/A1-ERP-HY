"use strict";

// A1-Localization-RU — Russian (Russian Federation) localization + fiscal engines.
//
// Sibling to a1-localization-am (Armenia). Single source of truth for RF fiscal
// correctness, consumed by A1 Suite (Russian-market configuration) via vendoring.
//
//   const { inn, money, chartOfAccounts, einvoice } = require("a1-localization-ru");
//
// Every namespace is a pure, dependency-free engine; pull just what you need.
module.exports = {
  inn: require("./src/inn"),
  money: require("./src/money"),
  vat: require("./src/vat"), // НДС (2026: base 22%)
  payroll: require("./src/payroll"), // НДФЛ + страховые взносы (2026)
  chartOfAccounts: require("./src/chartOfAccounts"), // План счетов (Приказ Минфина 94н)
  regions: require("./src/regions"), // субъекты РФ (ISO 3166-2:RU)
  phone: require("./src/phone"), // +7 / 10-значный НСН
  einvoice: require("./src/einvoice"), // УПД / счёт-фактура (формат 5.03)
};
