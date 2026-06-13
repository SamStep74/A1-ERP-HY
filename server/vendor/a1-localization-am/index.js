"use strict";

// A1-Localization-AM — Armenian (RA) localization + fiscal engines.
//
// Single source of truth shared by A1 Suite, HayHashvapah, and any other
// product that needs Republic-of-Armenia fiscal correctness. Every module is
// a pure, dependency-free engine; namespaced here so callers can pull just
// what they need:
//
//   const { vatReturn, einvoice } = require("a1-localization-am");
//
module.exports = {
  localization: require("./src/localization"),
  phone: require("./src/armeniaPhone"),
  regions: require("./src/armeniaRegions"),
  chartOfAccounts: require("./src/armeniaChartOfAccounts"),
  payroll: require("./src/armeniaPayroll"),
  vatReturn: require("./src/vatReturn"),
  einvoice: require("./src/einvoice"),
};
