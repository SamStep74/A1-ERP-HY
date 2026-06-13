"use strict";

// Runtime locale selector + normalizing facade over A1's vendored localization packages.
//
// `A1_LOCALE` selects the active fiscal/localization profile for a deployment:
//   - "am" → Republic of Armenia (a1-localization-am)  [DEFAULT]
//   - "ru" → Russian Federation   (a1-localization-ru)
//
// The two vendored packages have DIFFERENT namespace shapes (AM: localization + vatReturn;
// RU: inn + money + vat). This module normalizes both to ONE stable, locale-agnostic
// interface so app code can be written once:
//
//   const L = require("./locale").active();
//   L.taxId.validate(x); L.money.format(n); L.phone.e164(p); L.chartOfAccounts.byCode(c);
//
// Selecting "am" reproduces the pre-switch behavior EXACTLY — the legacy
// server/<engine>.js shims (localization, armeniaPhone, …) are unchanged and still
// re-export a1-localization-am, so existing AM consumers/tests are untouched.
//
// Pure + dependency-free apart from the two vendored packages. `A1_LOCALE` is read on
// every call (not cached) so per-request/per-test overrides work.

const am = require("./vendor/a1-localization-am");
const ru = require("./vendor/a1-localization-ru");

const DEFAULT_LOCALE = "am";
const LOCALES = Object.freeze(["am", "ru"]);

function normalizeLocale(value) {
  const v = String(value == null ? "" : value).trim().toLowerCase();
  return LOCALES.includes(v) ? v : DEFAULT_LOCALE;
}

