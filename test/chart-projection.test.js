"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { projectAccount, ruType, chartSourceFor } = require("../server/chartProjection");

test("AM projection is the historical identity (name=hy, type=type)", () => {
  const a = { code: "251", hy: "X-hy", en: "Cash", type: "asset" };
  assert.deepEqual(projectAccount("am", a), { code: "251", name: "X-hy", type: "asset" });
  // unknown locale falls back to the AM identity (safe default)
  assert.deepEqual(projectAccount("zz", a), { code: "251", name: "X-hy", type: "asset" });
});

test("RU projection uses .ru name and derives a РСБУ type", () => {
  assert.deepEqual(
    projectAccount("ru", { code: "50", ru: "Касса", nature: "active", section: "V" }),
    { code: "50", name: "Касса", type: "asset" },
  );
});

test("ruType maps representative 94н codes to balance-sheet/P&L groups", () => {
  const t = (code, nature) => ruType({ code, nature });
  assert.equal(t("01", "active"), "asset");
  assert.equal(t("02", "passive"), "asset"); // amortization — contra, grouped with assets
  assert.equal(t("19", "active"), "asset"); // input VAT
  assert.equal(t("26", "active"), "expense");
  assert.equal(t("50", "active"), "asset");
  assert.equal(t("60", "active-passive"), "liability"); // AP
  assert.equal(t("62", "active-passive"), "asset"); // AR
  assert.equal(t("68", "active-passive"), "liability"); // taxes
  assert.equal(t("70", "passive"), "liability"); // payroll
  assert.equal(t("80", "passive"), "equity");
  assert.equal(t("84", "active-passive"), "equity");
  assert.equal(t("90", "active-passive"), "income");
  assert.equal(t("99", "active-passive"), "equity");
  assert.equal(t("001"), "offBalance");
  assert.equal(t("011"), "offBalance");
});

test("ruType defensive fallback for unknown codes uses nature", () => {
  assert.equal(ruType({ code: "13", nature: "passive" }), "liability");
  assert.equal(ruType({ code: "13", nature: "active" }), "asset");
});

test("chartSourceFor returns locale-correct provenance", () => {
  const am = chartSourceFor("am", 623);
  assert.match(am.sourceUrl, /arlis\.am/);
  assert.equal(am.accountCount, 623);
  const ru = chartSourceFor("ru", 73);
  assert.equal(ru.publisher, "Минфин России");
  assert.match(ru.sourceUrl, /consultant\.ru/);
  assert.equal(ru.accountCount, 73);
});
