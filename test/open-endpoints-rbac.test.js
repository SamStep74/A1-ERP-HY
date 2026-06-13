"use strict";
// Characterization guard for the INTENTIONALLY all-role endpoints. Unlike the finance
// ledger writes (gated to finance operators), opening a service case, filing a privacy
// request, and asking a legal question are everyday actions any authenticated employee
// must be able to perform. This pins that contract so an accidental future require*-gate
// (over-restriction) is caught — the inverse of the finance-RBAC test (under-restriction).
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("open endpoints: a non-privileged Support agent can open a service case (200, not 403)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    // A customer id to attach the case to (read from the seeded console).
    const owner = await login(app, DEFAULT_EMAIL);
    const console1 = (await app.inject({ method: "GET", url: "/api/service/console", headers: { cookie: owner } })).json();
    const customerId = console1.cases[0].customerId;

    // Support is neither Owner nor a finance operator — exactly the role an accidental gate would break.
    const support = await login(app, "support@armosphera.local");
    const created = await app.inject({ method: "POST", url: "/api/service/cases", headers: { cookie: support },
      payload: { customerId, subject: "Customer cannot log in", priority: "high", channel: "Email" } });
    assert.strictEqual(created.statusCode, 200, "Support must be able to open a service case");
    assert.ok(created.json().case && created.json().case.id, "case created");
  } finally { await app.close(); }
});

test("open endpoints: a Salesperson can file a privacy request (200, not 403)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app, DEFAULT_EMAIL);
    const console1 = (await app.inject({ method: "GET", url: "/api/service/console", headers: { cookie: owner } })).json();
    const customerId = console1.cases[0].customerId;

    const sales = await login(app, "sales@armosphera.local");
    const req = await app.inject({ method: "POST", url: "/api/privacy/requests", headers: { cookie: sales },
      payload: { customerId, requestType: "export", requesterEmail: "client@example.com", note: "Customer requested a copy of their data", channel: "Email" } });
    // The contract under test is access, not business preconditions: a Salesperson must not be
    // role-rejected (403). The endpoint may still 409 (e.g. the personal-data legal source needs
    // review in a fresh DB) or 200 — both prove it is NOT role-gated.
    assert.notStrictEqual(req.statusCode, 403, "filing a privacy request must not be role-gated");
    assert.notStrictEqual(req.statusCode, 401, "an authenticated salesperson is allowed");
  } finally { await app.close(); }
});

test("open endpoints: an Operator can ask a legal question (not 403)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local");
    const q = await app.inject({ method: "POST", url: "/api/legal/questions", headers: { cookie: operator },
      payload: { question: "Ի՞նչ է ԱԱՀ-ի դրույքաչափը" } });
    // The legal RAG may answer (200) or report it's not ready, but it must never 403 on role.
    assert.notStrictEqual(q.statusCode, 403, "asking a legal question must not be role-gated");
    assert.notStrictEqual(q.statusCode, 401, "an authenticated operator is allowed");
  } finally { await app.close(); }
});
