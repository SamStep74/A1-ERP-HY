"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

async function createSentOneSignerDocument(app, cookie, title = "Trusted proxy consent evidence") {
  const created = await app.inject({
    method: "POST",
    url: "/api/docs/documents",
    headers: { cookie },
    payload: { title, body: "Consent evidence body", docType: "agreement" }
  });
  assert.strictEqual(created.statusCode, 200, created.body);
  const docId = created.json().document.id;
  const signer = await app.inject({
    method: "POST",
    url: `/api/docs/documents/${docId}/signers`,
    headers: { cookie },
    payload: { signerName: "Անահիտ Ստորագրող" }
  });
  assert.strictEqual(signer.statusCode, 200, signer.body);
  const signerId = signer.json().document.signers[0].id;
  const sent = await app.inject({
    method: "POST",
    url: `/api/docs/documents/${docId}/send`,
    headers: { cookie },
    payload: {}
  });
  assert.strictEqual(sent.statusCode, 200, sent.body);
  return { docId, signerId };
}

test("docs-sign: full lifecycle draft -> signers -> send -> sign -> sealed signed", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();

    const unauth = await app.inject({ method: "GET", url: "/api/docs/documents" });
    assert.strictEqual(unauth.statusCode, 401);

    const owner = await login(app);
    const seeded = (await app.inject({ method: "GET", url: "/api/docs/documents", headers: { cookie: owner } })).json();
    assert.ok(Array.isArray(seeded.documents) && seeded.documents.length >= 2, "seeded documents present");

    // Create a draft
    const created = await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: owner },
      payload: { title: "Միջգործակալական համաձայնագիր", body: "Պայմանները...", docType: "agreement" } });
    assert.strictEqual(created.statusCode, 200);
    const docId = created.json().document.id;
    assert.strictEqual(created.json().document.status, "draft");

    // Title too short -> 400
    const badTitle = await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: owner }, payload: { title: "x" } });
    assert.strictEqual(badTitle.statusCode, 400);

    // Cannot send with no signers -> 409
    const sendEmpty = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/send`, headers: { cookie: owner }, payload: {} });
    assert.strictEqual(sendEmpty.statusCode, 409);

    // Add two signers
    const s1 = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/signers`, headers: { cookie: owner }, payload: { signerName: "Անահիտ Հակոբյան", signerEmail: "anahit@armosphera.local" } });
    assert.strictEqual(s1.statusCode, 200);
    const s2 = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/signers`, headers: { cookie: owner }, payload: { signerName: "Դավիթ Պետրոսյան" } });
    assert.strictEqual(s2.statusCode, 200);
    const signers = s2.json().document.signers;
    assert.strictEqual(signers.length, 2);

    // Edit is allowed while draft
    const edited = await app.inject({ method: "PATCH", url: `/api/docs/documents/${docId}`, headers: { cookie: owner }, payload: { body: "Թարմացված պայմաններ" } });
    assert.strictEqual(edited.statusCode, 200);

    // Send for signature
    const sent = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/send`, headers: { cookie: owner }, payload: {} });
    assert.strictEqual(sent.statusCode, 200);
    assert.strictEqual(sent.json().document.status, "out-for-signature");

    // Cannot edit once out for signature -> 409 (body is frozen before signing)
    const editLocked = await app.inject({ method: "PATCH", url: `/api/docs/documents/${docId}`, headers: { cookie: owner }, payload: { body: "tamper" } });
    assert.strictEqual(editLocked.statusCode, 409);

    // First signer signs -> still out-for-signature (one remaining)
    const sign1 = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/sign`, headers: { cookie: owner }, payload: { signerId: signers[0].id } });
    assert.strictEqual(sign1.statusCode, 200);
    assert.strictEqual(sign1.json().document.status, "out-for-signature");
    assert.strictEqual(sign1.json().document.signers.find(s => s.id === signers[0].id).status, "signed");

    // Double-sign the same signer -> 409
    const dup = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/sign`, headers: { cookie: owner }, payload: { signerId: signers[0].id } });
    assert.strictEqual(dup.statusCode, 409);

    // Last signer signs -> document seals to "signed" with a sealed checksum
    const sign2 = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/sign`, headers: { cookie: owner }, payload: { signerId: signers[1].id } });
    assert.strictEqual(sign2.statusCode, 200);
    assert.strictEqual(sign2.json().document.status, "signed");
    assert.ok(sign2.json().document.sealedChecksum && sign2.json().document.sealedChecksum.length === 64, "sha-256 sealed checksum present");
    assert.ok(sign2.json().document.signers.every(s => s.checksum && s.checksum.length === 64), "every signer has a consent checksum");

    // Cannot void a signed document -> 409 (executed contract is immutable)
    const voidSigned = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/void`, headers: { cookie: owner }, payload: {} });
    assert.strictEqual(voidSigned.statusCode, 409);
  } finally { await app.close(); }
});

