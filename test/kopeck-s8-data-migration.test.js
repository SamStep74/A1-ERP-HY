"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");

const { openDatabase, __test } = require("../server/db");

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

function makeLegacyDb(currency = "AMD") {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY,
      currency TEXT NOT NULL
    );
    CREATE TABLE ledger_journal (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      amount INTEGER NOT NULL
    );
    CREATE TABLE deals (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      value INTEGER NOT NULL,
      currency TEXT NOT NULL
    );
    CREATE TABLE quotes (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      vat INTEGER NOT NULL,
      total INTEGER NOT NULL,
      currency TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO organizations (id, currency) VALUES (?, ?)").run("org-legacy", currency);
  db.prepare("INSERT INTO ledger_journal (id, org_id, amount) VALUES (?, ?, ?)").run("ledger-1", "org-legacy", 123);
  db.prepare("INSERT INTO deals (id, org_id, value, currency) VALUES (?, ?, ?, ?)").run("deal-1", "org-legacy", 456, currency);
  db.prepare("INSERT INTO quotes (id, org_id, subtotal, vat, total, currency) VALUES (?, ?, ?, ?, ?, ?)")
    .run("quote-1", "org-legacy", 1000, 200, 1200, currency);
  return db;
}

function migrationRow(db) {
  return db.prepare("SELECT * FROM money_precision_migrations").get();
}

test("kopeck S8: AMD migration is an idempotent checksum-proven no-op", () => {
  const db = makeLegacyDb("AMD");
  try {
    __test.ensureMoneyPrecisionMigration(db);
    const row = migrationRow(db);
    assert.equal(row.rows_scaled, 0);
    assert.equal(row.checksum_before, row.checksum_after);
    assert.equal(JSON.parse(row.report).checksums.unchanged, true);
    assert.equal(db.prepare("SELECT amount FROM ledger_journal WHERE id = 'ledger-1'").get().amount, 123);
    assert.equal(db.prepare("SELECT value FROM deals WHERE id = 'deal-1'").get().value, 456);
    const quote = db.prepare("SELECT subtotal, vat, total FROM quotes WHERE id = 'quote-1'").get();
    assert.equal(quote.subtotal, 1000);
    assert.equal(quote.vat, 200);
    assert.equal(quote.total, 1200);

    __test.ensureMoneyPrecisionMigration(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM money_precision_migrations").get().count, 1);
    assert.equal(db.prepare("SELECT amount FROM ledger_journal WHERE id = 'ledger-1'").get().amount, 123);
  } finally {
    db.close();
  }
});

test("kopeck S8: legacy RUB rows scale once from whole rubles to kopecks", () => {
  const db = makeLegacyDb("RUB");
  try {
    __test.ensureMoneyPrecisionMigration(db);
    const row = migrationRow(db);
    assert.ok(row.rows_scaled > 0);
    assert.notEqual(row.checksum_before, row.checksum_after);
    assert.equal(JSON.parse(row.report).checksums.unchanged, false);
    assert.equal(db.prepare("SELECT amount FROM ledger_journal WHERE id = 'ledger-1'").get().amount, 12300);
    assert.equal(db.prepare("SELECT value FROM deals WHERE id = 'deal-1'").get().value, 45600);
    const quote = db.prepare("SELECT subtotal, vat, total FROM quotes WHERE id = 'quote-1'").get();
    assert.equal(quote.subtotal, 100000);
    assert.equal(quote.vat, 20000);
    assert.equal(quote.total, 120000);

    __test.ensureMoneyPrecisionMigration(db);
    assert.equal(db.prepare("SELECT amount FROM ledger_journal WHERE id = 'ledger-1'").get().amount, 12300);
    assert.equal(db.prepare("SELECT value FROM deals WHERE id = 'deal-1'").get().value, 45600);
  } finally {
    db.close();
  }
});

test("kopeck S8: migration rejects mixed row currency within one org", () => {
  const db = makeLegacyDb("RUB");
  try {
    db.prepare("UPDATE deals SET currency = 'AMD' WHERE id = 'deal-1'").run();
    assert.throws(
      () => __test.ensureMoneyPrecisionMigration(db),
      /currency invariant failed: deals\.currency differs/
    );
  } finally {
    db.close();
  }
});

test("kopeck S8: fresh RU seed is enabled as stored kopecks after the migration marker", () => {
  withLocale("ru", () => {
    const db = openDatabase(":memory:");
    try {
      const marker = migrationRow(db);
      const currencies = JSON.parse(marker.target_currencies);
      assert.deepEqual(currencies, [{ currency: "RUB", subunit: 2, factor: 100 }]);
      assert.ok(marker.rows_scaled > 0);

      assert.equal(db.prepare("SELECT currency FROM organizations WHERE id = 'org-armosphera-demo'").get().currency, "RUB");
      assert.equal(db.prepare("SELECT gross_salary FROM people_employees WHERE id = 'emp-anahit'").get().gross_salary, 60000000);
      assert.equal(db.prepare("SELECT lifetime_value FROM customers WHERE id = 'cust-nare'").get().lifetime_value, 1420000000);
      assert.equal(db.prepare("SELECT open_receivables FROM customers WHERE id = 'cust-nare'").get().open_receivables, 96000000);
      assert.equal(db.prepare("SELECT value FROM deals WHERE id = 'deal-nare-retainer'").get().value, 320000000);
      assert.equal(db.prepare("SELECT total FROM invoices WHERE id = 'inv-1007'").get().total, 96000000);
      assert.equal(db.prepare("SELECT unit_price FROM quote_lines WHERE id = 'quote-line-ani-inbox-setup'").get().unit_price, 55000000);
      assert.equal(db.prepare("SELECT budget FROM marketing_campaigns WHERE id = 'camp-armenia-growth-pilot'").get().budget, 25000000);
      assert.equal(db.prepare("SELECT unit_cost FROM purchase_vendor_prices WHERE id = 'vendor-price-yerevan-hardware-barcode-scanner'").get().unit_cost, 6000000);
    } finally {
      db.close();
    }
  });
});
