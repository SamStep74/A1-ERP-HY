"use strict";

// Russian VAT (НДС) — 2026 rates + settlement math.
// ⚠️ 2026 reform: the base rate rose 20% → 22% (effective 2026-01-01, ФНС «Налоги 2026»).
// Reduced 10% (food/children/medical), 0% (export). УСН payers may use special 5%/7%.
// Year-keyed so prior/future years can be added without breaking callers.

const { roundRub } = require("./money");

const VAT_RATES = Object.freeze({
  2026: Object.freeze({ standard: 22, reduced: 10, zero: 0, usnLow: 5, usnHigh: 7 }),
  2025: Object.freeze({ standard: 20, reduced: 10, zero: 0 }), // pre-reform, for back-dated docs
});

const CURRENT_YEAR = 2026;

function ratesFor(year = CURRENT_YEAR) {
  return VAT_RATES[year] || VAT_RATES[CURRENT_YEAR];
}

// VAT added on top of a net (tax-exclusive) amount.
function vatFromNet(net, ratePercent) {
  const n = Number(net) || 0;
  const r = Number(ratePercent) || 0;
  return roundRub((n * r) / 100);
}

// VAT contained within a gross (tax-inclusive) amount — settlement rate r/(100+r),
// e.g. 22/122, 10/110.
function vatFromGross(gross, ratePercent) {
  const g = Number(gross) || 0;
  const r = Number(ratePercent) || 0;
  if (r <= 0) return 0;
  return roundRub((g * r) / (100 + r));
}

function netFromGross(gross, ratePercent) {
  return roundRub((Number(gross) || 0) - vatFromGross(gross, ratePercent));
}

// Allowed rate? УСН regime adds the special 5%/7% rates (2026).
function isValidVatRate(ratePercent, opts = {}) {
  const r = Number(ratePercent);
  const allowed = opts.regime === "usn" ? [0, 5, 7, 10, 22] : [0, 10, 22];
  return allowed.includes(r);
}

module.exports = { VAT_RATES, CURRENT_YEAR, ratesFor, vatFromNet, vatFromGross, netFromGross, isValidVatRate };