test("docs-sign: write-gate (Auditor 403), void path, and signed-user binding", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Auditor (read-only) cannot create -> 403
    const auditor = await login(app, "auditor@armosphera.local", DEFAULT_PASSWORD);
    const blocked = await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: auditor }, payload: { title: "Should fail" } });
    assert.strictEqual(blocked.statusCode, 403);

    // Owner can void a draft
    const created = await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: owner }, payload: { title: "Void me please" } });
    const docId = created.json().document.id;
    const voided = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/void`, headers: { cookie: owner }, payload: { reason: "superseded" } });
    assert.strictEqual(voided.statusCode, 200);
    assert.strictEqual(voided.json().document.status, "voided");

    // Cannot add signers to a voided doc -> 409
    const lateSigner = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/signers`, headers: { cookie: owner }, payload: { signerName: "Too Late" } });
    assert.strictEqual(lateSigner.statusCode, 409);

    // Signer bound to a specific user can only be signed by THAT user.
    const opOrgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
    const operator = app.db.prepare("SELECT id FROM users WHERE org_id = ? AND role = 'Operator' LIMIT 1").get(opOrgId);
    const doc2 = await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: owner }, payload: { title: "User-bound signature" } });
    const doc2Id = doc2.json().document.id;
    await app.inject({ method: "POST", url: `/api/docs/documents/${doc2Id}/signers`, headers: { cookie: owner }, payload: { signerName: "Armosphera Operator", signerUserId: operator.id } });
    await app.inject({ method: "POST", url: `/api/docs/documents/${doc2Id}/send`, headers: { cookie: owner }, payload: {} });
    const full = (await app.inject({ method: "GET", url: `/api/docs/documents/${doc2Id}`, headers: { cookie: owner } })).json();
    const boundSignerId = full.document.signers[0].id;
    // Owner is NOT the bound user -> 403
    const wrongUser = await app.inject({ method: "POST", url: `/api/docs/documents/${doc2Id}/sign`, headers: { cookie: owner }, payload: { signerId: boundSignerId } });
    assert.strictEqual(wrongUser.statusCode, 403);
  } finally { await app.close(); }
});

test("docs-sign: documents list attaches each document's own signers (correct grouping)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Two distinct documents with distinct signer sets.
    const a = (await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: owner }, payload: { title: "Doc A" } })).json().document.id;
    const b = (await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: owner }, payload: { title: "Doc B" } })).json().document.id;
    await app.inject({ method: "POST", url: `/api/docs/documents/${a}/signers`, headers: { cookie: owner }, payload: { signerName: "Ա Մեկ" } });
    await app.inject({ method: "POST", url: `/api/docs/documents/${a}/signers`, headers: { cookie: owner }, payload: { signerName: "Ա Երկու" } });
    await app.inject({ method: "POST", url: `/api/docs/documents/${b}/signers`, headers: { cookie: owner }, payload: { signerName: "Բ Մեկ" } });

    const list = (await app.inject({ method: "GET", url: "/api/docs/documents", headers: { cookie: owner } })).json();
    const docA = list.documents.find(d => d.id === a);
    const docB = list.documents.find(d => d.id === b);
    // Each document carries exactly its own signers — no cross-contamination from batching.
    assert.deepStrictEqual(docA.signers.map(s => s.signerName).sort(), ["Ա Երկու", "Ա Մեկ"]);
    assert.deepStrictEqual(docB.signers.map(s => s.signerName), ["Բ Մեկ"]);
    // Every listed document exposes a signers array (even if empty).
    assert.ok(list.documents.every(d => Array.isArray(d.signers)), "every document has a signers array");
  } finally { await app.close(); }
});

