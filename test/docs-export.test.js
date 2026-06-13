"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

// Drive a document through the full lifecycle to a sealed/signed state, returning its id.
async function sealOneSignerDoc(app, cookie, { title = "Փորձնական պայմանագիր", body = "Կողմերը համաձայնում են." } = {}) {
  const docId = (await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie },
    payload: { title, body, docType: "agreement" } })).json().document.id;
  const signerId = (await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/signers`, headers: { cookie },
    payload: { signerName: "Արամ Արամյան", signerEmail: "aram@armosphera.local" } })).json().document.signers[0].id;
  await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/send`, headers: { cookie }, payload: {} });
  await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/sign`, headers: { cookie }, payload: { signerId } });
  return docId;
}

test("docs-export: a sealed document exports a printable HTML certificate with the full consent chain", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();

    // Export is auth-gated.
    const unauth = await app.inject({ method: "GET", url: "/api/docs/documents/doc-anahit-nda/export" });
    assert.strictEqual(unauth.statusCode, 401);

    const owner = await login(app);
    const docId = await sealOneSignerDoc(app, owner);

    const res = await app.inject({ method: "GET", url: `/api/docs/documents/${docId}/export`, headers: { cookie: owner } });
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.headers["content-type"], /text\/html/, "served as HTML");

    const html = res.body;
    assert.match(html, /@media print/, "carries print styles for Save-as-PDF");
    assert.ok(html.includes("Փորձնական պայմանագիր"), "renders the document title");
    assert.ok(html.includes("Կողմերը համաձայնում են."), "renders the document body");
    assert.ok(html.includes("Արամ Արամյան"), "renders the signer name");

    // The sealed document hash and the per-signer SHA-256 must appear (the consent evidence).
    const doc = (await app.inject({ method: "GET", url: `/api/docs/documents/${docId}`, headers: { cookie: owner } })).json().document;
    assert.ok(doc.sealedChecksum && html.includes(doc.sealedChecksum), "sealed checksum printed on the certificate");
    assert.ok(html.includes(doc.signers[0].checksum), "per-signer checksum printed");
    assert.ok(html.toLowerCase().includes("sealed") || html.includes("կնքված"), "marked as sealed");
  } finally { await app.close(); }
});

test("docs-export: an unsigned/out-for-signature document still exports but is marked not-yet-sealed", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Seeded doc-anahit-nda is out-for-signature with a pending signer.
    const res = await app.inject({ method: "GET", url: "/api/docs/documents/doc-anahit-nda/export", headers: { cookie: owner } });
    assert.strictEqual(res.statusCode, 200);
    const html = res.body;
    assert.ok(html.includes("Անահիտ Հակոբյան"), "lists the pending signer");
    // Not sealed yet → must not claim a sealed hash, and should say pending.
    assert.ok(!/sealed[^.]{0,40}[0-9a-f]{64}/i.test(html), "no sealed hash for an unsealed doc");
    assert.ok(/pending|սպասում|not yet|չի կնքվել/i.test(html), "indicates the document is not yet sealed/signed");
  } finally { await app.close(); }
});

test("docs-export: unknown id and cross-org access both 404 (no leak)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const documentCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM documents").get().count;
    const before = documentCount();

    const malformed = await app.inject({
      method: "GET",
      url: "/api/docs/documents/badAsecret-docs-document-path-export-id-token/export",
      headers: { cookie: owner }
    });
    assert.strictEqual(malformed.statusCode, 400, malformed.body);
    assert.match(malformed.body, /Invalid document id/);
    assert.doesNotMatch(malformed.body, /secret-docs-document-path-/);
    assert.strictEqual(documentCount(), before);

    const encodedMalformed = await app.inject({
      method: "GET",
      url: "/api/docs/documents/bad%0Asecret-docs-document-path-export-control-id-token/export",
      headers: { cookie: owner }
    });
    assert.strictEqual(encodedMalformed.statusCode, 400, encodedMalformed.body);
    assert.match(encodedMalformed.body, /Invalid document id/);
    assert.doesNotMatch(encodedMalformed.body, /secret-docs-document-path-/);
    assert.strictEqual(documentCount(), before);

    const unknown = await app.inject({ method: "GET", url: "/api/docs/documents/doc-nope/export", headers: { cookie: owner } });
    assert.strictEqual(unknown.statusCode, 404);
    assert.strictEqual(documentCount(), before);

    // Seed a foreign-org sealed-looking document; the owner must not be able to export it.
    const now = new Date().toISOString();
    app.db.prepare("INSERT INTO organizations (id, name, legal_name, tax_id, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("org-foreign-doc", "Foreign Docs LLC", "Foreign Docs LLC", "77777777", "AMD", now);
    app.db.prepare(`INSERT INTO documents (id, org_id, title, body, doc_type, status, customer_id, sealed_checksum, sealed_at, created_by_user_id, created_at, updated_at)
      VALUES ('doc-foreign-1', 'org-foreign-doc', 'Foreign agreement', 'secret body', 'agreement', 'signed', NULL, 'deadbeef', ?, NULL, ?, ?)`).run(now, now, now);

    const foreign = await app.inject({ method: "GET", url: "/api/docs/documents/doc-foreign-1/export", headers: { cookie: owner } });
    assert.strictEqual(foreign.statusCode, 404, "cross-org export is 404");
  } finally { await app.close(); }
});

test("docs-export: a malicious document body is HTML-escaped in the certificate (no stored XSS)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const xss = "<script>alert('pwn')</script>";
    const docId = await sealOneSignerDoc(app, owner, { title: xss, body: xss });

    const res = await app.inject({ method: "GET", url: `/api/docs/documents/${docId}/export`, headers: { cookie: owner } });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(!res.body.includes("<script>alert('pwn')</script>"), "raw script tag not emitted");
    assert.ok(res.body.includes("&lt;script&gt;"), "title/body HTML-escaped");
  } finally { await app.close(); }
});
