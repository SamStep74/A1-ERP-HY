"use strict";

// Russian payroll — НДФЛ (employee) + страховые взносы (employer), 2026.
// Sourced from НК РФ ст. 224/425/427/218, Пост. Правительства РФ № 1705, ФЗ № 429-ФЗ,
// ФЗ № 425-ФЗ (see SOURCES.md). Constants are year-keyed; values shown are 2026.
//
// ⚠️ This is a fiscal engine: see SOURCES.md "Known seams" for the МСП-eligibility test
// (priority-ОКВЭД + 70% rule) which is OUT of this engine's scope — pass `sme:true` only
// for an already-qualified employer.

const { roundRub, roundToWholeRubles } = require("./money");

// НДФЛ — five-band marginal progressive scale on the cumulative annual base (ст. 224).
const NDFL = Object.freeze({
  thresholds: [2_400_000, 5_000_000, 20_000_000, 50_000_000], // band upper edges (₽/year)
  rates: [0.13, 0.15, 0.18, 0.20, 0.22],
  nonResidentRate: 0.30, // п. 3 ст. 224 (default, no deductions)
});

// Страховые взносы — единый тариф (ст. 425) + МСП reduced (ст. 427), 2026.
const INSURANCE = Object.freeze({
  unifiedBaseLimit: 2_979_000, // ЕПВБ 2026 (Пост. Правительства РФ № 1705 от 31.10.2025)
  rateWithin: 0.30,
  rateAbove: 0.151,
  mrot: 27_093, // МРОТ 2026 (ФЗ № 429-ФЗ от 28.11.2025)
  smeThresholdMultiplier: 1.5, // 1.5×МРОТ monthly split (ФЗ № 425-ФЗ, from 2026)
  smeRateAbove: 0.15,
});

// Child standard deductions (ст. 218), 2026; stop once YTD income exceeds the cap.
const CHILD_DEDUCTION = Object.freeze({
  first: 1_400,
  second: 2_800,
  third: 6_000, // 3rd and each subsequent
  disabledParent: 12_000, // disabled child — parent/adoptive (adds to the order amount)
  disabledGuardian: 6_000, // disabled child — guardian/trustee/foster
  incomeCap: 450_000,
});

// НДФЛ on a cumulative annual base (rounded to whole rubles, НК РФ ст. 52).
function ndflOnAnnualBase(base, opts = {}) {
  const b = Math.max(0, Number(base) || 0);
  if (opts.resident === false) return roundToWholeRubles(b * NDFL.nonResidentRate);
  const { thresholds: t, rates: r } = NDFL;
  let tax = 0;
  let lower = 0;
  for (let i = 0; i < t.length; i++) {
    if (b > t[i]) {
      tax += (t[i] - lower) * r[i];
      lower = t[i];
    } else {
      return roundToWholeRubles(tax + (b - lower) * r[i]);
    }
  }
  return roundToWholeRubles(tax + (b - lower) * r[r.length - 1]);
}

// Monthly НДФЛ via the cumulative method: tax on new cumulative base minus tax already
// computed on the prior cumulative base.
function ndflMonthly(opts = {}) {
  const before = Math.max(0, Number(opts.ytdBaseBefore) || 0);
  const month = Math.max(0, Number(opts.monthBase) || 0);
  const resident = opts.resident !== false;
  return ndflOnAnnualBase(before + month, { resident }) - ndflOnAnnualBase(before, { resident });
}

// Employer unified страховые взносы on a cumulative annual base.
function insuranceUnified(cumBase) {
  const b = Math.max(0, Number(cumBase) || 0);
  const within = Math.min(b, INSURANCE.unifiedBaseLimit);
  const above = Math.max(0, b - INSURANCE.unifiedBaseLimit);
  return roundToWholeRubles(within * INSURANCE.rateWithin + above * INSURANCE.rateAbove);
}

// МСП reduced tariff — MONTHLY mechanism: 30% up to 1.5×МРОТ, 15% above (2026).
function insuranceSmeMonthly(monthlyPay) {
  const p = Math.max(0, Number(monthlyPay) || 0);
  const threshold = INSURANCE.smeThresholdMultiplier * INSURANCE.mrot;
  const within = Math.min(p, threshold);
  const above = Math.max(0, p - threshold);
  return roundToWholeRubles(within * INSURANCE.rateWithin + above * INSURANCE.smeRateAbove);
}

// Monthly child standard deduction given YTD income and a list of children.
// children: [{ order: 1|2|3+, disabled?: boolean, guardian?: boolean }]
function childDeductionMonthly(opts = {}) {
  if ((Number(opts.ytdIncome) || 0) > CHILD_DEDUCTION.incomeCap) return 0;
  let d = 0;
  for (const c of opts.children || []) {
    const order = Number(c.order) || 0;
    d += order === 1 ? CHILD_DEDUCTION.first : order === 2 ? CHILD_DEDUCTION.second : CHILD_DEDUCTION.third;
    if (c.disabled) d += c.guardian ? CHILD_DEDUCTION.disabledGuardian : CHILD_DEDUCTION.disabledParent;
  }
  return d;
}

// Full monthly gross→net for one employee, using cumulative accumulators the caller keeps.
//   monthGross       — this month's gross pay (₽)
//   ytdBaseBefore    — cumulative НДФЛ base (after deductions) before this month
//   ytdGrossBefore   — cumulative insurance base before this month
//   monthDeduction   — this month's НДФЛ deductions (e.g. childDeductionMonthly)
//   resident         — НДФЛ residency (default true)
//   sme              — employer qualifies for the МСП reduced tariff (default false)
function computeMonthlyPayroll(opts = {}) {
  const gross = Math.max(0, Number(opts.monthGross) || 0);
  const ytdBaseBefore = Math.max(0, Number(opts.ytdBaseBefore) || 0);
  const ytdGrossBefore = Math.max(0, Number(opts.ytdGrossBefore) || 0);
  const deduction = Math.max(0, Number(opts.monthDeduction) || 0);
  const resident = opts.resident !== false;
  const sme = opts.sme === true;

  const monthBase = resident ? Math.max(0, gross - deduction) : gross;
  const ndfl = ndflMonthly({ ytdBaseBefore, monthBase, resident });
  const net = roundRub(gross - ndfl);

  const employerInsurance = sme
    ? insuranceSmeMonthly(gross)
    : roundToWholeRubles(insuranceUnified(ytdGrossBefore + gross) - insuranceUnified(ytdGrossBefore));

  return {
    gross: roundRub(gross),
    deduction: roundRub(deduction),
    ndfl,
    net,
    employerInsurance,
    employerCost: roundRub(gross + employerInsurance),
    resident,
    sme,
    note: "НДФЛ — накопительная база с начала года; страховые — единый тариф 2026",
  };
}

module.exports = {
  NDFL,
  INSURANCE,
  CHILD_DEDUCTION,
  ndflOnAnnualBase,
  ndflMonthly,
  insuranceUnified,
  insuranceSmeMonthly,
  childDeductionMonthly,
  computeMonthlyPayroll,
};