test("docs-sign: duplicate signer name on one document is rejected (409) — unambiguous consent chain", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const created = await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: owner }, payload: { title: "Dual-signer agreement" } });
    const docId = created.json().document.id;

    const first = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/signers`, headers: { cookie: owner }, payload: { signerName: "Անահիտ Սարգսյան" } });
    assert.strictEqual(first.statusCode, 200);

    // Same name again -> 409: a sealed evidence chain must not contain two identically-named signers.
    const dup = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/signers`, headers: { cookie: owner }, payload: { signerName: "Անահիտ Սարգսյան" } });
    assert.strictEqual(dup.statusCode, 409);

    // Case- and whitespace-insensitive: trimmed/cased variants are still duplicates.
    const dupCase = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/signers`, headers: { cookie: owner }, payload: { signerName: "  անահիտ սարգսյան  " } });
    assert.strictEqual(dupCase.statusCode, 409);

    // A genuinely different signer is still accepted, and only one "Անահիտ" exists.
    const other = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/signers`, headers: { cookie: owner }, payload: { signerName: "Դավիթ Պետրոսյան" } });
    assert.strictEqual(other.statusCode, 200);
    assert.strictEqual(other.json().document.signers.length, 2);

    // The same name on a DIFFERENT document is fine (scope is per-document).
    const created2 = await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: owner }, payload: { title: "Separate agreement" } });
    const doc2Id = created2.json().document.id;
    const reuse = await app.inject({ method: "POST", url: `/api/docs/documents/${doc2Id}/signers`, headers: { cookie: owner }, payload: { signerName: "Անահիտ Սարգսյան" } });
    assert.strictEqual(reuse.statusCode, 200);
  } finally { await app.close(); }
});

