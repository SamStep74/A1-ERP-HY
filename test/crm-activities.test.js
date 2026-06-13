"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } });
  return res.headers["set-cookie"];
}

test("GET /api/crm/activities returns the org activity feed (auth required)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const unauth = await app.inject({ method: "GET", url: "/api/crm/activities" });
    assert.strictEqual(unauth.statusCode, 401);
    const cookie = await login(app);
    const res = await app.inject({ method: "GET", url: "/api/crm/activities", headers: { cookie } });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.json().activities));
  } finally { await app.close(); }
});
