"use strict";
// Characterization tests for the Armenian payroll engine boundaries (server/payroll.js).
// These lock down the EXACT RA-rule math at the tier edges, where off-by-one regressions hide:
//   - pension threshold (≤500000 lowRate vs >500000 highRate formula — continuous at the edge)
//   - pension baseCap (the 10% base is capped at 1125000 → contribution maxes at 87500)
//   - stamp-duty inclusive bracket upper bounds (100k/200k/500k/1M)
//   - gross=0 (all-zero) and the flat-stamp floor driving tiny salaries net-negative
//   - config-override merge (partial override keeps the other defaults)
// Pure engine: no server/app.js, no DB — require the module directly.
const test = require("node:test");
const assert = require("node:assert");
const payroll = require("../server/payroll");

const { calculatePayroll, pensionContribution, stampDuty, DEFAULT_CONFIG } = payroll;

test("payroll-boundaries: pension threshold is continuous at exactly 500000 (≤ uses lowRate)", () => {
  // At the threshold, the low-rate formula applies: 500000 * 0.05 = 25000.
  assert.strictEqual(pensionContribution(500000, DEFAULT_CONFIG), 25000, "threshold uses lowRate");
  // One AMD above, the high-rate formula takes over: 500001 * 0.10 - 25000 = 25000.1 → 25000.
  // The two formulas are DESIGNED to meet here — the contribution must not jump.
  assert.strictEqual(pensionContribution(500001, DEFAULT_CONFIG), 25000, "highRate formula is continuous at the edge");
});

test("payroll-boundaries: pension base is capped at 1125000 (contribution maxes at 87500)", () => {
  // At the cap: 1125000 * 0.10 - 25000 = 87500.
  assert.strictEqual(pensionContribution(1125000, DEFAULT_CONFIG), 87500, "pension at baseCap");
  // Above the cap, base is clamped to 1125000 → contribution stays 87500, never grows.
  assert.strictEqual(pensionContribution(2000000, DEFAULT_CONFIG), 87500, "pension is capped above baseCap");
  assert.strictEqual(pensionContribution(10000000, DEFAULT_CONFIG), 87500, "pension stays capped for very high salaries");
});

test("payroll-boundaries: pension never goes negative (Math.max floor)", () => {
  // A config whose highOffset would overshoot must floor at 0, not return a negative deduction.
  const cfg = payroll.DEFAULT_CONFIG;
  const evil = { ...cfg, pension: { ...cfg.pension, threshold: 0, highOffset: 10_000_000 } };
  assert.strictEqual(pensionContribution(100000, evil), 0, "pension floors at 0 when offset exceeds base*rate");
});

test("payroll-boundaries: stamp-duty inclusive upper bounds flip one AMD past each edge", () => {
  // upTo bounds are INCLUSIVE: gross <= upTo stays in the lower bracket.
  assert.strictEqual(stampDuty(100000, DEFAULT_CONFIG), 1500, "≤100000 → 1500");
  assert.strictEqual(stampDuty(100001, DEFAULT_CONFIG), 3000, "100001 → next bracket 3000");
  assert.strictEqual(stampDuty(200000, DEFAULT_CONFIG), 3000, "≤200000 → 3000");
  assert.strictEqual(stampDuty(200001, DEFAULT_CONFIG), 5500, "200001 → 5500");
  assert.strictEqual(stampDuty(500000, DEFAULT_CONFIG), 5500, "≤500000 → 5500");
  assert.strictEqual(stampDuty(500001, DEFAULT_CONFIG), 8500, "500001 → 8500");
  assert.strictEqual(stampDuty(1000000, DEFAULT_CONFIG), 8500, "≤1000000 → 8500");
  assert.strictEqual(stampDuty(1000001, DEFAULT_CONFIG), 15000, "1000001 → top bracket 15000");
  assert.strictEqual(stampDuty(0, DEFAULT_CONFIG), 0, "zero gross → no stamp duty");
});

test("payroll-boundaries: stamp and pension edges are independent (500000→500001 moves stamp, not pension)", () => {
  const at = calculatePayroll(500000);
  const past = calculatePayroll(500001);
  // Pension is continuous across this edge…
  assert.strictEqual(at.pension, 25000);
  assert.strictEqual(past.pension, 25000);
  // …while stamp jumps 5500 → 8500, so the deduction delta is exactly the stamp step (+3000).
  assert.strictEqual(at.stampDuty, 5500);
  assert.strictEqual(past.stampDuty, 8500);
  assert.strictEqual(past.totalDeductions - at.totalDeductions, 3000, "only stamp moves at this edge");
});

test("payroll-boundaries: gross=0 yields all-zero; the flat stamp floor can drive tiny salaries net-negative", () => {
  const zero = calculatePayroll(0);
  assert.deepStrictEqual(
    { gross: zero.gross, incomeTax: zero.incomeTax, pension: zero.pension, stampDuty: zero.stampDuty, totalDeductions: zero.totalDeductions, net: zero.net },
    { gross: 0, incomeTax: 0, pension: 0, stampDuty: 0, totalDeductions: 0, net: 0 },
    "zero gross is fully zero"
  );
  // A 1-AMD salary still owes the flat 1500 stamp → net is negative. This is faithful to the
  // engine (stamp is a fixed floor, not proportional); guard against a well-meaning Math.max(0)
  // that would silently hide a data-entry error.
  const tiny = calculatePayroll(1);
  assert.strictEqual(tiny.stampDuty, 1500);
  assert.strictEqual(tiny.net, -1499, "flat stamp floor exceeds a 1-AMD gross → net negative, not clamped");
});

test("payroll-boundaries: negative/garbage gross is clamped to 0 before computing", () => {
  for (const bad of [-1, -999999, NaN, undefined, null, "abc"]) {
    const r = calculatePayroll(bad);
    assert.strictEqual(r.gross, 0, `gross ${String(bad)} clamps to 0`);
    assert.strictEqual(r.net, 0, `net for ${String(bad)} is 0`);
    assert.strictEqual(r.totalDeductions, 0);
  }
});

test("payroll-boundaries: a partial config override merges with defaults (rate changes, brackets kept)", () => {
  // Override only the income-tax rate; pension + stamp must still come from the defaults.
  const r = calculatePayroll(600000, { config: { incomeTaxRate: 0.25 } });
  assert.strictEqual(r.incomeTax, 150000, "overridden 25% income tax");
  assert.strictEqual(r.incomeTaxRate, 0.25, "echoed override rate");
  // 600000 > 500000 → high-rate pension: min(600000,1125000)*0.10 - 25000 = 35000.
  assert.strictEqual(r.pension, 35000, "default pension formula preserved under partial override");
  assert.strictEqual(r.stampDuty, 8500, "default stamp brackets preserved (≤1000000)");
});
