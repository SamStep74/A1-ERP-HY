"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Guards that Suite's server/<engine>.js files are thin shims resolving to the
// vendored a1-localization-am package (the single source of truth), not a stale
// in-tree copy. If someone re-vendors a broken/partial build, this fails fast.

const pkg = require("../server/vendor/a1-localization-am");

test("vendored package exposes every engine namespace", () => {
  for (const ns of ["localization", "phone", "regions", "chartOfAccounts", "payroll", "vatReturn", "einvoice"]) {
    assert.equal(typeof pkg[ns], "object", `missing namespace: ${ns}`);
  }
});

test("each server/<engine> is the vendored namespace (identity, no local copy)", () => {
  assert.equal(require("../server/localization"), pkg.localization);
  assert.equal(require("../server/armeniaPhone"), pkg.phone);
  assert.equal(require("../server/armeniaRegions"), pkg.regions);
  assert.equal(require("../server/armeniaChartOfAccounts"), pkg.chartOfAccounts);
  assert.equal(require("../server/einvoice"), pkg.einvoice);
  assert.equal(require("../server/vatReturn"), pkg.vatReturn);
  assert.equal(require("../server/armeniaPayroll"), pkg.payroll);
});

test("golden fiscal values survive the vendoring (regression guard)", () => {
  assert.equal(pkg.localization.validateHvhh("00123456").ok, true);
  assert.equal(pkg.localization.validateHvhh("123").ok, false);
  // 2026 payroll: gross 600,000 → net 433,200 (income 20%, tiered pension, flat 1,000 stamp, health 10,800)
  assert.equal(pkg.payroll.computePayroll(600000).net, 433200);
  // 226 = recoverable/input VAT in the RA chart of accounts
  assert.ok(pkg.chartOfAccounts.accountByCode("226"));
});