test("docs-sign: malformed document metadata is rejected before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/docs/documents",
      headers: { cookie: owner },
      payload: {
        title: "Metadata guarded agreement",
        body: "Line one\nLine two",
        docType: "agreement"
      }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    const docId = created.json().document.id;
    assert.strictEqual(created.json().document.body, "Line one\nLine two");

    const signer = await app.inject({
      method: "POST",
      url: `/api/docs/documents/${docId}/signers`,
      headers: { cookie: owner },
      payload: { signerName: "Մետատվյալ Ստորագրող", signerEmail: "signer@armosphera.local" }
    });
    assert.strictEqual(signer.statusCode, 200, signer.body);
    const signerId = signer.json().document.signers[0].id;

    const sent = await app.inject({
      method: "POST",
      url: `/api/docs/documents/${docId}/send`,
      headers: { cookie: owner },
      payload: {}
    });
    assert.strictEqual(sent.statusCode, 200, sent.body);

    const voidDraft = await app.inject({
      method: "POST",
      url: "/api/docs/documents",
      headers: { cookie: owner },
      payload: { title: "Void metadata guard draft" }
    });
    assert.strictEqual(voidDraft.statusCode, 200, voidDraft.body);
    const voidDocId = voidDraft.json().document.id;

    const sendDraft = await app.inject({
      method: "POST",
      url: "/api/docs/documents",
      headers: { cookie: owner },
      payload: { title: "Send metadata guard draft" }
    });
    assert.strictEqual(sendDraft.statusCode, 200, sendDraft.body);
    const sendDocId = sendDraft.json().document.id;
    const sendSigner = await app.inject({
      method: "POST",
      url: `/api/docs/documents/${sendDocId}/signers`,
      headers: { cookie: owner },
      payload: { signerName: "Ուղարկման Պահակ", signerEmail: "send-guard@armosphera.local" }
    });
    assert.strictEqual(sendSigner.statusCode, 200, sendSigner.body);

    const counts = () => ({
      documents: app.db.prepare("SELECT COUNT(*) AS count FROM documents WHERE org_id = ?").get("org-armosphera-demo").count,
      signers: app.db.prepare("SELECT COUNT(*) AS count FROM document_signers WHERE org_id = ?").get("org-armosphera-demo").count,
      signedSigners: app.db.prepare("SELECT COUNT(*) AS count FROM document_signers WHERE org_id = ? AND status = ?").get("org-armosphera-demo", "signed").count,
      voidedDocuments: app.db.prepare("SELECT COUNT(*) AS count FROM documents WHERE org_id = ? AND status = ?").get("org-armosphera-demo", "voided").count,
      suiteEvents: app.db.prepare(`
        SELECT COUNT(*) AS count
        FROM suite_events
        WHERE org_id = ?
          AND event_type IN (?, ?, ?)
      `).get("org-armosphera-demo", "docs.document.sent", "docs.document.signed", "docs.document.voided").count,
      auditEvents: app.db.prepare(`
        SELECT COUNT(*) AS count
        FROM audit_events
        WHERE org_id = ?
          AND type IN (?, ?, ?, ?, ?, ?, ?)
      `).get(
        "org-armosphera-demo",
        "docs.document.created",
        "docs.document.updated",
        "docs.signer.added",
        "docs.document.sent",
        "docs.document.signed",
        "docs.document.sealed",
        "docs.document.voided"
      ).count
    });
    const getDocumentStatus = id =>
      app.db.prepare("SELECT status FROM documents WHERE org_id = ? AND id = ?").get("org-armosphera-demo", id).status;
    const before = counts();

    const rejectedNull = async url => {
      const response = await app.inject({
        method: url.method,
        url: url.path,
        headers: { cookie: owner, "content-type": "application/json" },
        payload: "null"
      });
      assert.strictEqual(response.statusCode, 400, response.body);
      assert.doesNotMatch(response.body, /secret-docs-metadata-/);
    };
    const rejected = async (method, url, payload) => {
      const response = await app.inject({ method, url, headers: { cookie: owner }, payload });
      assert.strictEqual(response.statusCode, 400, response.body);
      assert.doesNotMatch(response.body, /secret-docs-metadata-/);
    };

    const createUrl = "/api/docs/documents";
    const patchUrl = `/api/docs/documents/${voidDocId}`;
    const signerUrl = `/api/docs/documents/${voidDocId}/signers`;
    const sendUrl = `/api/docs/documents/${sendDocId}/send`;
    const signUrl = `/api/docs/documents/${docId}/sign`;
    const voidUrl = `/api/docs/documents/${voidDocId}/void`;

    const rejectedDocumentPath = async ({ method, path, payload, expectedStatus = 400, expectedStatuses }) => {
      const request = { method, url: path, headers: { cookie: owner } };
      if (payload !== undefined) request.payload = payload;
      const response = await app.inject(request);
      const allowedStatuses = expectedStatuses || [expectedStatus];
      assert.ok(allowedStatuses.includes(response.statusCode), `${path}: ${response.body}`);
      if (response.statusCode === 400) {
        assert.match(response.body, /Invalid document id/);
      }
      assert.doesNotMatch(response.body, /secret-docs-document-path-/);
      assert.deepStrictEqual(counts(), before);
      assert.strictEqual(getDocumentStatus(sendDocId), "draft");
    };
    const malformedDocumentPathRequests = [
      { method: "GET", path: "/api/docs/documents/badAsecret-docs-document-path-read-id-token" },
      { method: "PATCH", path: "/api/docs/documents/bad_secret-docs-document-path-patch-id-token", payload: { title: "secret-docs-document-path-patch-body-token" } },
      { method: "POST", path: "/api/docs/documents/badAsecret-docs-document-path-signer-id-token/signers", payload: { signerName: "Route Guard Signer", signerEmail: "route-guard@armosphera.local" } },
      { method: "POST", path: "/api/docs/documents/bad_secret-docs-document-path-send-id-token/send", payload: { note: "secret-docs-document-path-send-body-token" } },
      { method: "POST", path: "/api/docs/documents/badAsecret-docs-document-path-sign-id-token/sign", payload: { signerId } },
      { method: "POST", path: "/api/docs/documents/bad_secret-docs-document-path-void-id-token/void", payload: { reason: "secret-docs-document-path-void-body-token" } },
      { method: "GET", path: `/api/docs/documents/${"a".repeat(161)}`, expectedStatuses: [400, 404] },
      { method: "POST", path: "/api/docs/documents/bad%0Asecret-docs-document-path-control-id-token/send", payload: { note: "secret-docs-document-path-encoded-send-body-token" }, expectedStatuses: [400, 404] },
      { method: "POST", path: "/api/docs/documents/%20%20/sign", payload: { signerId: "secret-docs-document-path-encoded-signer-token" }, expectedStatuses: [400, 404] }
    ];
    for (const request of malformedDocumentPathRequests) {
      await rejectedDocumentPath(request);
    }

    const missingDocumentPathRequests = [
      { method: "GET", path: "/api/docs/documents/doc-missing", expectedStatus: 404 },
      { method: "PATCH", path: "/api/docs/documents/doc-missing", payload: { title: "secret-docs-document-path-missing-patch-body-token" }, expectedStatus: 404 },
      { method: "POST", path: "/api/docs/documents/doc-missing/signers", payload: { signerName: "Route Guard Signer" }, expectedStatus: 404 },
      { method: "POST", path: "/api/docs/documents/doc-missing/send", payload: {}, expectedStatus: 404 },
      { method: "POST", path: "/api/docs/documents/doc-missing/sign", payload: { signerId: "secret-docs-document-path-missing-signer-token" }, expectedStatus: 404 },
      { method: "POST", path: "/api/docs/documents/doc-missing/void", payload: { reason: "secret-docs-document-path-missing-void-body-token" }, expectedStatus: 404 }
    ];
    for (const request of missingDocumentPathRequests) {
      await rejectedDocumentPath(request);
    }

    await rejectedNull({ method: "POST", path: createUrl });
    await rejectedNull({ method: "PATCH", path: patchUrl });
    await rejectedNull({ method: "POST", path: signerUrl });
    await rejectedNull({ method: "POST", path: sendUrl });
    await rejectedNull({ method: "POST", path: signUrl });
    await rejectedNull({ method: "POST", path: voidUrl });

    await rejected("POST", createUrl, ["secret-docs-metadata-create-array-token"]);
    await rejected("POST", createUrl, { title: { value: "Agreement", token: "secret-docs-metadata-title-object-token" } });
    await rejected("POST", createUrl, { title: "Agreement\nsecret-docs-metadata-title-control-token" });
    await rejected("POST", createUrl, { title: `${"T".repeat(201)}secret-docs-metadata-title-long-token` });
    await rejected("POST", createUrl, { title: "Valid agreement", body: { value: "Terms", token: "secret-docs-metadata-body-object-token" } });
    await rejected("POST", createUrl, { title: "Valid agreement", body: "Terms\u0000secret-docs-metadata-body-control-token" });
    await rejected("POST", createUrl, { title: "Valid agreement", docType: ["agreement"] });
    await rejected("POST", createUrl, { title: "Valid agreement", docType: "ghost-secret-docs-metadata-type-token" });
    await rejected("POST", createUrl, { title: "Valid agreement", customerId: { value: "cust-nare", token: "secret-docs-metadata-customer-object-token" } });

    await rejected("PATCH", patchUrl, ["secret-docs-metadata-patch-array-token"]);
    await rejected("PATCH", patchUrl, { title: { value: "Patch", token: "secret-docs-metadata-patch-title-object-token" } });
    await rejected("PATCH", patchUrl, { body: "Patch\u0000secret-docs-metadata-patch-body-control-token" });
    await rejected("PATCH", patchUrl, { docType: "bad-secret-docs-metadata-patch-type-token" });

    await rejected("POST", signerUrl, ["secret-docs-metadata-signer-array-token"]);
    await rejected("POST", signerUrl, { signerName: { value: "Signer", token: "secret-docs-metadata-signer-name-object-token" } });
    await rejected("POST", signerUrl, { signerName: "Signer\nsecret-docs-metadata-signer-control-token" });
    await rejected("POST", signerUrl, { signerName: "Signer", signerEmail: { value: "signer@example.com", token: "secret-docs-metadata-email-object-token" } });
    await rejected("POST", signerUrl, { signerName: "Signer", signerUserId: ["user-operator"] });

    await rejected("POST", sendUrl, ["secret-docs-metadata-send-array-token"]);
    await rejected("POST", sendUrl, { note: "secret-docs-metadata-send-extra-token" });

    await rejected("POST", signUrl, ["secret-docs-metadata-sign-array-token"]);
    await rejected("POST", signUrl, { signerId: { value: signerId, token: "secret-docs-metadata-signer-id-object-token" } });
    await rejected("POST", signUrl, { signerId: `${signerId}\nsecret-docs-metadata-signer-id-control-token` });

    await rejected("POST", voidUrl, ["secret-docs-metadata-void-array-token"]);
    await rejected("POST", voidUrl, { reason: { value: "Superseded", token: "secret-docs-metadata-void-reason-object-token" } });
    await rejected("POST", voidUrl, { reason: "Superseded\nsecret-docs-metadata-void-reason-control-token" });
    await rejected("POST", voidUrl, { reason: `${"R".repeat(501)}secret-docs-metadata-void-reason-long-token` });

    assert.deepStrictEqual(counts(), before);
    assert.strictEqual(getDocumentStatus(sendDocId), "draft");

    const patched = await app.inject({
      method: "PATCH",
      url: patchUrl,
      headers: { cookie: owner },
      payload: { title: "Void metadata guard draft patched", body: "Valid patched body", docType: "policy" }
    });
    assert.strictEqual(patched.statusCode, 200, patched.body);
    assert.strictEqual(patched.json().document.docType, "policy");

    const signed = await app.inject({
      method: "POST",
      url: signUrl,
      headers: { cookie: owner },
      payload: { signerId }
    });
    assert.strictEqual(signed.statusCode, 200, signed.body);
    assert.strictEqual(signed.json().document.status, "signed");

    const voided = await app.inject({
      method: "POST",
      url: voidUrl,
      headers: { cookie: owner },
      payload: { reason: "Superseded by guarded metadata test" }
    });
    assert.strictEqual(voided.statusCode, 200, voided.body);
    assert.strictEqual(voided.json().document.status, "voided");
  } finally { await app.close(); }
});

