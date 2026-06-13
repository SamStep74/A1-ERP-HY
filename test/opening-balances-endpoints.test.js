"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } });
  return res.headers["set-cookie"];
}

test("opening-balances endpoints: auth, post, balanced statements, idempotent", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const unauth = await app.inject({ method: "GET", url: "/api/finance/opening-balances" });
    assert.strictEqual(unauth.statusCode, 401);
    const cookie = await login(app);
    const post = await app.inject({ method: "POST", url: "/api/finance/opening-balances", headers: { cookie },
      payload: { asOf: "2026-01-01", entries: [{ code: "251", amount: 1000000 }, { code: "521", amount: 400000 }] } });
    assert.strictEqual(post.statusCode, 200);
    assert.strictEqual(post.json().count, 2);
    assert.strictEqual(post.json().openingEquity, 600000);
    const st = await app.inject({ method: "GET", url: "/api/finance/statements", headers: { cookie } });
    assert.strictEqual(st.json().balanceSheet.balanced, true);
    assert.strictEqual(st.json().balanceSheet.totalEquity, 600000);
    // idempotent re-post
    await app.inject({ method: "POST", url: "/api/finance/opening-balances", headers: { cookie },
      payload: { asOf: "2026-01-01", entries: [{ code: "251", amount: 1000000 }, { code: "521", amount: 400000 }] } });
    const list = await app.inject({ method: "GET", url: "/api/finance/opening-balances", headers: { cookie } });
    assert.strictEqual(list.json().count, 2);
  } finally { await app.close(); }
});

test("opening-balances POST is writer-gated: Auditor is rejected (403) and nothing is posted", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: "auditor@armosphera.local", password: DEFAULT_PASSWORD } });
    const cookie = res.headers["set-cookie"];
    const post = await app.inject({ method: "POST", url: "/api/finance/opening-balances", headers: { cookie },
      payload: { asOf: "2026-01-01", entries: [{ code: "251", amount: 1000000 }] } });
    assert.strictEqual(post.statusCode, 403);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const count = app.db.prepare("SELECT COUNT(*) AS c FROM ledger_journal WHERE org_id = ? AND source_type = 'opening_balance'").get(orgId).c;
    assert.strictEqual(count, 0);
  } finally { await app.close(); }
});

test("opening-balances POST is rejected for a closed period (409) and nothing is posted", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const close = await app.inject({ method: "POST", url: `/api/finance/periods/${openPeriod}/close`, headers: { cookie }, payload: { reason: "test close" } });
    assert.strictEqual(close.statusCode, 200, close.body);
    const post = await app.inject({ method: "POST", url: "/api/finance/opening-balances", headers: { cookie },
      payload: { asOf: `${openPeriod}-01`, entries: [{ code: "251", amount: 1000000 }] } });
    assert.strictEqual(post.statusCode, 409);
    const count = app.db.prepare("SELECT COUNT(*) AS c FROM ledger_journal WHERE org_id = ? AND source_type = 'opening_balance'").get(orgId).c;
    assert.strictEqual(count, 0);
  } finally { await app.close(); }
});

