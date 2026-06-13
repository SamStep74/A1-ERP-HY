"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("forms: definition CRUD is auth-gated; public submit creates a CRM lead", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();

    // List is auth-gated -> 401
    const unauth = await app.inject({ method: "GET", url: "/api/forms" });
    assert.strictEqual(unauth.statusCode, 401);

    const owner = await login(app);
    const seeded = (await app.inject({ method: "GET", url: "/api/forms", headers: { cookie: owner } })).json();
    assert.ok(Array.isArray(seeded.forms) && seeded.forms.length >= 1, "seeded form present");
    assert.ok(seeded.forms.some(f => f.id === "form-lead-intake" && f.status === "published"), "seeded intake form is published");

    // Create a draft form
    const created = await app.inject({ method: "POST", url: "/api/forms", headers: { cookie: owner },
      payload: { title: "Ամրագրման հայտ", fields: [{ key: "contactName", label: "Անուն", type: "text", required: true }, { key: "email", label: "Email", type: "email", required: true }] } });
    assert.strictEqual(created.statusCode, 200);
    const formId = created.json().form.id;
    assert.strictEqual(created.json().form.status, "draft");
    assert.strictEqual(created.json().form.fields.length, 2);

    // Title too short -> 400
    const bad = await app.inject({ method: "POST", url: "/api/forms", headers: { cookie: owner }, payload: { title: "x" } });
    assert.strictEqual(bad.statusCode, 400);

    // A DRAFT form cannot be submitted publicly -> 404 (only published forms accept submissions)
    const draftSubmit = await app.inject({ method: "POST", url: `/api/forms/${formId}/submit`, payload: { contactName: "Test", email: "t@example.com" } });
    assert.strictEqual(draftSubmit.statusCode, 404);

    // Publish it
    const published = await app.inject({ method: "PATCH", url: `/api/forms/${formId}`, headers: { cookie: owner }, payload: { status: "published" } });
    assert.strictEqual(published.json().form.status, "published");

    // PUBLIC submit (NO cookie) to the seeded published intake form -> creates a lead
    const leadsBefore = (await app.inject({ method: "GET", url: "/api/crm/leads", headers: { cookie: owner } })).json();
    const beforeCount = (leadsBefore.leads || []).length;
    const submit = await app.inject({ method: "POST", url: "/api/forms/form-lead-intake/submit",
      payload: { companyName: "Մարդ ՍՊԸ", contactName: "Արամ Մարդյան", email: "aram@example.com", phone: "+374 99 112233", interest: "Հետաքրքրված եմ ամրագրման ավտոմատացմամբ" } });
    assert.strictEqual(submit.statusCode, 200);
    // Public response is minimal — must NOT leak lead/org internals
    assert.deepStrictEqual(submit.json(), { ok: true, received: true });

    // The lead now exists in CRM
    const leadsAfter = (await app.inject({ method: "GET", url: "/api/crm/leads", headers: { cookie: owner } })).json();
    assert.strictEqual((leadsAfter.leads || []).length, beforeCount + 1, "a CRM lead was created from the public submission");
    const publicLead = (leadsAfter.leads || []).find(l => l.email === "aram@example.com");
    assert.ok(publicLead, "lead carries the submitted email");
    assert.strictEqual(publicLead.createdByName || null, null, "public form lead is not attributed to a human owner");

    // The submission is recorded against the form, linked to the lead
    const formDetail = (await app.inject({ method: "GET", url: "/api/forms/form-lead-intake", headers: { cookie: owner } })).json();
    assert.ok(formDetail.form.submissions.length >= 1, "submission recorded");
    assert.ok(formDetail.form.submissions[0].leadId, "submission linked to a lead");
    assert.strictEqual(formDetail.form.submissions[0].data.email, "aram@example.com");

    const formAudit = app.db.prepare("SELECT user_id AS userId FROM audit_events WHERE type = 'forms.submission.received' ORDER BY rowid DESC LIMIT 1").get();
    assert.strictEqual(formAudit.userId, null, "public submission audit is not attributed to a human owner");
    const leadAudit = app.db.prepare("SELECT user_id AS userId FROM audit_events WHERE type = 'crm.lead.created' AND details LIKE ? ORDER BY rowid DESC LIMIT 1")
      .get(`%${publicLead.id}%`);
    assert.strictEqual(leadAudit.userId, null, "public lead audit is not attributed to a human owner");
    const leadEvent = app.db.prepare("SELECT actor_user_id AS actorUserId FROM suite_events WHERE event_type = 'crm.lead.created' AND subject_id = ? ORDER BY id DESC LIMIT 1")
      .get(publicLead.id);
    assert.strictEqual(leadEvent.actorUserId, null, "public lead timeline event is not attributed to a human owner");
  } finally { await app.close(); }
});

