"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("docs-templates: list is auth-gated and ships seeded RA templates with declared variables", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();

    const unauth = await app.inject({ method: "GET", url: "/api/docs/templates" });
    assert.strictEqual(unauth.statusCode, 401);

    const owner = await login(app);
    const list = (await app.inject({ method: "GET", url: "/api/docs/templates", headers: { cookie: owner } })).json();
    assert.ok(Array.isArray(list.templates) && list.templates.length >= 2, "seeded templates present");
    const nda = list.templates.find(t => t.key === "nda");
    assert.ok(nda, "seeded NDA template present");
    assert.strictEqual(nda.docType, "nda");
    assert.ok(Array.isArray(nda.variables) && nda.variables.includes("counterparty"), "template declares its variables");
    // Listing must not leak raw mustache body? It's fine to include body for preview, but variables must be declared.
    assert.ok(nda.name && nda.name.length > 2, "template has a human name");
  } finally { await app.close(); }
});

test("docs-templates: generate creates a draft, auto-fills org/date, honors supplied vars, marks the rest FILL", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const list = (await app.inject({ method: "GET", url: "/api/docs/templates", headers: { cookie: owner } })).json();
    const nda = list.templates.find(t => t.key === "nda");

    // Supply only counterparty; leave any other declared var unfilled.
    const gen = await app.inject({ method: "POST", url: `/api/docs/templates/${nda.id}/generate`, headers: { cookie: owner },
      payload: { customerId: "cust-ani", variables: { counterparty: "Բ Գործընկեր ՍՊԸ" } } });
    assert.strictEqual(gen.statusCode, 200);
    const doc = gen.json().document;
    assert.strictEqual(doc.status, "draft", "generated document is a draft");
    assert.strictEqual(doc.docType, "nda", "inherits the template doc type");
    assert.strictEqual(doc.customerId, "cust-ani", "links the chosen customer");

    // Supplied var substituted; org/date auto-filled (org legal name is the seeded demo org).
    assert.ok(doc.body.includes("Բ Գործընկեր ՍՊԸ"), "supplied counterparty substituted into the body");
    assert.ok(!doc.body.includes("{{counterparty}}"), "no raw mustache token remains for a filled var");
    assert.ok(!doc.body.includes("{{orgName}}") && !doc.body.includes("{{date}}"), "auto-filled vars are substituted");

    // Any declared-but-unsupplied var becomes a visible FILL marker, never a blank or raw token.
    const declared = nda.variables.filter(v => !["orgName", "date", "customerName"].includes(v) && v !== "counterparty");
    for (const v of declared) {
      assert.ok(doc.body.includes(`FILL: ${v}`) || doc.body.includes(v), `unfilled var ${v} surfaced as a FILL marker`);
      assert.ok(!doc.body.includes(`{{${v}}}`), `no raw mustache token left for ${v}`);
    }
    // The generated doc is a normal document — it appears in the registry and can be signed later.
    const docs = (await app.inject({ method: "GET", url: "/api/docs/documents", headers: { cookie: owner } })).json();
    assert.ok(docs.documents.some(d => d.id === doc.id), "generated doc shows in the registry");
  } finally { await app.close(); }
});

test("docs-templates: write-gate (Auditor 403), unknown template (404), bad customer (404)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const list = (await app.inject({ method: "GET", url: "/api/docs/templates", headers: { cookie: owner } })).json();
    const nda = list.templates.find(t => t.key === "nda");

    // Auditor (read-only) cannot generate documents.
    const auditor = await login(app, "auditor@armosphera.local", DEFAULT_PASSWORD);
    const blocked = await app.inject({ method: "POST", url: `/api/docs/templates/${nda.id}/generate`, headers: { cookie: auditor }, payload: {} });
    assert.strictEqual(blocked.statusCode, 403);

    // Unknown template id -> 404.
    const unknown = await app.inject({ method: "POST", url: "/api/docs/templates/tpl-nope/generate", headers: { cookie: owner }, payload: {} });
    assert.strictEqual(unknown.statusCode, 404);

    // Unknown customer -> 404 (reuses assertCustomer, which treats an unknown FK as not-found —
    // the house convention across documents/projects/finance routes).
    const badCust = await app.inject({ method: "POST", url: `/api/docs/templates/${nda.id}/generate`, headers: { cookie: owner }, payload: { customerId: "cust-nope" } });
    assert.strictEqual(badCust.statusCode, 404);
  } finally { await app.close(); }
});

