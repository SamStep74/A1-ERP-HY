const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.join(__dirname, "..", "scripts", "ra-localization.js");
function cli(...args) {
  return execFileSync("node", [CLI, ...args], { encoding: "utf8" });
}

test("cli: hvhh validates a taxpayer id", () => {
  const r = JSON.parse(cli("hvhh", "00123456"));
  assert.equal(r.ok, true);
  assert.equal(r.normalized, "00123456");
});

test("cli: phone normalizes to E.164", () => {
  const r = JSON.parse(cli("phone", "091234567"));
  assert.equal(r.valid, true);
  assert.equal(r.e164, "+37491234567");
});

test("cli: region looks up a marz by ISO code", () => {
  const r = JSON.parse(cli("region", "AM-SH"));
  assert.equal(r.code, "AM-SH");
  assert.equal(r.en, "Shirak");
});

test("cli: account looks up a chart code with its normal balance", () => {
  const r = JSON.parse(cli("account", "251"));
  assert.equal(r.hy, "Դրամարկղ");
  assert.equal(r.normalBalance, "debit");
});

test("cli: payroll includes health-insurance withholding", () => {
  const r = JSON.parse(cli("payroll", "800000"));
  assert.equal(r.healthInsurance, 10800);
  assert.equal(r.totalWithholdings, 226800);
  assert.equal(r.net, 573200);
});

test("cli: vat-return emits official form source metadata", () => {
  const file = path.join(os.tmpdir(), `a1-vat-return-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify({ sales: [{ netAmount: 1000000, vatRate: 20 }], purchases: [] }));
  try {
    const r = JSON.parse(cli("vat-return", file));
    assert.equal(r.form["7"].vat, 200000);
    assert.equal(r.formSource.sourceUrl, "https://www.arlis.am/hy/acts/136996");
    assert.equal(r.formLineDefinitions["7"].section, "output");
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("cli: help prints usage", () => {
  assert.match(cli("help"), /RA localization CLI/);
});

test("cli: an unknown command exits non-zero", () => {
  assert.throws(() => cli("bogus"));
});