test("forms: write-gate (Auditor 403), key-whitelisting, and required-field enforcement on public submit", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Auditor cannot create forms -> 403
    const auditor = await login(app, "auditor@armosphera.local", DEFAULT_PASSWORD);
    const blocked = await app.inject({ method: "POST", url: "/api/forms", headers: { cookie: auditor }, payload: { title: "Should fail" } });
    assert.strictEqual(blocked.statusCode, 403);

    // Missing a required field on public submit -> 400 (seeded intake requires companyName/contactName/email/phone/interest)
    const missing = await app.inject({ method: "POST", url: "/api/forms/form-lead-intake/submit", payload: { contactName: "No Company" } });
    assert.strictEqual(missing.statusCode, 400);

    // Key-whitelisting: a public caller cannot inject undeclared keys into the stored submission.
    const ok = await app.inject({ method: "POST", url: "/api/forms/form-lead-intake/submit",
      payload: { companyName: "Բ ՍՊԸ", contactName: "Բ Անձ", email: "b@example.com", phone: "+374 99 000111", interest: "Հետաքրքրված եմ ձեր ծառայություններով", status: "qualified", org_id: "org-evil", evilKey: "x" } });
    assert.strictEqual(ok.statusCode, 200);
    const detail = (await app.inject({ method: "GET", url: "/api/forms/form-lead-intake", headers: { cookie: owner } })).json();
    const latest = detail.form.submissions[0].data;
    assert.strictEqual(latest.evilKey, undefined, "undeclared key was dropped");
    assert.strictEqual(latest.status, undefined, "injected status key was dropped");
    assert.strictEqual(latest.org_id, undefined, "injected org_id key was dropped");
  } finally { await app.close(); }
});