test("docs-sign: malformed document path ids are rejected before lifecycle side effects", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/docs/documents",
      headers: { cookie: owner },
      payload: {
        title: "Path guarded agreement",
        body: "Path guard body",
        docType: "agreement"
      }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    const docId = created.json().document.id;

    const counts = () => ({
      documents: app.db.prepare("SELECT COUNT(*) AS count FROM documents WHERE org_id = ?").get("org-armosphera-demo").count,
      signers: app.db.prepare("SELECT COUNT(*) AS count FROM document_signers WHERE org_id = ?").get("org-armosphera-demo").count,
      signedSigners: app.db.prepare("SELECT COUNT(*) AS count FROM document_signers WHERE org_id = ? AND status = ?").get("org-armosphera-demo", "signed").count,
      voidedDocuments: app.db.prepare("SELECT COUNT(*) AS count FROM documents WHERE org_id = ? AND status = ?").get("org-armosphera-demo", "voided").count,
      suiteEvents: app.db.prepare(`
        SELECT COUNT(*) AS count
        FROM suite_events
        WHERE org_id = ?
          AND event_type IN (?, ?, ?)
      `).get("org-armosphera-demo", "docs.document.sent", "docs.document.signed", "docs.document.voided").count,
      auditEvents: app.db.prepare(`
        SELECT COUNT(*) AS count
        FROM audit_events
        WHERE org_id = ?
          AND type IN (?, ?, ?, ?, ?, ?)
      `).get(
        "org-armosphera-demo",
        "docs.document.updated",
        "docs.signer.added",
        "docs.document.sent",
        "docs.document.signed",
        "docs.document.sealed",
        "docs.document.voided"
      ).count
    });
    const snapshotDocument = () =>
      app.db.prepare("SELECT title, body, doc_type AS docType, status FROM documents WHERE org_id = ? AND id = ?")
        .get("org-armosphera-demo", docId);
    const before = counts();
    const beforeDocument = snapshotDocument();

    const routes = [
      { method: "GET", suffix: "" },
      { method: "PATCH", suffix: "", payload: { title: "secret-doc-path-patch-token" } },
      { method: "POST", suffix: "/signers", payload: { signerName: "secret-doc-path-signer-token" } },
      { method: "POST", suffix: "/send", payload: {} },
      { method: "POST", suffix: "/sign", payload: { signerId: "secret-doc-path-signer-id-token" } },
      { method: "POST", suffix: "/void", payload: { reason: "secret-doc-path-void-token" } },
      { method: "GET", suffix: "/export" }
    ];
    const malformedIds = [
      "badAsecret-doc-path-token",
      "bad_secret-doc-path-token",
      "a".repeat(161),
      "bad%0Asecret-doc-path-control-token",
      "%20%20"
    ];

    for (const id of malformedIds) {
      for (const route of routes) {
        const response = await app.inject({
          method: route.method,
          url: `/api/docs/documents/${id}${route.suffix}`,
          headers: { cookie: owner },
          payload: route.payload
        });
        assert.ok([400, 404].includes(response.statusCode), `${route.method} ${id}${route.suffix} -> ${response.statusCode}: ${response.body}`);
        if (response.statusCode === 400) {
          assert.match(response.body, /Invalid document id/);
        }
        assert.doesNotMatch(response.body, /secret-doc-path-/);
      }
    }

    for (const route of routes) {
      const response = await app.inject({
        method: route.method,
        url: `/api/docs/documents/doc-missing-path-guard${route.suffix}`,
        headers: { cookie: owner },
        payload: route.payload
      });
      assert.strictEqual(response.statusCode, 404, response.body);
      assert.doesNotMatch(response.body, /secret-doc-path-/);
    }

    assert.deepStrictEqual(counts(), before);
    assert.deepStrictEqual(snapshotDocument(), beforeDocument);

    const validPatch = await app.inject({
      method: "PATCH",
      url: `/api/docs/documents/${docId}`,
      headers: { cookie: owner },
      payload: { title: "Path guarded agreement patched" }
    });
    assert.strictEqual(validPatch.statusCode, 200, validPatch.body);
    assert.strictEqual(validPatch.json().document.title, "Path guarded agreement patched");

    const exportDraft = await app.inject({
      method: "GET",
      url: `/api/docs/documents/${docId}/export`,
      headers: { cookie: owner }
    });
    assert.strictEqual(exportDraft.statusCode, 200, exportDraft.body);
    assert.match(exportDraft.body, /Path guarded agreement patched/);
  } finally { await app.close(); }
});

