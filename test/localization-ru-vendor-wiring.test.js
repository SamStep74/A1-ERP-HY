"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Guards the vendored a1-localization-ru package (RF fiscal engines — the RU
// counterpart to a1-localization-am). The Suite does not yet select RU at runtime,
// so this test is what keeps the vendored copy honest: if someone re-vendors a
// broken or partial build, it fails fast. Golden values are derived from the
// pinned upstream commit (68131da, PR #1) — see server/vendor/a1-localization-ru/VENDOR.md.

const pkg = require("../server/vendor/a1-localization-ru");

function validInvoice(overrides = {}) {
  return {
    number: "INV-1",
    date: "2026-01-31",
    seller: { name: "ООО Продавец", inn: "7707083893" },
    buyer: { name: "ООО Покупатель", inn: "7707083893" },
    lines: [{ description: "Услуга", netAmount: 1000, vatRate: 22 }],
    ...overrides,
  };
}

test("vendored RU package exposes every engine namespace", () => {
  for (const ns of ["inn", "money", "vat", "payroll", "chartOfAccounts", "regions", "phone", "einvoice"]) {
    assert.equal(typeof pkg[ns], "object", `missing namespace: ${ns}`);
  }
});

test("identifiers survive the vendoring (ИНН checksum regression guard)", () => {
  assert.equal(pkg.inn.validateInn("7707083893").ok, true); // real legal-entity ИНН
  assert.equal(pkg.inn.validateInn("123").ok, false);
});

test("money + VAT golden values (2026 НДС base rate 22%)", () => {
  assert.equal(pkg.money.roundRub(1234.567), 1234.57); // round to kopecks
  assert.equal(pkg.vat.vatFromNet(1000, 22), 220); // VAT on top of net
  assert.equal(pkg.vat.vatFromGross(1220, 22), 220); // settlement rate 22/122
});

test("2026 payroll: gross 100,000 → НДФЛ 13,000 / net 87,000 / employer 30,000", () => {
  const p = pkg.payroll.computeMonthlyPayroll({ monthGross: 100000 });
  assert.equal(p.ndfl, 13000); // 13% НДФЛ band
  assert.equal(p.net, 87000);
  assert.equal(p.employerInsurance, 30000); // 30% unified страховые взносы
});

test("RU payroll: НДФЛ and страховые взносы round to whole rubles while gross/net keep kopecks", () => {
  const p = pkg.payroll.computeMonthlyPayroll({ monthGross: 100000.5 });
  assert.equal(p.gross, 100000.5);
  assert.equal(p.ndfl, 13000);
  assert.equal(p.net, 87000.5);
  assert.equal(p.employerInsurance, 30000);
  assert.equal(p.employerCost, 130000.5);
});

test("RU payroll: whole-ruble tax rounding uses the 50 kopeck threshold", () => {
  const p = pkg.payroll.computeMonthlyPayroll({ monthGross: 100003.85 });
  assert.equal(p.ndfl, 13001);
  assert.equal(p.net, 87002.85);
  assert.equal(p.employerInsurance, 30001);
  assert.equal(p.employerCost, 130004.85);
});

test("RU payroll: non-resident НДФЛ ignores deductions", () => {
  const p = pkg.payroll.computeMonthlyPayroll({ monthGross: 100000, monthDeduction: 10000, resident: false });
  assert.equal(p.ndfl, 30000);
  assert.equal(p.net, 70000);
});

test("chart of accounts (План счетов 94н): 73 accounts, nature → normalBalance", () => {
  assert.equal(pkg.chartOfAccounts.STANDARD_ACCOUNTS.length, 73);
  assert.equal(pkg.chartOfAccounts.accountByCode("51").ru, "Расчётные счета");
  assert.equal(pkg.chartOfAccounts.normalBalance("02"), "credit"); // passive (амортизация ОС)
  assert.equal(pkg.chartOfAccounts.normalBalance("84"), null); // active-passive
});

test("regions (ISO 3166-2:RU): 83 federal subjects", () => {
  assert.equal(pkg.regions.REGIONS.length, 83);
  assert.equal(pkg.regions.regionByCode("RU-MOW").en, "Moscow");
});

test("phone (+7) normalization to E.164", () => {
  assert.equal(pkg.phone.e164("8 (495) 123-45-67"), "+74951234567");
});

test("e-invoice: 2026 issued НДС rates + fail-closed validate", () => {
  assert.deepEqual(pkg.einvoice.VAT_RATES_2026, [0, 10, 22]);
  assert.equal(pkg.einvoice.validateEInvoice({}).ok, false); // empty invoice rejected
});

test("RU e-invoice validation rejects inconsistent totals and missing buyer identity", () => {
  assert.equal(pkg.einvoice.validateEInvoice(validInvoice()).ok, true);
  assert.equal(pkg.einvoice.validateEInvoice(validInvoice({
    lines: [{ description: "Услуга", netAmount: 1000, vatRate: 22, vatAmount: 220, lineTotal: 1 }],
  })).errors.some((e) => e.code === "LINE_TOTAL_MISMATCH"), true);
  assert.equal(pkg.einvoice.validateEInvoice(validInvoice({
    buyer: { inn: "7707083893" },
  })).errors.some((e) => e.code === "MISSING_BUYER_NAME"), true);
});

test("RU e-invoice validation checks calendar dates, currency code, and back-dated VAT rates", () => {
  assert.equal(pkg.einvoice.validateEInvoice(validInvoice({ date: "2026-99-99" })).errors.some((e) => e.code === "INVALID_DATE"), true);
  assert.equal(pkg.einvoice.validateEInvoice(validInvoice({ currency: "USD" })).errors.some((e) => e.code === "MISSING_CURRENCY_CODE"), true);
  assert.equal(pkg.einvoice.validateEInvoice(validInvoice({
    date: "2025-12-31",
    lines: [{ description: "Услуга", netAmount: 1000, vatRate: 20 }],
  })).ok, true);
  assert.equal(pkg.einvoice.validateEInvoice(validInvoice({
    date: "2026-01-31",
    lines: [{ description: "Услуга", netAmount: 1000, vatRate: 20 }],
  })).errors.some((e) => e.code === "INVALID_LINE_VAT_RATE"), true);
});
