"use strict";
// Tenant isolation for the service desk: one org's case must be invisible and immutable
// to another org. PATCH / escalate / resolve / replies all resolve via
// getServiceCase(db, orgId, id), so a foreign id returns 404 (never 403, which would leak
// existence). Seed order follows the FK chain: organization -> customer -> service_case.
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("service-cases isolation: a foreign org's case is invisible and 404 on every :id route", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const ownerOrgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;

    // Seed org -> customer -> service_case in the foreign tenant (FK enforcement on).
    const now = new Date().toISOString();
    const otherOrgId = "org-other-desk";
    app.db.prepare("INSERT INTO organizations (id, name, legal_name, tax_id, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(otherOrgId, "Other Desk LLC", "Other Desk LLC", "44444444", "AMD", now);
    app.db.prepare(`INSERT INTO customers (id, org_id, name, health_score, lifetime_value, open_receivables, last_touch)
      VALUES ('cust-foreign-desk', ?, 'Foreign Customer', 50, 0, 0, ?)`).run(otherOrgId, now);
    const foreignId = "case-foreign-1";
    app.db.prepare(`INSERT INTO service_cases (id, org_id, customer_id, case_number, subject, status, priority, channel, sla_due_at, sla_status, ai_suggestion, knowledge_article, created_at, updated_at)
      VALUES (?, ?, 'cust-foreign-desk', 'AO-CASE-000999', 'Foreign issue', 'open', 'medium', 'Manual', ?, 'on-track', '', '', ?, ?)`)
      .run(foreignId, otherOrgId, now, now, now);

    // Not in the owner's service console.
    const console1 = (await app.inject({ method: "GET", url: "/api/service/console", headers: { cookie: owner } })).json();
    assert.ok(!console1.cases.some(c => c.id === foreignId), "foreign case leaked into owner console");

    // Every :id route resolves via getServiceCase(orgId,...) -> 404 (not 403) for a foreign case.
    const patch = await app.inject({ method: "PATCH", url: `/api/service/cases/${foreignId}`, headers: { cookie: owner }, payload: { status: "in-progress" } });
    assert.strictEqual(patch.statusCode, 404, "foreign case PATCH must 404");
    const reply = await app.inject({ method: "POST", url: `/api/service/cases/${foreignId}/replies`, headers: { cookie: owner }, payload: { message: "intrusion" } });
    assert.strictEqual(reply.statusCode, 404, "foreign case reply must 404");
    const escalate = await app.inject({ method: "POST", url: `/api/service/cases/${foreignId}/escalate`, headers: { cookie: owner }, payload: {} });
    assert.strictEqual(escalate.statusCode, 404, "foreign case escalate must 404");

    // Sanity: the foreign case is untouched in its own tenant.
    const stillThere = app.db.prepare("SELECT org_id, status FROM service_cases WHERE id = ?").get(foreignId);
    assert.strictEqual(stillThere.org_id, otherOrgId);
    assert.strictEqual(stillThere.status, "open", "foreign case status was not mutated");
    assert.notStrictEqual(otherOrgId, ownerOrgId);
  } finally { await app.close(); }
});