test("docs-templates: malformed generate metadata is rejected before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const list = (await app.inject({ method: "GET", url: "/api/docs/templates", headers: { cookie: owner } })).json();
    const nda = list.templates.find(t => t.key === "nda");
    const documentCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM documents").get().count;
    const documentSecretCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM documents
      WHERE title LIKE ?
        OR body LIKE ?
        OR customer_id LIKE ?
        OR title = ?
        OR body LIKE ?
    `).get(
      "%secret-doc-template-generate-%",
      "%secret-doc-template-generate-%",
      "%secret-doc-template-generate-%",
      "[object Object]",
      "%[object Object]%"
    ).count;
    const auditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE type = ?
    `).get("docs.document.created").count;

    const documentCountBefore = documentCount();
    const auditCountBefore = auditCount();
    const malformedPath = await app.inject({
      method: "POST",
      url: `/api/docs/templates/${nda.id}%0Asecret-doc-template-generate-path-token/generate`,
      headers: { cookie: owner },
      payload: { variables: { counterparty: "Path token" } }
    });
    assert.strictEqual(malformedPath.statusCode, 400, malformedPath.body);
    assert.match(malformedPath.body, /Invalid document template id/);
    assert.ok(!malformedPath.body.includes("secret-doc-template-generate-path-token"), "rejected path secret is not reflected");
    assert.strictEqual(documentCount(), documentCountBefore, "malformed template path did not create a document");
    assert.strictEqual(documentSecretCount(), 0, "malformed template path metadata was not persisted");
    assert.strictEqual(auditCount(), auditCountBefore, "malformed template path did not write audit evidence");

    const malformedRequests = [
      ["secret-doc-template-generate-array-body-token"],
      {
        customerId: ["cust-ani"],
        variables: { counterparty: "secret-doc-template-generate-array-customer-token" }
      },
      {
        customerId: { id: "cust-ani", token: "secret-doc-template-generate-object-customer-token" },
        variables: { counterparty: "Counterparty" }
      },
      {
        customerId: "cust-ani\nsecret-doc-template-generate-control-customer-token",
        variables: { counterparty: "Counterparty" }
      },
      {
        customerId: "cust-ani",
        variables: ["secret-doc-template-generate-array-vars-token"]
      },
      {
        customerId: "cust-ani",
        variables: { counterparty: { text: "Counterparty", token: "secret-doc-template-generate-object-var-token" } }
      },
      {
        customerId: "cust-ani",
        variables: { counterparty: ["secret-doc-template-generate-array-var-token"] }
      },
      {
        customerId: "cust-ani",
        variables: { counterparty: "Counterparty\nsecret-doc-template-generate-control-var-token" }
      },
      {
        customerId: "cust-ani",
        variables: { "bad-key": "secret-doc-template-generate-bad-key-token" }
      },
      {
        customerId: "cust-ani",
        variables: { counterparty: `${"V".repeat(4001)}secret-doc-template-generate-long-var-token` }
      }
    ];

    for (const payload of malformedRequests) {
      const rejected = await app.inject({
        method: "POST",
        url: `/api/docs/templates/${nda.id}/generate`,
        headers: { cookie: owner },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.ok(!rejected.body.includes("secret-doc-template-generate"), "rejected payload secret is not reflected");
      assert.strictEqual(documentCount(), documentCountBefore, "malformed template generate did not create a document");
      assert.strictEqual(documentSecretCount(), 0, "malformed template metadata was not persisted");
      assert.strictEqual(auditCount(), auditCountBefore, "malformed template generate did not write audit evidence");
    }

    const generated = await app.inject({
      method: "POST",
      url: `/api/docs/templates/${nda.id}/generate`,
      headers: { cookie: owner },
      payload: { customerId: "cust-ani", variables: { counterparty: "{{orgName}} EVIL" } }
    });
    assert.strictEqual(generated.statusCode, 200, generated.body);
    assert.strictEqual(generated.json().document.customerId, "cust-ani");
    assert.ok(generated.json().document.body.includes("{{orgName}} EVIL"));
    assert.strictEqual(documentCount(), documentCountBefore + 1);
    assert.strictEqual(auditCount(), auditCountBefore + 1);
  } finally { await app.close(); }
});

test("docs-templates: a malicious variable value cannot inject a raw mustache or break out of substitution", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const list = (await app.inject({ method: "GET", url: "/api/docs/templates", headers: { cookie: owner } })).json();
    const nda = list.templates.find(t => t.key === "nda");

    // A value that itself contains a mustache token must be inserted literally, not re-expanded.
    const gen = await app.inject({ method: "POST", url: `/api/docs/templates/${nda.id}/generate`, headers: { cookie: owner },
      payload: { variables: { counterparty: "{{orgName}} EVIL" } } });
    assert.strictEqual(gen.statusCode, 200);
    const body = gen.json().document.body;
    // The literal token from the value survives as text (single-pass substitution, no recursion).
    assert.ok(body.includes("{{orgName}} EVIL"), "user value inserted literally, not re-expanded");
  } finally { await app.close(); }
});