test("opening-balances POST rejects malformed metadata before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const initial = await app.inject({
      method: "POST",
      url: "/api/finance/opening-balances",
      headers: { cookie },
      payload: {
        asOf: "2026-01-01",
        entries: [
          { code: "251", amount: 1000000 },
          { code: "521", amount: 400000 }
        ]
      }
    });
    assert.strictEqual(initial.statusCode, 200, initial.body);
    const openingRows = () => app.db.prepare(`
      SELECT entry_date, debit_code, credit_code, amount, memo, source_id, period_key
      FROM ledger_journal
      WHERE org_id = ? AND source_type = 'opening_balance'
      ORDER BY source_id
    `).all(orgId);
    const auditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE type = ?
    `).get("finance.opening_balances.set").count;
    const secretCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM ledger_journal
      WHERE org_id = ?
        AND source_type = 'opening_balance'
        AND (
          entry_date LIKE ?
          OR debit_code LIKE ?
          OR credit_code LIKE ?
          OR memo LIKE ?
          OR source_id LIKE ?
          OR period_key LIKE ?
        )
    `).get(
      orgId,
      "%secret-opening-balance-%",
      "%secret-opening-balance-%",
      "%secret-opening-balance-%",
      "%secret-opening-balance-%",
      "%secret-opening-balance-%",
      "%secret-opening-balance-%"
    ).count;
    const rowsBefore = openingRows();
    const auditCountBefore = auditCount();
    const basePayload = {
      asOf: "2026-01-02",
      entries: [{ code: "251", amount: 1200000 }]
    };
    const tooManyEntries = Array.from({ length: 201 }, () => ({ code: "251", amount: 1 }));
    const explicitNull = await app.inject({
      method: "POST",
      url: "/api/finance/opening-balances",
      headers: { cookie, "content-type": "application/json" },
      payload: "null"
    });
    assert.strictEqual(explicitNull.statusCode, 400, explicitNull.body);
    const malformedRequests = [
      { ...basePayload, asOf: ["2026-01-02"] },
      { ...basePayload, asOf: "2026-01-02\nsecret-opening-balance-control-date-token" },
      { ...basePayload, asOf: "not-a-date-secret-opening-balance-date-token" },
      { ...basePayload, asOf: "2026-02-30" },
      { ...basePayload, entries: { code: "251", amount: 1200000 } },
      { ...basePayload, entries: "secret-opening-balance-entries-string-token" },
      { ...basePayload, entries: tooManyEntries },
      { ...basePayload, entries: [["251", 1200000]] },
      { ...basePayload, entries: [null] },
      { ...basePayload, entries: [{ code: ["251"], amount: 1200000 }] },
      { ...basePayload, entries: [{ code: { value: "251", token: "secret-opening-balance-code-object-token" }, amount: 1200000 }] },
      { ...basePayload, entries: [{ code: "251\nsecret-opening-balance-code-control-token", amount: 1200000 }] },
      { ...basePayload, entries: [{ code: "999", amount: 1200000 }] },
      { ...basePayload, entries: [{ code: "331", amount: 1200000 }] },
      { ...basePayload, entries: [{ code: "115", amount: 1200000 }] },
      { ...basePayload, entries: [{ code: "111", amount: 1200000, side: "credit" }] },
      { ...basePayload, entries: [{ code: "112", amount: 1200000, side: "debit" }] },
      { ...basePayload, entries: [{ code: "112", amount: 1200000, side: "contra-secret-opening-balance-side-token" }] },
      { ...basePayload, entries: [{ code: "112", amount: 1200000, side: "credit\nsecret-opening-balance-side-control-token" }] },
      { ...basePayload, entries: [{ code: "112", amount: 1200000, side: { value: "credit", token: "secret-opening-balance-side-object-token" } }] },
      { ...basePayload, entries: [{ code: "251", amount: ["1200000"] }] },
      { ...basePayload, entries: [{ code: "251", amount: { value: 1200000, token: "secret-opening-balance-amount-object-token" } }] },
      { ...basePayload, entries: [{ code: "251", amount: "1200000\nsecret-opening-balance-amount-control-token" }] },
      { ...basePayload, entries: [{ code: "251", amount: "not-a-number-secret-opening-balance-amount-token" }] },
      { ...basePayload, entries: [{ code: "251", amount: -1 }] },
      { ...basePayload, entries: [{ code: "251", amount: "-0.1" }] },
      { ...basePayload, entries: [{ code: "251", amount: 0.1 }] },
      ["secret-opening-balance-array-body-token"]
    ];

    for (const payload of malformedRequests) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/finance/opening-balances",
        headers: { cookie },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.doesNotMatch(rejected.body, /secret-opening-balance-/);
    }

    assert.deepStrictEqual(openingRows(), rowsBefore);
    assert.strictEqual(auditCount(), auditCountBefore);
    assert.strictEqual(secretCount(), 0);

    const corrected = await app.inject({
      method: "POST",
      url: "/api/finance/opening-balances",
      headers: { cookie },
      payload: {
        asOf: "2026-01-02",
        entries: [
          { code: "251", amount: "1200000" },
          { code: "521", amount: "0" }
        ]
      }
    });
    assert.strictEqual(corrected.statusCode, 200, corrected.body);
    assert.strictEqual(corrected.json().count, 1);
    assert.strictEqual(corrected.json().openingEquity, 1200000);
  } finally { await app.close(); }
});

test("opening-balances endpoint accepts reviewed contra-asset opening side", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const post = await app.inject({
      method: "POST",
      url: "/api/finance/opening-balances",
      headers: { cookie },
      payload: {
        asOf: "2026-01-01",
        entries: [
          { code: "111", amount: 1000000, side: "debit" },
          { code: "112", amount: 200000, side: "credit" }
        ]
      }
    });
    assert.strictEqual(post.statusCode, 200, post.body);
    const body = post.json();
    assert.strictEqual(body.count, 2);
    assert.strictEqual(body.openingEquity, 800000);
    assert.strictEqual(body.entries.find(entry => entry.code === "112").side, "credit");
    const statements = await app.inject({ method: "GET", url: "/api/finance/statements", headers: { cookie } });
    assert.strictEqual(statements.statusCode, 200, statements.body);
    assert.strictEqual(statements.json().balanceSheet.totalAssets, 800000);
    assert.strictEqual(statements.json().balanceSheet.balanced, true);
  } finally { await app.close(); }
});