function activeLocale() {
  return normalizeLocale(process.env.A1_LOCALE);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function payrollGross(input) {
  if (isPlainObject(input)) {
    return Number(input.monthGross != null ? input.monthGross : input.gross) || 0;
  }
  return Number(input) || 0;
}

function russianPayrollOptions(input) {
  if (!isPlainObject(input)) return { monthGross: payrollGross(input) };
  return {
    ...input,
    monthGross: payrollGross(input),
  };
}

function russianInvoiceInput(invoice) {
  if (!isPlainObject(invoice) || invoice.seller || !invoice.supplier) return invoice;
  return { ...invoice, seller: invoice.supplier };
}

// --- Armenian (RA) adapter -------------------------------------------------

function armenianProfile(pkg) {
  const { localization, phone, regions, chartOfAccounts, payroll, vatReturn, einvoice } = pkg;
  const meta = Object.freeze({
    locale: "am",
    country: "AM",
    language: "hy",
    currency: Object.freeze({ code: "AMD", symbol: "֏", subunit: 0 }),
    taxId: Object.freeze({ label: "ՀՎՀՀ", length: localization.HVHH_LENGTH }),
    phone: Object.freeze({ countryCode: phone.COUNTRY_CODE, nsnLength: phone.NSN_LENGTH }),
    vat: Object.freeze({ supportsReturnForm: true }),
  });
  return Object.freeze({
    locale: "am",
    meta,
    taxId: Object.freeze({
      label: "ՀՎՀՀ",
      validate: (v) => localization.validateHvhh(v),
      isValid: (v) => localization.isValidHvhh(v),
      normalize: (v) => localization.normalizeHvhh(v),
    }),
    money: Object.freeze({
      code: "AMD",
      symbol: "֏",
      subunit: 0, // dram has no minor unit
      round: (v) => localization.roundAmd(v),
      format: (v, opts) => localization.formatAmd(v, opts),
      parse: (v) => localization.parseAmd(v),
      // Minor-unit scale (see docs/RU_KOPECK_MIGRATION_RFC.md). AMD subunit 0 → factor 1, so
      // toMinor/fromMinor are the identity (a minor unit IS a whole dram) — AM stays no-op.
      toMinor: (v) => localization.roundAmd(v),
      fromMinor: (v) => localization.roundAmd(v),
      roundToWholeMajor: (v) => localization.roundAmd(v),
    }),
    phone: Object.freeze({
      countryCode: phone.COUNTRY_CODE,
      nsnLength: phone.NSN_LENGTH,
      normalize: (v) => phone.normalizeNsn(v),
      isValid: (v) => phone.isValidArmenianPhone(v),
      e164: (v) => phone.e164(v),
      format: (v) => phone.formatPhone(v),
    }),
    regions: Object.freeze({
      all: () => regions.REGIONS,
      codes: () => regions.REGION_CODES,
      byCode: (c) => regions.regionByCode(c),
      isValid: (c) => regions.isValidRegionCode(c),
      find: (q) => regions.findRegion(q),
      cities: (c) => regions.citiesForRegion(c),
    }),
    chartOfAccounts: Object.freeze({
      accounts: () => chartOfAccounts.STANDARD_ACCOUNTS,
      classes: () => chartOfAccounts.ACCOUNT_CLASSES,
      byCode: (c) => chartOfAccounts.accountByCode(c),
      normalBalance: (c) => chartOfAccounts.normalBalance(c),
      isValid: (c) => Boolean(chartOfAccounts.accountByCode(c)),
    }),
    payroll: Object.freeze({
      supports: true,
      computeMonthly: (input) => payroll.computePayroll(payrollGross(input)),
    }),
    vat: Object.freeze({
      supportsReturnForm: true,
      computeReturn: (period) => vatReturn.computeVatReturn(period),
      returnForm: (period) => vatReturn.vatReturnForm(period),
      validateForm: (form) => vatReturn.validateVatReturnForm(form),
    }),
    einvoice: Object.freeze({
      build: (invoice) => einvoice.buildEInvoiceXml(invoice),
      validate: (invoice) => einvoice.validateEInvoice(invoice),
      totals: (lines) => einvoice.eInvoiceTotals(lines),
      normalizeLine: (line) => einvoice.normalizeLine(line),
    }),
    raw: pkg,
  });
}

// --- Russian (RF) adapter --------------------------------------------------

function russianProfile(pkg) {
  const { inn, money, vat, payroll, chartOfAccounts, regions, phone, einvoice } = pkg;
  const meta = Object.freeze({
    locale: "ru",
    country: "RU",
    language: "ru",
    currency: Object.freeze({ code: "RUB", symbol: "₽", subunit: 2 }),
    taxId: Object.freeze({ label: "ИНН" }),
    phone: Object.freeze({ countryCode: phone.COUNTRY_CODE, nsnLength: phone.NSN_LENGTH }),
    vat: Object.freeze({ supportsReturnForm: false }),
  });
  return Object.freeze({
    locale: "ru",
    meta,
    taxId: Object.freeze({
      label: "ИНН",
      validate: (v) => inn.validateInn(v),
      isValid: (v) => inn.isValidInn(v),
      normalize: (v) => inn.validateInn(v).normalized || "",
    }),
    money: Object.freeze({
      code: "RUB",
      symbol: "₽",
      subunit: 2, // копейка = 1/100 ruble
      round: (v) => money.roundRub(v),
      format: (v, opts) => money.formatRub(v, opts),
      parse: (v) => money.parseRub(v),
      // Minor-unit scale (see docs/RU_KOPECK_MIGRATION_RFC.md). RUB subunit 2 → factor 100:
      // toMinor returns integer kopecks, fromMinor returns rubles.
      toMinor: (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        const scaled = n * 100;
        return Math.round(scaled + Math.sign(scaled || 1) * Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4);
      },
      fromMinor: (v) => (Number(v) || 0) / 100,
      // RU tax bases round to WHOLE rubles (НК РФ ст. 52) — distinct from storage rounding.
      roundToWholeMajor: (v) => money.roundToWholeRubles(v),
    }),
    phone: Object.freeze({
      countryCode: phone.COUNTRY_CODE,
      nsnLength: phone.NSN_LENGTH,
      normalize: (v) => phone.normalizeNsn(v),
      isValid: (v) => phone.isValidRussianPhone(v),
      e164: (v) => phone.e164(v),
      format: (v) => phone.formatPhone(v),
    }),
    regions: Object.freeze({
      all: () => regions.REGIONS,
      codes: () => regions.REGION_CODES,
      byCode: (c) => regions.regionByCode(c),
      isValid: (c) => regions.isValidRegionCode(c),
      find: (q) => regions.findRegion(q),
      cities: (c) => regions.citiesForRegion(c),
    }),
    chartOfAccounts: Object.freeze({
      accounts: () => chartOfAccounts.STANDARD_ACCOUNTS,
      classes: () => chartOfAccounts.SECTIONS,
      byCode: (c) => chartOfAccounts.accountByCode(c),
      normalBalance: (c) => chartOfAccounts.normalBalance(c),
      isValid: (c) => chartOfAccounts.isValidAccountCode(c),
    }),
    payroll: Object.freeze({
      supports: true,
      computeMonthly: (input) => payroll.computeMonthlyPayroll(russianPayrollOptions(input)),
    }),
    vat: Object.freeze({
      supportsReturnForm: false,
      vatFromNet: (net, rate) => vat.vatFromNet(net, rate),
      vatFromGross: (gross, rate) => vat.vatFromGross(gross, rate),
      netFromGross: (gross, rate) => vat.netFromGross(gross, rate),
      isValidRate: (rate, opts) => vat.isValidVatRate(rate, opts),
    }),
    einvoice: Object.freeze({
      build: (invoice) => einvoice.buildEInvoiceXml(russianInvoiceInput(invoice)),
      validate: (invoice) => einvoice.validateEInvoice(russianInvoiceInput(invoice)),
      totals: (lines) => einvoice.eInvoiceTotals(lines),
      normalizeLine: (line) => einvoice.normalizeLine(line),
    }),
    raw: pkg,
  });
}

const PROFILES = Object.freeze({
  am: armenianProfile(am),
  ru: russianProfile(ru),
});

function profileFor(localeCode) {
  return PROFILES[normalizeLocale(localeCode)];
}

function active() {
  return profileFor(activeLocale());
}

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  normalizeLocale,
  activeLocale,
  profileFor,
  active,
};