test("docs-sign: cross-org isolation — a foreign document is invisible (404)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const now = new Date().toISOString();
    const otherOrgId = "org-other-docs";
    app.db.prepare("INSERT INTO organizations (id, name, legal_name, tax_id, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(otherOrgId, "Other Docs LLC", "Other Docs LLC", "77777777", "AMD", now);
    const foreignId = "doc-foreign-1";
    app.db.prepare(`INSERT INTO documents (id, org_id, title, body, doc_type, status, customer_id, sealed_checksum, sealed_at, created_at, updated_at)
      VALUES (?, ?, ?, '', 'agreement', 'draft', NULL, '', '', ?, ?)`).run(foreignId, otherOrgId, "Foreign doc", now, now);

    const list = (await app.inject({ method: "GET", url: "/api/docs/documents", headers: { cookie: owner } })).json();
    assert.ok(!list.documents.some(d => d.id === foreignId), "foreign document leaked into owner list");

    const get = await app.inject({ method: "GET", url: `/api/docs/documents/${foreignId}`, headers: { cookie: owner } });
    assert.strictEqual(get.statusCode, 404);
    const send = await app.inject({ method: "POST", url: `/api/docs/documents/${foreignId}/send`, headers: { cookie: owner }, payload: {} });
    assert.strictEqual(send.statusCode, 404);
  } finally { await app.close(); }
});

