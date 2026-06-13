"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } });
  return res.headers["set-cookie"];
}

test("service console exposes customers + agents pickers; create + PATCH a case", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const unauth = await app.inject({ method: "PATCH", url: "/api/service/cases/x", payload: { status: "open" } });
    assert.strictEqual(unauth.statusCode, 401);
    const cookie = await login(app);
    const console1 = (await app.inject({ method: "GET", url: "/api/service/console", headers: { cookie } })).json();
    assert.ok(Array.isArray(console1.cases) && console1.cases.length >= 1);
    assert.ok(Array.isArray(console1.customers) && console1.customers.length >= 1);
    assert.ok(Array.isArray(console1.agents) && console1.agents.length >= 1);

    const customerId = console1.cases[0].customerId;
    const created = await app.inject({ method: "POST", url: "/api/service/cases", headers: { cookie },
      payload: { customerId, subject: "Printer not working", priority: "high", channel: "Email" } });
    assert.strictEqual(created.statusCode, 200);
    const caseId = created.json().case.id;
    assert.strictEqual(created.json().case.status, "open");

    const moved = await app.inject({ method: "PATCH", url: `/api/service/cases/${caseId}`, headers: { cookie }, payload: { status: "in-progress" } });
    assert.strictEqual(moved.statusCode, 200);
    assert.strictEqual(moved.json().case.status, "in-progress");

    const bad = await app.inject({ method: "PATCH", url: `/api/service/cases/${caseId}`, headers: { cookie }, payload: { status: "bogus" } });
    assert.strictEqual(bad.statusCode, 400);

    const agentId = console1.agents.find(a => a.id).id;
    const reassigned = await app.inject({ method: "PATCH", url: `/api/service/cases/${caseId}`, headers: { cookie }, payload: { ownerUserId: agentId } });
    assert.strictEqual(reassigned.statusCode, 200);
    const badOwner = await app.inject({ method: "PATCH", url: `/api/service/cases/${caseId}`, headers: { cookie }, payload: { ownerUserId: "nope" } });
    assert.strictEqual(badOwner.statusCode, 400);

    const missing = await app.inject({ method: "PATCH", url: "/api/service/cases/does-not-exist", headers: { cookie }, payload: { status: "open" } });
    assert.strictEqual(missing.statusCode, 404);
  } finally { await app.close(); }
});

test("PATCH cannot de-escalate a supervisor-governed case without supervisor role", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const ownerCookie = await login(app); // Owner is a service supervisor
    const list = (await app.inject({ method: "GET", url: "/api/service/console", headers: { cookie: ownerCookie } })).json();
    const caseId = list.cases[0].id;

    // Owner (supervisor) escalates -> status becomes "escalated" (governed state)
    const escalated = await app.inject({ method: "POST", url: `/api/service/cases/${caseId}/escalate`, headers: { cookie: ownerCookie }, payload: { severity: "sla-risk", reason: "test escalation" } });
    assert.strictEqual(escalated.statusCode, 200);

    // A non-supervisor (Operator) must NOT be able to de-escalate via generic PATCH
    const opLogin = await app.inject({ method: "POST", url: "/api/login", payload: { email: "operator@armosphera.local", password: DEFAULT_PASSWORD } });
    const opCookie = opLogin.headers["set-cookie"];
    const blocked = await app.inject({ method: "PATCH", url: `/api/service/cases/${caseId}`, headers: { cookie: opCookie }, payload: { status: "in-progress" } });
    assert.strictEqual(blocked.statusCode, 403);

    // A supervisor still can
    const allowed = await app.inject({ method: "PATCH", url: `/api/service/cases/${caseId}`, headers: { cookie: ownerCookie }, payload: { status: "in-progress" } });
    assert.strictEqual(allowed.statusCode, 200);
    assert.strictEqual(allowed.json().case.status, "in-progress");
  } finally { await app.close(); }
});