test("forms: rejects malformed metadata before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const counts = () => ({
      forms: app.db.prepare("SELECT COUNT(*) AS count FROM forms WHERE org_id = ?").get("org-armosphera-demo").count,
      submissions: app.db.prepare("SELECT COUNT(*) AS count FROM form_submissions WHERE org_id = ?").get("org-armosphera-demo").count,
      leads: app.db.prepare("SELECT COUNT(*) AS count FROM crm_leads WHERE org_id = ?").get("org-armosphera-demo").count,
      suiteEvents: app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE org_id = ? AND event_type = ?").get("org-armosphera-demo", "crm.lead.created").count,
      audits: app.db.prepare(`
        SELECT COUNT(*) AS count
        FROM audit_events
        WHERE org_id = ?
          AND type IN (?, ?, ?, ?)
      `).get(
        "org-armosphera-demo",
        "forms.form.created",
        "forms.form.updated",
        "forms.submission.received",
        "crm.lead.created"
      ).count
    });
    const rejected = async (method, url, payload, remoteAddress = "198.51.100.150") => {
      const response = await app.inject({ method, url, headers: { cookie: owner }, payload, remoteAddress });
      assert.strictEqual(response.statusCode, 400, response.body);
      assert.doesNotMatch(response.body, /secret-forms-/);
    };
    const rejectedJsonLiteral = async (method, url, literal, remoteAddress = "198.51.100.151") => {
      const response = await app.inject({
        method,
        url,
        headers: { cookie: owner, "content-type": "application/json" },
        payload: literal,
        remoteAddress
      });
      assert.strictEqual(response.statusCode, 400, response.body);
      assert.doesNotMatch(response.body, /secret-forms-/);
    };

    const beforeDefinitionRejects = counts();
    await rejectedJsonLiteral("POST", "/api/forms", "null");
    for (const payload of [
      ["secret-forms-create-array-token"],
      { title: { value: "Lead form", token: "secret-forms-title-object-token" } },
      { title: "Lead\nsecret-forms-title-control-token" },
      { title: `${"F".repeat(201)}secret-forms-title-long-token` },
      { title: "Valid form", description: { value: "Private intake", token: "secret-forms-description-object-token" } },
      { title: "Valid form", description: "Bad\nsecret-forms-description-control-token" },
      { title: "Valid form", status: { value: "published", token: "secret-forms-status-object-token" } },
      { title: "Valid form", status: "archived-secret-forms-status-token" },
      { title: "Valid form", fields: { key: "email", token: "secret-forms-fields-object-token" } },
      { title: "Valid form", fields: Array.from({ length: 51 }, (_, index) => ({ key: `field${index}`, label: `Field ${index}` })) },
      { title: "Valid form", fields: [{ key: "email", label: "Email" }, { key: "email", label: "Duplicate" }] },
      { title: "Valid form", fields: [{ key: "email-address", label: "Email" }] },
      { title: "Valid form", fields: [{ key: "email", label: "Bad\nsecret-forms-label-control-token" }] },
      { title: "Valid form", fields: [{ key: "email", label: "Email", type: "url-secret-forms-type-token" }] },
      { title: "Valid form", fields: [{ key: "email", label: "Email", required: "false" }] }
    ]) {
      await rejected("POST", "/api/forms", payload);
    }
    assert.deepStrictEqual(counts(), beforeDefinitionRejects);

    const created = await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: { cookie: owner },
      payload: {
        title: "Guarded lead form",
        status: "published",
        fields: [
          { key: "email", label: "Email", type: "email", required: true },
          { key: "message", label: "Message", type: "textarea", required: false }
        ]
      }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    const formId = created.json().form.id;
    const afterCreate = counts();

    const malformedDetailPath = await app.inject({
      method: "GET",
      url: `/api/forms/${formId}%0Asecret-forms-detail-path-token`,
      headers: { cookie: owner }
    });
    assert.strictEqual(malformedDetailPath.statusCode, 400, malformedDetailPath.body);
    assert.match(malformedDetailPath.body, /Invalid form id/);
    assert.doesNotMatch(malformedDetailPath.body, /secret-forms-detail-path-token/);
    assert.deepStrictEqual(counts(), afterCreate);

    const malformedPatchPath = await app.inject({
      method: "PATCH",
      url: `/api/forms/${formId}%0Asecret-forms-patch-path-token`,
      headers: { cookie: owner },
      payload: { title: "secret-forms-patch-path-body-token" }
    });
    assert.strictEqual(malformedPatchPath.statusCode, 400, malformedPatchPath.body);
    assert.match(malformedPatchPath.body, /Invalid form id/);
    assert.doesNotMatch(malformedPatchPath.body, /secret-forms-patch-path-token|secret-forms-patch-path-body-token/);
    assert.deepStrictEqual(counts(), afterCreate);

    const decodedMalformedDetailPath = await app.inject({
      method: "GET",
      url: `/api/forms/${formId}_secret-forms-detail-decoded-token`,
      headers: { cookie: owner }
    });
    assert.strictEqual(decodedMalformedDetailPath.statusCode, 400, decodedMalformedDetailPath.body);
    assert.match(decodedMalformedDetailPath.body, /Invalid form id/);
    assert.doesNotMatch(decodedMalformedDetailPath.body, /secret-forms-detail-decoded-token/);
    assert.deepStrictEqual(counts(), afterCreate);

    const decodedMalformedPatchPath = await app.inject({
      method: "PATCH",
      url: `/api/forms/${formId}_secret-forms-patch-decoded-token`,
      headers: { cookie: owner },
      payload: { title: "secret-forms-patch-decoded-body-token" }
    });
    assert.strictEqual(decodedMalformedPatchPath.statusCode, 400, decodedMalformedPatchPath.body);
    assert.match(decodedMalformedPatchPath.body, /Invalid form id/);
    assert.doesNotMatch(decodedMalformedPatchPath.body, /secret-forms-patch-decoded-/);
    assert.deepStrictEqual(counts(), afterCreate);

    const overlongPatchPath = await app.inject({
      method: "PATCH",
      url: `/api/forms/${"a".repeat(161)}secret-forms-patch-overlong-token`,
      headers: { cookie: owner },
      payload: { title: "secret-forms-patch-overlong-body-token" }
    });
    assert.ok([400, 404].includes(overlongPatchPath.statusCode), overlongPatchPath.body);
    assert.doesNotMatch(overlongPatchPath.body, /secret-forms-patch-overlong-/);
    if (overlongPatchPath.statusCode === 400) {
      assert.match(overlongPatchPath.body, /Invalid form id/);
    }
    assert.deepStrictEqual(counts(), afterCreate);

    const unknownSafeDetailPath = await app.inject({
      method: "GET",
      url: "/api/forms/form-unknown-safe",
      headers: { cookie: owner }
    });
    assert.strictEqual(unknownSafeDetailPath.statusCode, 404, unknownSafeDetailPath.body);
    assert.deepStrictEqual(counts(), afterCreate);

    await rejectedJsonLiteral("PATCH", `/api/forms/${formId}`, "[]");
    for (const payload of [
      ["secret-forms-patch-array-token"],
      { title: { value: "Patch", token: "secret-forms-patch-title-object-token" } },
      { description: "Bad\nsecret-forms-patch-description-control-token" },
      { status: "deleted-secret-forms-patch-status-token" },
      { fields: [{ key: "email", label: "Email", type: ["email"] }] },
      { fields: [{ key: "message", label: "Message", required: 1 }] }
    ]) {
      await rejected("PATCH", `/api/forms/${formId}`, payload);
    }
    assert.deepStrictEqual(counts(), afterCreate);

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/forms/${formId}`,
      headers: { cookie: owner },
      payload: { description: "", status: "published" }
    });
    assert.strictEqual(patched.statusCode, 200, patched.body);
    assert.strictEqual(patched.json().form.status, "published");

    const afterPatch = counts();
    const submitUrl = `/api/forms/${formId}/submit`;
    const malformedPath = await app.inject({
      method: "POST",
      url: `/api/forms/${formId}%0Asecret-forms-submit-path-token/submit`,
      payload: { email: "path-token@example.com" },
      remoteAddress: "198.51.100.159"
    });
    assert.strictEqual(malformedPath.statusCode, 400, malformedPath.body);
    assert.match(malformedPath.body, /Invalid form id/);
    assert.doesNotMatch(malformedPath.body, /secret-forms-submit-path-token/);
    assert.deepStrictEqual(counts(), afterPatch);

    await rejectedJsonLiteral("POST", submitUrl, "null", "198.51.100.160");
    let ipSuffix = 161;
    for (const payload of [
      ["secret-forms-submit-array-token"],
      { email: { value: "prospect@example.com", token: "secret-forms-submit-email-object-token" } },
      { email: "prospect@example.com\nsecret-forms-submit-email-control-token" },
      { email: `${"e".repeat(2001)}secret-forms-submit-email-long-token` },
      { email: "prospect@example.com", message: { value: "Private request", token: "secret-forms-submit-message-object-token" } },
      { email: "prospect@example.com", message: "Private\u0000secret-forms-submit-message-control-token" }
    ]) {
      await rejected("POST", submitUrl, payload, `198.51.100.${ipSuffix++}`);
    }
    assert.deepStrictEqual(counts(), afterPatch);

    const submitted = await app.inject({
      method: "POST",
      url: submitUrl,
      payload: {
        email: "guarded-form@example.com",
        message: "Valid public message\nafter malformed checks",
        evilKey: { token: "secret-forms-undeclared-object-token" }
      },
      remoteAddress: "198.51.100.180"
    });
    assert.strictEqual(submitted.statusCode, 200, submitted.body);
    const detail = (await app.inject({ method: "GET", url: `/api/forms/${formId}`, headers: { cookie: owner } })).json();
    assert.strictEqual(detail.form.submissions[0].data.email, "guarded-form@example.com");
    assert.strictEqual(detail.form.submissions[0].data.message, "Valid public message\nafter malformed checks");
    assert.strictEqual(detail.form.submissions[0].data.evilKey, undefined);
  } finally { await app.close(); }
});

test("forms: submission detail blocks non-campaign roles while preserving auditor read access", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const support = await login(app, "support@armosphera.local", DEFAULT_PASSWORD);
    const salesperson = await login(app, "sales@armosphera.local", DEFAULT_PASSWORD);
    const serviceManager = await login(app, "service.manager@armosphera.local", DEFAULT_PASSWORD);
    const auditor = await login(app, "auditor@armosphera.local", DEFAULT_PASSWORD);

    const created = await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: { cookie: owner },
      payload: {
        title: "Private intake",
        status: "published",
        fields: [
          { key: "email", label: "Email", type: "email", required: true },
          { key: "message", label: "Message", type: "textarea", required: false }
        ]
      }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    const formId = created.json().form.id;

    const submitted = await app.inject({
      method: "POST",
      url: `/api/forms/${formId}/submit`,
      payload: { email: "prospect@example.com", message: "private request" }
    });
    assert.strictEqual(submitted.statusCode, 200, submitted.body);

    const supportList = await app.inject({ method: "GET", url: "/api/forms", headers: { cookie: support } });
    assert.strictEqual(supportList.statusCode, 403, supportList.body);
    assert.ok(!supportList.body.includes("prospect@example.com"));
    assert.ok(!supportList.body.includes("private request"));

    const supportDetail = await app.inject({ method: "GET", url: `/api/forms/${formId}`, headers: { cookie: support } });
    assert.strictEqual(supportDetail.statusCode, 403, supportDetail.body);
    assert.ok(!supportDetail.body.includes("prospect@example.com"));
    assert.ok(!supportDetail.body.includes("private request"));

    const salesDetail = await app.inject({ method: "GET", url: `/api/forms/${formId}`, headers: { cookie: salesperson } });
    assert.strictEqual(salesDetail.statusCode, 200, salesDetail.body);
    assert.strictEqual(salesDetail.json().form.submissions[0].data.email, "prospect@example.com");
    assert.strictEqual(salesDetail.json().form.submissions[0].data.message, "private request");

    const managerList = await app.inject({ method: "GET", url: "/api/forms", headers: { cookie: serviceManager } });
    assert.strictEqual(managerList.statusCode, 200, managerList.body);
    assert.ok(managerList.json().forms.some(form => form.id === formId));
    const managerDetail = await app.inject({ method: "GET", url: `/api/forms/${formId}`, headers: { cookie: serviceManager } });
    assert.strictEqual(managerDetail.statusCode, 200, managerDetail.body);
    assert.strictEqual(managerDetail.json().form.submissions[0].data.email, "prospect@example.com");
    const managerCreated = await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: { cookie: serviceManager },
      payload: { title: "Manager authored intake", fields: [{ key: "email", label: "Email", type: "email", required: true }] }
    });
    assert.strictEqual(managerCreated.statusCode, 200, managerCreated.body);

    const auditorDetail = await app.inject({ method: "GET", url: `/api/forms/${formId}`, headers: { cookie: auditor } });
    assert.strictEqual(auditorDetail.statusCode, 200, auditorDetail.body);
    assert.strictEqual(auditorDetail.json().form.submissions[0].data.email, "prospect@example.com");
  } finally { await app.close(); }
});

test("forms: submitting an unknown form id -> 404", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/api/forms/form-does-not-exist/submit", payload: { email: "x@example.com" } });
    assert.strictEqual(res.statusCode, 404);
  } finally { await app.close(); }
});

test("forms: public submit is per-IP rate limited (429 after the burst), and other IPs are unaffected", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const url = "/api/forms/form-lead-intake/submit";
    const payload = { companyName: "Spam Co", contactName: "Flood", email: "flood@example.com", phone: "+374 99 000000", interest: "flooding" };
    const attacker = "203.0.113.7";

    // Hammer from one IP. The limiter allows a bounded burst then must reject with 429.
    let okCount = 0;
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({ method: "POST", url, payload, remoteAddress: attacker });
      if (res.statusCode === 200) okCount += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(okCount > 0, "some submissions should succeed before the limit");
    assert.ok(okCount <= 15, `burst should be bounded, got ${okCount} successes`);
    assert.ok(limited > 0, "excess submissions from one IP must be rejected with 429");

    // A DIFFERENT IP is not penalized by the attacker's flood (per-IP, not global).
    const other = await app.inject({ method: "POST", url, payload, remoteAddress: "198.51.100.42" });
    assert.strictEqual(other.statusCode, 200, "a fresh IP can still submit");
  } finally { await app.close(); }
});

test("forms: public submit throttles loopback tunnel traffic by default", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const url = "/api/forms/form-lead-intake/submit";
    const payload = { companyName: "Loopback Co", contactName: "Tunnel", email: "loopback@example.com", phone: "+374 99 101010", interest: "loopback tunnel" };

    let okCount = 0;
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({ method: "POST", url, payload, remoteAddress: "127.0.0.1" });
      if (res.statusCode === 200) okCount += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected loopback submit status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(okCount > 0, "some loopback submissions should succeed before the limit");
    assert.ok(okCount <= 15, `loopback burst should be bounded, got ${okCount} successes`);
    assert.ok(limited > 0, "loopback tunnel public submits must be throttled with 429");
  } finally { await app.close(); }
});

test("forms: trusted proxy client IPs are used for loopback public submit limits", async () => {
  const app = buildApp({
    dbPath: ":memory:",
    env: {
      ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1",
      ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "cf-connecting-ip"
    }
  });
  try {
    await app.ready();
    const url = "/api/forms/form-lead-intake/submit";
    const payload = { companyName: "Proxy Co", contactName: "Buyer", email: "proxy-buyer@example.com", phone: "+374 99 121212", interest: "proxy tunnel" };

    let okCount = 0;
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({
        method: "POST",
        url,
        payload,
        remoteAddress: "127.0.0.1",
        headers: { "cf-connecting-ip": "198.51.100.40" }
      });
      if (res.statusCode === 200) okCount += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected trusted-proxy submit status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(okCount > 0, "some proxied submissions should succeed before the limit");
    assert.ok(limited > 0, "one proxied public submit client is still throttled");

    for (let i = 0; i < 16; i++) {
      const res = await app.inject({
        method: "POST",
        url,
        payload,
        remoteAddress: "127.0.0.1",
        headers: { "cf-connecting-ip": `198.51.100.${i + 41}` }
      });
      assert.strictEqual(res.statusCode, 200, `proxied client ${i} should not inherit a global loopback submit bucket`);
    }
  } finally { await app.close(); }
});

test("forms: public submit evidence uses trusted proxy client IP only when configured", async () => {
  const untrusted = buildApp({ dbPath: ":memory:" });
  try {
    await untrusted.ready();
    const res = await untrusted.inject({
      method: "POST",
      url: "/api/forms/form-lead-intake/submit",
      payload: { companyName: "Spoof Form", contactName: "Visitor", email: "spoof-form@example.com", phone: "+374 99 343434", interest: "spoof evidence" },
      remoteAddress: "203.0.113.57",
      headers: { "cf-connecting-ip": "198.51.100.57" }
    });
    assert.strictEqual(res.statusCode, 200, res.body);
    const row = untrusted.db.prepare("SELECT submitter_ip AS submitterIp FROM form_submissions WHERE form_id = ? ORDER BY created_at DESC LIMIT 1").get("form-lead-intake");
    assert.strictEqual(row.submitterIp, "203.0.113.57", "untrusted forwarded form evidence is ignored");
  } finally { await untrusted.close(); }

  const trusted = buildApp({
    dbPath: ":memory:",
    env: {
      ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1",
      ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "cf-connecting-ip"
    }
  });
  try {
    await trusted.ready();
    const res = await trusted.inject({
      method: "POST",
      url: "/api/forms/form-lead-intake/submit",
      payload: { companyName: "Trusted Form", contactName: "Visitor", email: "trusted-form@example.com", phone: "+374 99 565656", interest: "trusted evidence" },
      remoteAddress: "127.0.0.1",
      headers: { "cf-connecting-ip": "198.51.100.58" }
    });
    assert.strictEqual(res.statusCode, 200, res.body);
    const row = trusted.db.prepare("SELECT submitter_ip AS submitterIp FROM form_submissions WHERE form_id = ? ORDER BY created_at DESC LIMIT 1").get("form-lead-intake");
    assert.strictEqual(row.submitterIp, "198.51.100.58", "trusted proxy form evidence records the configured public client IP");
  } finally { await trusted.close(); }
});