test("docs-sign: read-only Auditor cannot record consent (sign) — 403, no fraudulent evidence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Owner sets up a document out for signature with one named (non-user-bound) signer.
    const created = await app.inject({ method: "POST", url: "/api/docs/documents", headers: { cookie: owner }, payload: { title: "Auditor must not sign this" } });
    const docId = created.json().document.id;
    await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/signers`, headers: { cookie: owner }, payload: { signerName: "Անանուն Ստորագրող" } });
    await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/send`, headers: { cookie: owner }, payload: {} });
    const full = (await app.inject({ method: "GET", url: `/api/docs/documents/${docId}`, headers: { cookie: owner } })).json();
    const signerId = full.document.signers[0].id;

    // Auditor (read-only) attempts to sign the named slot -> 403, document stays out-for-signature.
    const auditor = await login(app, "auditor@armosphera.local", DEFAULT_PASSWORD);
    const attempt = await app.inject({ method: "POST", url: `/api/docs/documents/${docId}/sign`, headers: { cookie: auditor }, payload: { signerId } });
    assert.strictEqual(attempt.statusCode, 403);
    const after = (await app.inject({ method: "GET", url: `/api/docs/documents/${docId}`, headers: { cookie: owner } })).json();
    assert.strictEqual(after.document.status, "out-for-signature");
    assert.strictEqual(after.document.signers[0].status, "pending", "no consent was recorded");
    assert.strictEqual(after.document.signers[0].checksum, "", "no evidence checksum was written");
  } finally { await app.close(); }
});

