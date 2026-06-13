"use strict";
const test = require("node:test");
const assert = require("node:assert");
const payroll = require("../server/payroll");

test("calculatePayroll for 600000 AMD matches RA rules", () => {
  const r = payroll.calculatePayroll(600000);
  assert.strictEqual(r.gross, 600000);
  assert.strictEqual(r.incomeTax, 120000);
  assert.strictEqual(r.pension, 35000);
  assert.strictEqual(r.stampDuty, 8500);
  assert.strictEqual(r.totalDeductions, 163500);
  assert.strictEqual(r.net, 436500);
});

test("pension uses the low rate below the threshold", () => {
  const r = payroll.calculatePayroll(400000);
  assert.strictEqual(r.incomeTax, 80000);
  assert.strictEqual(r.pension, 20000);
});
