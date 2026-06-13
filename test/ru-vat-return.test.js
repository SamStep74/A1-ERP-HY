"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { computeRuVatReturn } = require("../server/ruVatReturn");
const ru = require("../server/vendor/a1-localization-ru");

test("computes the RF НДС settlement from sales/purchases (2026 rates)", () => {
  const r = computeRuVatReturn(
    {
      sales: [{ netAmount: 1000, vatRate: 22 }, { netAmount: 500, vatRate: 10 }],
      purchases: [
        { netAmount: 400, vatRate: 22, recoverable: true },
        { netAmount: 200, vatRate: 22, recoverable: false },
      ],
    },
    ru.vat,
  );
  assert.equal(r.kind, "ru-nds-return");
  assert.equal(r.currency, "RUB");
  assert.equal(r.outputVat, 270); // 1000*22% + 500*10%
  assert.equal(r.inputVat, 88); // only the recoverable 400*22%
  assert.equal(r.netVatPayable, 182);
  assert.equal(r.payable, 182);
  assert.equal(r.creditCarried, 0);
  assert.equal(r.taxableSales, 1500);
  assert.equal(r.taxablePurchases, 400); // non-recoverable purchase excluded
  assert.deepEqual(r.rates, [0, 10, 22]);
});

test("nets to a carried credit when input VAT exceeds output", () => {
  const r = computeRuVatReturn(
    { sales: [], purchases: [{ netAmount: 1000, vatRate: 22, recoverable: true }] },
    ru.vat,
  );
  assert.equal(r.outputVat, 0);
  assert.equal(r.inputVat, 220);
  assert.equal(r.netVatPayable, -220);
  assert.equal(r.payable, 0);
  assert.equal(r.creditCarried, 220);
});

test("handles empty / missing input without throwing", () => {
  const r = computeRuVatReturn({}, ru.vat);
  assert.equal(r.outputVat, 0);
  assert.equal(r.inputVat, 0);
  assert.deepEqual(r.salesByRate, []);
  assert.deepEqual(r.purchasesByRate, []);
});

test("rejects unsupported 2026 RF VAT rates instead of computing stale settlements", () => {
  assert.throws(
    () => computeRuVatReturn({ sales: [{ netAmount: 1000, vatRate: 20 }], purchases: [] }, ru.vat),
    /Unsupported RU VAT rate: 20/,
  );
});
