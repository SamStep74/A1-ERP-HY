"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const ledger = require("../server/ledger");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } });
  return res.headers["set-cookie"];
}

test("trial-balance + statements endpoints reflect posted ledger entries", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    ledger.postInvoicePosted(app.db, orgId, { id: "inv-e1", total: 1200, vat: 200, date: "2026-05-10" });
    const unauth = await app.inject({ method: "GET", url: "/api/finance/trial-balance" });
    assert.strictEqual(unauth.statusCode, 401);
    const res = await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } });
    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.balanced, true);
    assert.strictEqual(body.rows.find(r => r.code === "221").balance, 1200);
    const st = await app.inject({ method: "GET", url: "/api/finance/statements", headers: { cookie } });
    assert.strictEqual(st.json().incomeStatement.totalIncome, 1000);
  } finally { await app.close(); }
});

test("chart-of-accounts endpoint exposes the official RA chart", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const unauth = await app.inject({ method: "GET", url: "/api/finance/chart-of-accounts" });
    assert.strictEqual(unauth.statusCode, 401);
    const cookie = await login(app);
    const res = await app.inject({ method: "GET", url: "/api/finance/chart-of-accounts", headers: { cookie } });
    assert.strictEqual(res.statusCode, 200, res.body);
    const body = res.json();
    assert.ok(body.accounts.length >= 600, `expected official chart, got ${body.accounts.length}`);
    assert.strictEqual(body.classes.length, 9);
    assert.match(body.source.sourceUrl, /arlis\.am/);
    assert.deepStrictEqual(body.openingBalanceAccountCodes, ["111", "112", "221", "226", "251", "252", "521", "524", "525"]);
    assert.ok(body.openingBalanceAccountCodes.includes("111"));
    assert.ok(body.openingBalanceAccountCodes.includes("112"));
    assert.ok(body.openingBalanceAccountCodes.includes("521"));
    assert.ok(!body.openingBalanceAccountCodes.includes("115"));
    assert.ok(!body.openingBalanceAccountCodes.includes("311"));
    assert.ok(!body.openingBalanceAccountCodes.includes("331"));
    assert.ok(!body.openingBalanceAccountCodes.includes("611"));
    assert.ok(!body.openingBalanceAccountCodes.includes("714"));
    assert.ok(!body.openingBalanceAccountCodes.includes("911"));
    assert.strictEqual(body.openingBalanceAccounts.find(account => account.code === "111").side, "debit");
    assert.strictEqual(body.openingBalanceAccounts.find(account => account.code === "112").side, "credit");
    assert.strictEqual(body.openingBalanceAccounts.find(account => account.code === "521").side, "credit");
    assert.strictEqual(body.accounts.find(account => account.code === "226").type, "asset");
    assert.match(body.accounts.find(account => account.code === "226").name, /անուղղակի հարկեր/);
    assert.strictEqual(body.accounts.find(account => account.code === "526"), undefined);
  } finally { await app.close(); }
});
