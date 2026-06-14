"use strict";
// Re-export shim — canonical localization kernel is server/vendor/a1-localization-am.
// Do not edit there; fix upstream and re-vendor. See server/vendor/a1-localization-am/VENDOR.md.
//
// Wave 6: also re-exports the project's product/order/excise/fiscal LABEL DICTIONARY
// (server/productOrderLabels.js). The kernel owns pure fiscal primitives (HVHH, AMD,
// regions, phone, e-invoice, VAT return); the labels live in the project so UI copy
// can iterate without re-vendoring. Both the kernel exports AND the label exports
// are flattened onto this module so existing `require("./localization")` consumers
// keep working unchanged.
const kernel = require("./vendor/a1-localization-am").localization;
const { productAndOrderLabels, getLocalizedLabel, SUPPORTED_LOCALES } = require("./productOrderLabels");

module.exports = Object.assign(Object.create(null), kernel, {
  productAndOrderLabels,
  getLocalizedLabel,
  SUPPORTED_LOCALES,
});
