"use strict";
// Tenant isolation for Forms: one org's form definition must be invisible and immutable
// to another org. The authenticated routes (GET/PATCH /api/forms/:id) resolve via
// getForm(db, orgId, id), so a foreign id returns 404 — never 403 (which would leak that
// the id exists). Platform-enabled public form routes are covered in platform-tenant tests.
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("forms isolation: a foreign org's form is invisible (list) and 404 on read/PATCH", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const ownerOrgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;

    // Seed a second org + a form that belongs to it (FK enforcement is on).
    const now = new Date().toISOString();
    const otherOrgId = "org-other-forms";
    app.db.prepare("INSERT INTO organizations (id, name, legal_name, tax_id, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(otherOrgId, "Other Forms LLC", "Other Forms LLC", "55555555", "AMD", now);
    const foreignId = "form-foreign-1";
    app.db.prepare(`INSERT INTO forms (id, org_id, title, description, fields, status, submission_count, created_at, updated_at)
      VALUES (?, ?, 'Foreign intake', '', '[]', 'draft', 0, ?, ?)`).run(foreignId, otherOrgId, now, now);

    // Not in the owner's list.
    const list = (await app.inject({ method: "GET", url: "/api/forms", headers: { cookie: owner } })).json();
    assert.ok(!list.forms.some(f => f.id === foreignId), "foreign form leaked into owner list");

    // Read a foreign form -> 404 (invisible), NOT 403.
    const read = await app.inject({ method: "GET", url: `/api/forms/${foreignId}`, headers: { cookie: owner } });
    assert.strictEqual(read.statusCode, 404, "foreign form read must 404");

    // PATCH a foreign form -> 404.
    const patch = await app.inject({ method: "PATCH", url: `/api/forms/${foreignId}`, headers: { cookie: owner }, payload: { title: "Hijacked" } });
    assert.strictEqual(patch.statusCode, 404, "foreign form PATCH must 404");

    // Sanity: the row still exists in its own tenant (isolation, not deletion), untouched.
    const stillThere = app.db.prepare("SELECT org_id, title FROM forms WHERE id = ?").get(foreignId);
    assert.strictEqual(stillThere.org_id, otherOrgId);
    assert.strictEqual(stillThere.title, "Foreign intake", "foreign form was not mutated");
    assert.notStrictEqual(otherOrgId, ownerOrgId);
  } finally { await app.close(); }
});