test("docs-sign: signature evidence ignores untrusted forwarded headers", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const { docId, signerId } = await createSentOneSignerDocument(app, owner);

    const signed = await app.inject({
      method: "POST",
      url: `/api/docs/documents/${docId}/sign`,
      remoteAddress: "203.0.113.88",
      headers: { cookie: owner, "cf-connecting-ip": "198.51.100.88" },
      payload: { signerId }
    });
    assert.strictEqual(signed.statusCode, 200, signed.body);

    const row = app.db.prepare("SELECT ip_address AS ipAddress FROM document_signers WHERE id = ?").get(signerId);
    assert.strictEqual(row.ipAddress, "203.0.113.88", "untrusted forwarded evidence is ignored");
  } finally { await app.close(); }
});

test("docs-sign: signature evidence uses trusted proxy client IP only when configured", async () => {
  const app = buildApp({
    dbPath: ":memory:",
    env: {
      ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1",
      ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "cf-connecting-ip"
    }
  });
  try {
    await app.ready();
    const owner = await login(app);
    const { docId, signerId } = await createSentOneSignerDocument(app, owner);

    const signed = await app.inject({
      method: "POST",
      url: `/api/docs/documents/${docId}/sign`,
      remoteAddress: "127.0.0.1",
      headers: { cookie: owner, "cf-connecting-ip": "198.51.100.89" },
      payload: { signerId }
    });
    assert.strictEqual(signed.statusCode, 200, signed.body);

    const row = app.db.prepare("SELECT ip_address AS ipAddress FROM document_signers WHERE id = ?").get(signerId);
    assert.strictEqual(row.ipAddress, "198.51.100.89", "trusted proxy consent evidence records the configured public client IP");
  } finally { await app.close(); }
});
