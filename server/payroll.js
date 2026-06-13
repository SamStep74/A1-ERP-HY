/**
 * Armenian payroll calculation for HayHashvapah Web Claude (Phase 5).
 *
 * Computes employee deductions from a gross monthly salary:
 *   - Income tax (եկամտային հարկ): flat rate on gross.
 *   - Funded pension (կուտակային կենսաթոշակ): tiered on gross.
 *   - Stamp duty (դրոշմանիշային վճար): fixed bracket on gross.
 *   - Net (զուտ աշխատավարձ) = gross − deductions.
 *
 * Rates reflect RA rules in force in 2024–2025 and are CONFIGURABLE (pass a
 * `config` override) because the legislature adjusts them periodically. Always
 * have a qualified Armenian accountant confirm current rates before filing.
 *
 * UMD: usable from the Node server (require) and the browser (window.HHVPayroll).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.HHVPayroll = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULT_CONFIG = {
    incomeTaxRate: 0.2, // 20% flat (2023+)
    pension: {
      lowRate: 0.05, // up to threshold
      highRate: 0.1, // above threshold
      threshold: 500000, // AMD/month: <= threshold uses lowRate
      highOffset: 25000, // AMD subtracted at highRate
      baseCap: 1125000, // AMD: salary base for the highRate is capped here
    },
    // Military service insurance fund stamp duty (monthly), inclusive upper bounds.
    stampBrackets: [
      { upTo: 100000, amount: 1500 },
      { upTo: 200000, amount: 3000 },
      { upTo: 500000, amount: 5500 },
      { upTo: 1000000, amount: 8500 },
      { upTo: Infinity, amount: 15000 },
    ],
  };

  function roundAmd(value) {
    return Math.round(Number(value) || 0);
  }

  function incomeTax(gross, cfg) {
    return roundAmd(gross * cfg.incomeTaxRate);
  }

  function pensionContribution(gross, cfg) {
    const p = cfg.pension;
    if (gross <= p.threshold) {
      return roundAmd(gross * p.lowRate);
    }
    const base = Math.min(gross, p.baseCap);
    return Math.max(0, roundAmd(base * p.highRate - p.highOffset));
  }

  function stampDuty(gross, cfg) {
    if (!(gross > 0)) return 0;
    const bracket = cfg.stampBrackets.find((b) => gross <= b.upTo) || cfg.stampBrackets[cfg.stampBrackets.length - 1];
    return roundAmd(bracket.amount);
  }

  /**
   * @param {number} grossInput monthly gross salary in AMD
   * @param {{config?: object}} [options]
   */
  function calculatePayroll(grossInput, options = {}) {
    const cfg = mergeConfig(options.config);
    const gross = Math.max(0, roundAmd(grossInput));
    const tax = incomeTax(gross, cfg);
    const pension = pensionContribution(gross, cfg);
    const stamp = stampDuty(gross, cfg);
    const totalDeductions = tax + pension + stamp;
    const net = gross - totalDeductions;

    return {
      gross,
      incomeTax: tax,
      incomeTaxRate: cfg.incomeTaxRate,
      pension,
      stampDuty: stamp,
      totalDeductions,
      net,
      currency: "AMD",
      note: "Ցուցիչ հաշվարկ՝ հիմնված ՀՀ ընթացիկ դրույքների վրա. ներկայացնելուց առաջ ստուգեք հաշվապահի հետ:",
    };
  }

  function mergeConfig(override) {
    if (!override) return DEFAULT_CONFIG;
    return {
      incomeTaxRate: override.incomeTaxRate ?? DEFAULT_CONFIG.incomeTaxRate,
      pension: { ...DEFAULT_CONFIG.pension, ...(override.pension || {}) },
      stampBrackets: override.stampBrackets || DEFAULT_CONFIG.stampBrackets,
    };
  }

  return { DEFAULT_CONFIG, calculatePayroll, pensionContribution, stampDuty, incomeTax, roundAmd };
});
