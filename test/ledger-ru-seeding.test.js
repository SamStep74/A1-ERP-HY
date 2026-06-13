"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { openDatabase } = require("../server/db");
const ledger = require("../server/ledger");

// A1_LOCALE is process-global; save/restore around each case (node runs each test file in
// its own process, so this can't leak into the AM golden-master files).
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

const BALANCE_TYPES = new Set(["asset", "liability", "equity", "income", "expense", "offBalance"]);

test("ledger seeds the RU План счетов 94н under A1_LOCALE=ru", () => {
  withLocale("ru", () => {
    const { db, orgId } = freshDb();
    ledger.ensureChartOfAccounts(db, orgId);
    const rows = db.prepare("SELECT code, name, type FROM ledger_accounts WHERE org_id = ?").all(orgId);
    assert.equal(rows.length, 73, "73 accounts (62 synthetic + 11 off-balance)");
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
    assert.equal(byCode["50"].name, "Касса");
    assert.equal(byCode["51"].type, "asset");
    assert.ok(byCode["19"], "input VAT account 19 present");
    assert.ok(byCode["62"] && byCode["90"] && byCode["68"] && byCode["70"], "core RU codes present");
    assert.equal(byCode["68"].type, "liability");
    assert.equal(byCode["90"].type, "income");
    assert.equal(byCode["80"].type, "equity");
    assert.equal(byCode["001"].type, "offBalance");
    // ledger_accounts.name/type are NOT NULL — a bad RU projection would have thrown on insert.
    for (const r of rows) {
      assert.ok(r.name && r.name.length > 0, `name present for ${r.code}`);
      assert.ok(BALANCE_TYPES.has(r.type), `valid type for ${r.code}: ${r.type}`);
    }
  });
});

test("chartOfAccounts() reports the RU source + sections under A1_LOCALE=ru", () => {
  withLocale("ru", () => {
    const coa = ledger.chartOfAccounts();
    assert.equal(coa.source.publisher, "Минфин России");
    assert.match(coa.source.sourceUrl, /consultant\.ru/);
    assert.equal(coa.accounts.length, 73);
    assert.ok(coa.classes.length >= 8, "8 разделы + off-balance");
  });
});

test("AM remains the default chart when A1_LOCALE is unset (regression guard)", () => {
  withLocale(undefined, () => {
    const coa = ledger.chartOfAccounts();
    assert.match(coa.source.sourceUrl, /arlis\.am/);
    assert.ok(coa.accounts.length > 600, "full RA chart");
    assert.equal(coa.classes.length, 9);
    // exported CHART stays the AM projection regardless of runtime locale
    assert.ok(ledger.CHART.length > 600);
  });
});
