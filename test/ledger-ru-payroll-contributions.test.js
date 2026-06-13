"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { openDatabase } = require("../server/db");
const ledger = require("../server/ledger");

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

function freshDb() {
  const db = openDatabase(":memory:");
  const orgId = db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
  return { db, orgId };
}

function balances(db, orgId) {
  return Object.fromEntries(ledger.trialBalance(db, orgId).rows.map((r) => [r.code, r]));
}

test("RU payroll posts employer страховые взносы to 69 when supplied", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postPayrollRun(db, orgId, {
      id: "pr-1", gross: 100000, net: 87000, totalDeductions: 13000,
      employerContributions: 30000, date: "2026-05-31",
    });
    const tb = ledger.trialBalance(db, orgId);
    assert.equal(tb.balanced, true);
    const b = balances(db, orgId);
    assert.equal(b["26"].balance, 130000); // expense: 100k wages + 30k contributions
    assert.equal(b["70"].balance, -87000); // net wages payable
    assert.equal(b["68"].balance, -13000); // НДФЛ payable
    assert.equal(b["69"].balance, -30000); // страховые взносы payable
  });
});

test("RU payroll accepts the locale engine employerInsurance field", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postPayrollRun(db, orgId, {
      id: "pr-insurance", gross: 100000, net: 87000, totalDeductions: 13000,
      employerInsurance: 30000, date: "2026-05-31",
    });
    const b = balances(db, orgId);
    assert.equal(b["26"].balance, 130000);
    assert.equal(b["69"].balance, -30000);
  });
});

test("RU payroll without contributions posts no 69 leg", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.postPayrollRun(db, orgId, { id: "pr-2", gross: 100000, net: 87000, totalDeductions: 13000, date: "2026-05-31" });
    const b = balances(db, orgId);
    assert.equal(b["26"].balance, 100000);
    assert.ok(!b["69"], "no 69 entry without contributions");
  });
});

test("AM payroll ignores employerContributions (RA model has no contributions account)", () => {
  withLocale(undefined, () => {
    const { db, orgId } = freshDb();
    ledger.postPayrollRun(db, orgId, {
      id: "pr-3", gross: 100000, net: 87000, totalDeductions: 13000,
      employerContributions: 30000, date: "2026-05-31",
    });
    const b = balances(db, orgId);
    assert.equal(b["714"].balance, 100000); // net + withholdings only; contributions ignored
    assert.ok(!b["69"], "AM has no 69 leg");
  });
});
