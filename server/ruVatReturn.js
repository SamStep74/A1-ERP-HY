"use strict";

// Russian НДС (VAT) return — input-driven RF settlement, composing the vendored
// a1-localization-ru vat engine (passed in as `vat` from the locale facade). The RF model
// has no SRC-style multi-line form (unlike the Armenian vatReturn), so this returns the НДС
// settlement: output VAT, recoverable input VAT, net payable, with a per-rate breakdown.
//
// 2026 rates: base 22%, reduced 10%, 0% (export/exempt). Tax totals round to whole rubles
// (НК РФ ст. 52); bases keep kopeck precision. Pure, dependency-free.

function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const roundKopeck = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const roundRuble = (x) => Math.round(x);

function invalidVatRate(rate) {
  const err = new Error(`Unsupported RU VAT rate: ${rate}`);
  err.statusCode = 400;
  err.code = "INVALID_RU_VAT_RATE";
  return err;
}

function lineVatRate(line, vat, period) {
  const rate = Number(line && line.vatRate) || 0;
  const regime = (line && line.regime) || (period && period.regime);
  const isValidRate = typeof vat.isValidRate === "function" ? vat.isValidRate : vat.isValidVatRate;
  if (typeof isValidRate === "function" && !isValidRate(rate, regime ? { regime } : {})) {
    throw invalidVatRate(rate);
  }
  return rate;
}

function summarizeLines(lines, vat, recoverableOnly, period) {
  const byRate = new Map();
  let base = 0;
  let tax = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    if (recoverableOnly && line && line.recoverable === false) continue;
    const rate = lineVatRate(line, vat, period);
    const net = toAmount(line && line.netAmount);
    const lineVat = vat.vatFromNet(net, rate);
    base += net;
    tax += lineVat;
    const acc = byRate.get(rate) || { rate, base: 0, vat: 0 };
    acc.base += net;
    acc.vat += lineVat;
    byRate.set(rate, acc);
  }
  return { base, tax, byRate: [...byRate.values()].sort((a, b) => a.rate - b.rate) };
}

function computeRuVatReturn(period = {}, vat) {
  const out = summarizeLines(period.sales, vat, false, period);
  const inp = summarizeLines(period.purchases, vat, true, period);
  const outputVat = roundRuble(out.tax);
  const inputVat = roundRuble(inp.tax);
  const net = outputVat - inputVat;
  return {
    kind: "ru-nds-return",
    currency: "RUB",
    rates: [0, 10, 22],
    taxableSales: roundKopeck(out.base),
    taxablePurchases: roundKopeck(inp.base),
    outputVat,
    inputVat,
    netVatPayable: net,
    payable: net > 0 ? net : 0,
    creditCarried: net < 0 ? -net : 0,
    salesByRate: out.byRate.map((r) => ({ rate: r.rate, base: roundKopeck(r.base), vat: roundRuble(r.vat) })),
    purchasesByRate: inp.byRate.map((r) => ({ rate: r.rate, base: roundKopeck(r.base), vat: roundRuble(r.vat) })),
    note: "RF НДС settlement (2026: base 22%, reduced 10%, 0%) from period inputs; tax rounded to whole rubles (НК РФ ст. 52). Not the official ФНС declaration form — review with an accountant before filing.",
  };
}

module.exports = { computeRuVatReturn };
