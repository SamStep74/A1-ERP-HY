"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const locale = require("../server/locale");

// A1_LOCALE is process-global; save/restore around each case so tests don't leak.
function withLocale(value, fn) {
  const prev = process.env.A1_LOCALE;
  if (value === undefined) delete process.env.A1_LOCALE;
  else process.env.A1_LOCALE = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.A1_LOCALE;
    else process.env.A1_LOCALE = prev;
  }
}

test("LOCALES catalog + A1_LOCALE resolution (default am, tolerant)", () => {
  assert.deepEqual(locale.LOCALES, ["am", "ru"]);
  withLocale(undefined, () => assert.equal(locale.activeLocale(), "am")); // default
  withLocale("", () => assert.equal(locale.activeLocale(), "am"));
  withLocale("xx", () => assert.equal(locale.activeLocale(), "am")); // unknown → default
  withLocale("RU", () => assert.equal(locale.activeLocale(), "ru")); // case-insensitive
  withLocale("  ru ", () => assert.equal(locale.activeLocale(), "ru")); // trimmed
});

test("active() resolves the profile for the env locale", () => {
  withLocale("ru", () => assert.equal(locale.active().locale, "ru"));
  withLocale("am", () => assert.equal(locale.active().locale, "am"));
  withLocale("xx", () => assert.equal(locale.active().locale, "am"));
});

test("profileFor normalizes unknown locales to the default (am)", () => {
  assert.equal(locale.profileFor("nope").locale, "am");
});

test("every profile exposes the full stable facade interface", () => {
  for (const code of locale.LOCALES) {
    const L = locale.profileFor(code);
    assert.equal(L.locale, code);
    assert.ok(Object.isFrozen(L.meta), `${code}: meta must be frozen`);
    for (const ns of ["taxId", "money", "phone", "regions", "chartOfAccounts", "payroll", "vat", "einvoice"]) {
      assert.equal(typeof L[ns], "object", `${code}: missing namespace ${ns}`);
    }
    // stable callable contract
    assert.equal(typeof L.taxId.validate, "function");
    assert.equal(typeof L.money.format, "function");
    assert.equal(typeof L.phone.e164, "function");
    assert.equal(typeof L.regions.all, "function");
    assert.equal(typeof L.chartOfAccounts.byCode, "function");
    assert.equal(typeof L.payroll.computeMonthly, "function");
    assert.equal(typeof L.einvoice.build, "function");
    assert.ok(L.raw, `${code}: raw package escape hatch present`);
  }
});

test("AM profile maps to the Armenian (RA) engines", () => {
  const L = locale.profileFor("am");
  assert.equal(L.meta.country, "AM");
  assert.equal(L.meta.currency.code, "AMD");
  assert.equal(L.meta.currency.symbol, "֏");
  assert.equal(L.meta.taxId.label, "ՀՎՀՀ");
  assert.equal(L.meta.phone.countryCode, "374");
  assert.equal(L.meta.vat.supportsReturnForm, true);

  assert.equal(L.taxId.validate("00123456").ok, true);
  assert.equal(L.taxId.validate("123").ok, false);
  assert.equal(L.money.format(1234, { symbol: false }), "1,234");
  assert.equal(L.phone.e164("10112233"), "+37410112233");
  assert.ok(L.chartOfAccounts.byCode("226")); // recoverable input VAT in the RA chart
  assert.equal(L.payroll.computeMonthly(600000).net, 433200); // golden RA payroll
  assert.equal(L.vat.supportsReturnForm, true);
  assert.match(L.einvoice.build({ number: "1", lines: [] }), /^<\?xml/);
});

test("RU profile maps to the Russian (RF) engines", () => {
  const L = locale.profileFor("ru");
  assert.equal(L.meta.country, "RU");
  assert.equal(L.meta.currency.code, "RUB");
  assert.equal(L.meta.currency.symbol, "₽");
  assert.equal(L.meta.taxId.label, "ИНН");
  assert.equal(L.meta.phone.countryCode, "7");
  assert.equal(L.meta.vat.supportsReturnForm, false);

  assert.equal(L.taxId.validate("7707083893").ok, true);
  assert.equal(L.taxId.validate("123").ok, false);
  assert.equal(L.money.format(1234.5, { symbol: false }), "1 234,50");
  assert.equal(L.phone.e164("8 (495) 123-45-67"), "+74951234567");
  assert.equal(L.regions.all().length, 83);
  assert.equal(L.regions.byCode("RU-MOW").en, "Moscow");
  assert.equal(L.chartOfAccounts.accounts().length, 73);
  assert.equal(L.chartOfAccounts.byCode("51").ru, "Расчётные счета");
  assert.equal(L.chartOfAccounts.normalBalance("02"), "credit");
  const p = L.payroll.computeMonthly(100000);
  assert.equal(p.ndfl, 13000);
  assert.equal(p.net, 87000);
  const progressive = L.payroll.computeMonthly({ gross: 100000, ytdBaseBefore: 2400000 });
  assert.equal(progressive.ndfl, 15000);
  assert.equal(L.vat.supportsReturnForm, false);
  assert.match(L.einvoice.build({
    number: "RU-1",
    date: "2026-01-31",
    supplier: { name: "ООО Продавец", inn: "7707083893" },
    buyer: { name: "ООО Покупатель", inn: "7707083893" },
    lines: [{ description: "Услуга", netAmount: 1000, vatRate: 22 }],
  }), /<Seller>\n    <Name>ООО Продавец<\/Name>/);
  assert.deepEqual(L.raw.einvoice.VAT_RATES_2026, [0, 10, 22]);
});
