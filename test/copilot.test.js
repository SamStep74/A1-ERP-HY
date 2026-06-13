"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Isolate AI settings to an empty tmp dir so getCopilotModelPolicy() (which now
// reads the local settings store) is deterministic regardless of any real
// ai-settings.json on the dev machine. node:test runs each file in its own process.
process.env.ARMOSPHERA_ONE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "aoc-copilot-data-"));

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

async function reviewSource(app, cookie, sourceId, title, note) {
  const urlById = {
    "law-tax-code": "https://www.arlis.am/hy/acts/224990?reviewed=2026-06-01",
    "law-personal-data": "https://www.arlis.am/DocumentView.aspx?docid=117034",
    "law-esign": "https://www.cba.am/EN/lalaws/Law_on_e_docs_and%20_e_signatures.pdf"
  };
  const res = await app.inject({
    method: "POST",
    url: `/api/legal/sources/${sourceId}/reviews`,
    headers: { cookie },
    payload: {
      title,
      sourceUrl: urlById[sourceId],
      effectiveDate: "2026-06-01",
      status: "active",
      reviewNote: note
    }
  });
  assert.strictEqual(res.statusCode, 200, res.body);
  return res.json().source;
}

test("copilot endpoint is auth-gated", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      payload: { intent: "vat", customerId: "cust-nare", periodKey: "2026-05", question: "Բացատրեք ԱԱՀ պատրաստությունը:" }
    });
    assert.strictEqual(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("copilot app entitlement is required before intent-specific access", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();

    const supportCookie = await login(app, "support@armosphera.local", DEFAULT_PASSWORD);
    const supportSuite = await app.inject({ method: "GET", url: "/api/suite", headers: { cookie: supportCookie } });
    assert.strictEqual(supportSuite.statusCode, 200, supportSuite.body);
    assert.strictEqual(supportSuite.json().apps.some(app => app.id === "copilot"), false);
    const supportPersonalData = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie: supportCookie },
      payload: { intent: "personal-data", customerId: "cust-nare", question: "Բացատրեք անձնական տվյալների հարցման ընթացքը:" }
    });
    assert.strictEqual(supportPersonalData.statusCode, 403);

    const lawyerCookie = await login(app, "lawyer@armosphera.local", DEFAULT_PASSWORD);
    const lawyerSuite = await app.inject({ method: "GET", url: "/api/suite", headers: { cookie: lawyerCookie } });
    assert.strictEqual(lawyerSuite.statusCode, 200, lawyerSuite.body);
    assert.strictEqual(lawyerSuite.json().apps.some(app => app.id === "copilot"), true);
    const lawyerVat = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie: lawyerCookie },
      payload: { intent: "vat", customerId: "cust-nare", periodKey: "2026-05", question: "Բացատրեք ԱԱՀ պատրաստությունը:" }
    });
    assert.strictEqual(lawyerVat.statusCode, 403);

    const lawyerEsign = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie: lawyerCookie },
      payload: { intent: "esign", documentId: "doc-anahit-nda", question: "Ստուգեք էլեկտրոնային ստորագրության ապացույցը:" }
    });
    assert.strictEqual(lawyerEsign.statusCode, 200, lawyerEsign.body);
    assert.strictEqual(lawyerEsign.json().copilot.intent, "esign");
  } finally {
    await app.close();
  }
});

test("VAT copilot returns cited legal/accounting guidance without creating SRC export", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const before = app.db.prepare("SELECT COUNT(*) AS count FROM finance_src_exports").get().count;

    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "vat",
        customerId: "cust-nare",
        periodKey: "2026-05",
        question: "Կարո՞ղ ենք պատրաստել հայկական ԱԱՀ եւ SRC ուղեցույց 2026-05 ժամանակաշրջանի համար:"
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const body = res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.copilot.intent, "vat");
    assert.strictEqual(body.copilot.advisoryOnly, true);
    assert.strictEqual(body.copilot.reviewRequired, true);
    assert.strictEqual(body.copilot.riskLevel, "legal");
    assert.deepStrictEqual(body.copilot.modelPolicy, {
      provider: "openrouter",
      model: "auto",
      language: "hy-AM",
      executionMode: "offline-deterministic",
      egress: "blocked-by-default"
    });
    assert.ok(body.copilot.answer.includes("Ներքին ԱԱՀ խորհրդատվության նախագիծ"));
    const taxCitation = body.copilot.citations.find(source => source.id === "law-tax-code");
    assert.ok(taxCitation);
    assert.strictEqual(taxCitation.sourceUrl, "https://www.arlis.am/hy/acts/224990");
    assert.strictEqual(taxCitation.effectiveDate, "2024-06-12");
    assert.ok(Object.hasOwn(taxCitation, "latestReview"));
    assert.ok(body.copilot.calculations.some(calc => calc.kind === "vat-report"));
    assert.ok(body.copilot.proposedActions.some(action => action.key === "finance.src.prepare" && action.mutates === true));

    const after = app.db.prepare("SELECT COUNT(*) AS count FROM finance_src_exports").get().count;
    assert.strictEqual(after, before, "copilot must not create SRC export packets");
  } finally {
    await app.close();
  }
});

test("copilot advisory generation records metadata-only timeline and audit events", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const question = "Կարո՞ղ ենք պատրաստել հայկական ԱԱՀ եւ SRC ուղեցույց 2026-05 ժամանակաշրջանի համար:";

    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "vat",
        customerId: "cust-nare",
        periodKey: "2026-05",
        question
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const body = res.json();
    assert.ok(body.events.some(event => (
      event.eventType === "copilot.advisory.generated"
      && event.subjectId === body.copilot.id
      && event.customerId === "cust-nare"
      && event.status === "needs-review"
    )));
    const timeline = app.db.prepare("SELECT * FROM suite_events WHERE event_type = ? ORDER BY id DESC LIMIT 1").get("copilot.advisory.generated");
    assert.ok(timeline);
    const timelinePayload = JSON.parse(timeline.payload);
    assert.strictEqual(timelinePayload.copilotId, body.copilot.id);
    assert.strictEqual(timelinePayload.intent, "vat");
    assert.deepStrictEqual(timelinePayload.sourceIds, ["law-tax-code"]);
    assert.deepStrictEqual(timelinePayload.proposedActionKeys, ["finance.src.prepare"]);
    assert.strictEqual(timelinePayload.questionLength, question.length);
    assert.ok(/^[a-f0-9]{64}$/.test(timelinePayload.questionHash));
    assert.ok(!JSON.stringify(timelinePayload).includes(question), "timeline payload should not store raw question text");
    assert.ok(!JSON.stringify(timelinePayload).includes(body.copilot.answer), "timeline payload should not store answer text");

    const audit = await app.inject({ method: "GET", url: "/api/audit", headers: { cookie } });
    assert.strictEqual(audit.statusCode, 200, audit.body);
    const auditEvent = audit.json().events.find(event => event.type === "copilot.advisory.generated");
    assert.ok(auditEvent);
    assert.strictEqual(auditEvent.details.copilotId, body.copilot.id);
    assert.strictEqual(auditEvent.details.modelPolicy.model, "auto");
    assert.ok(!JSON.stringify(auditEvent.details).includes(question), "audit details should not store raw question text");
    assert.ok(!JSON.stringify(auditEvent.details).includes(body.copilot.answer), "audit details should not store answer text");
  } finally {
    await app.close();
  }
});

test("copilot rejects malformed metadata before advisory persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const beforeTimeline = app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE event_type = ?").get("copilot.advisory.generated").count;
    const beforeAudit = app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE type = ?").get("copilot.advisory.generated").count;
    const validQuestion = "Կարո՞ղ ենք պատրաստել հայկական ԱԱՀ եւ SRC ուղեցույց 2026-05 ժամանակաշրջանի համար:";
    const malformedPayloads = [
      [],
      { question: { text: validQuestion }, intent: "vat" },
      { question: "bad\u0000question", intent: "vat" },
      { question: "x".repeat(2001), intent: "vat" },
      { question: validQuestion, intent: { value: "vat" } },
      { question: validQuestion, intent: "vat\u0000" },
      { question: validQuestion, intent: "x".repeat(81) },
      { question: validQuestion, intent: "vat", customerId: { id: "cust-nare" } },
      { question: validQuestion, intent: "vat", customerId: "cust-nare\u0000" },
      { question: validQuestion, intent: "vat", periodKey: "2026-13" },
      { question: validQuestion, intent: "payroll", gross: { amount: 600000 } },
      { question: validQuestion, intent: "payroll", gross: "600000\u0000" },
      { question: validQuestion, intent: "payroll", gross: "1e6" },
      { question: validQuestion, intent: "payroll", gross: -1 },
      { question: validQuestion, intent: "payroll", asOf: "2026-02-31" },
      { question: validQuestion, intent: "esign", documentId: { id: "doc-anahit-nda" } },
      { question: validQuestion, intent: "esign", documentId: "doc-anahit-nda\u0000" }
    ];

    for (const payload of malformedPayloads) {
      const res = await app.inject({
        method: "POST",
        url: "/api/copilot/questions",
        headers: { cookie },
        payload
      });
      assert.strictEqual(res.statusCode, 400, res.body);
      assert.match(res.body, /safe metadata|Copilot question is required/);
      assert.doesNotMatch(res.body, /cust-nare|doc-anahit-nda|600000/);
    }

    assert.strictEqual(
      app.db.prepare("SELECT COUNT(*) AS count FROM suite_events WHERE event_type = ?").get("copilot.advisory.generated").count,
      beforeTimeline
    );
    assert.strictEqual(
      app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE type = ?").get("copilot.advisory.generated").count,
      beforeAudit
    );

    const valid = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "vat",
        customerId: "cust-nare",
        periodKey: "2026-05",
        question: validQuestion
      }
    });
    assert.strictEqual(valid.statusCode, 200, valid.body);
    assert.strictEqual(valid.json().copilot.intent, "vat");
  } finally {
    await app.close();
  }
});

test("VAT copilot enables SRC proposal only after professional VAT source review", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const accountantCookie = await login(app, "accountant@armosphera.local", DEFAULT_PASSWORD);

    await reviewSource(
      app,
      cookie,
      "law-tax-code",
      "ՀՀ Հարկային օրենսգիրք հոդված 63 ԱԱՀ դրույքաչափ - owner maintained",
      "Owner maintained the source metadata, but this is not accountant signoff."
    );
    const ownerOnly = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "vat",
        customerId: "cust-nare",
        periodKey: "2026-05",
        question: "Պատրաստեք ներքին ԱԱՀ ուղեցույց եւ ցույց տվեք հաջորդ SRC փաթեթի քայլը:"
      }
    });
    assert.strictEqual(ownerOnly.statusCode, 200, ownerOnly.body);
    const ownerOnlyAction = ownerOnly.json().copilot.proposedActions.find(item => item.key === "finance.src.prepare");
    const ownerOnlyCitation = ownerOnly.json().copilot.citations.find(item => item.id === "law-tax-code");
    assert.ok(ownerOnlyAction.disabledReason, "owner-only source maintenance must not unlock SRC preparation");
    assert.strictEqual(ownerOnlyCitation.professionalReviewReady, false);
    assert.strictEqual(ownerOnlyCitation.latestReview.reviewedByRole, "Owner");
    assert.strictEqual(ownerOnlyCitation.sourceUrl, "https://www.arlis.am/hy/acts/224990?reviewed=2026-06-01");
    assert.strictEqual(ownerOnlyCitation.latestReview.sourceUrl, ownerOnlyCitation.sourceUrl);
    assert.strictEqual(ownerOnlyCitation.latestReview.effectiveDate, "2026-06-01");
    assert.match(ownerOnlyCitation.latestReview.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    await reviewSource(
      app,
      accountantCookie,
      "law-tax-code",
      "ՀՀ Հարկային օրենսգիրք հոդված 63 ԱԱՀ դրույքաչափ - հաշվապահի կողմից վերանայված",
      "Հաշվապահը հաստատեց, որ աղբյուրը ակտիվ է Copilot-ի ԱԱՀ ուղեցույցի համար:"
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "vat",
        customerId: "cust-nare",
        periodKey: "2026-05",
        question: "Պատրաստեք ներքին ԱԱՀ ուղեցույց եւ ցույց տվեք հաջորդ SRC փաթեթի քայլը:"
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const action = res.json().copilot.proposedActions.find(item => item.key === "finance.src.prepare");
    const citation = res.json().copilot.citations.find(item => item.id === "law-tax-code");
    assert.ok(action);
    assert.strictEqual(action.disabledReason, "");
    assert.deepStrictEqual(action.payload.periodKey, "2026-05");
    assert.strictEqual(citation.professionalReviewReady, true);
    assert.strictEqual(citation.sourceUrl, "https://www.arlis.am/hy/acts/224990?reviewed=2026-06-01");
    assert.strictEqual(citation.latestReview.sourceUrl, citation.sourceUrl);
    assert.strictEqual(citation.latestReview.effectiveDate, "2026-06-01");
    assert.match(citation.latestReview.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.strictEqual(citation.latestReview.reviewedByRole, "Accountant");
    assert.strictEqual(citation.latestReview.reviewedByName, "HayHashvapah Accountant");
  } finally {
    await app.close();
  }
});

test("personal-data delete copilot proposes retention assessment, not deletion", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const beforeRequests = app.db.prepare("SELECT COUNT(*) AS count FROM privacy_requests").get().count;
    const beforeAssessments = app.db.prepare("SELECT COUNT(*) AS count FROM privacy_retention_assessments").get().count;

    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "personal-data",
        customerId: "cust-ani",
        question: "Հաճախորդը խնդրում է ջնջել անձնական տվյալները: Ո՞րն է անվտանգ հայկական իրավական հոսքը:"
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const copilot = res.json().copilot;
    assert.strictEqual(copilot.intent, "personal-data");
    const citation = copilot.citations.find(source => source.id === "law-personal-data");
    assert.ok(citation);
    assert.match(citation.sourceUrl, /^https?:\/\//);
    assert.match(citation.effectiveDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Object.hasOwn(citation, "latestReview"));
    assert.ok(/պահպան/i.test(copilot.answer));
    assert.ok(copilot.guardrails.some(text => /չի կատարվում/i.test(text)));
    assert.ok(copilot.proposedActions.some(action => action.key === "privacy.request.prepare" && action.payload.requestType === "delete"));
    assert.strictEqual(app.db.prepare("SELECT COUNT(*) AS count FROM privacy_requests").get().count, beforeRequests);
    assert.strictEqual(app.db.prepare("SELECT COUNT(*) AS count FROM privacy_retention_assessments").get().count, beforeAssessments);
  } finally {
    await app.close();
  }
});

test("e-sign copilot cites signature source and includes document evidence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "esign",
        documentId: "doc-anahit-nda",
        question: "Կարո՞ղ ենք ներքին օգտագործման համար հիմնվել այս NDA ստորագրության ապացույցի վրա:"
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const copilot = res.json().copilot;
    assert.strictEqual(copilot.intent, "esign");
    const citation = copilot.citations.find(source => source.id === "law-esign");
    assert.ok(citation);
    assert.match(citation.sourceUrl, /^https?:\/\//);
    assert.match(citation.effectiveDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Object.hasOwn(citation, "latestReview"));
    assert.strictEqual(copilot.context.document.id, "doc-anahit-nda");
    assert.ok(Array.isArray(copilot.context.document.signers));
    assert.ok(copilot.proposedActions.some(action => action.key === "docs.export.open" && action.path.includes("/api/docs/documents/doc-anahit-nda/export")));
  } finally {
    await app.close();
  }
});

test("payroll copilot previews calculation without posting payroll run", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const before = app.db.prepare("SELECT COUNT(*) AS count FROM payroll_runs").get().count;
    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "payroll",
        gross: 600000,
        asOf: "2026-05-28",
        question: "Նախադիտեք հայկական աշխատավարձի պահումները 600000 AMD համախառն աշխատավարձի համար:"
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const copilot = res.json().copilot;
    assert.strictEqual(copilot.intent, "payroll");
    assert.deepStrictEqual(copilot.citations, []);
    assert.ok(copilot.calculations.some(calc => calc.kind === "payroll-preview" && calc.outputs.net === 436500));
    assert.ok(copilot.proposedActions.some(action => action.key === "payroll.run.prepare" && action.mutates === true));
    assert.strictEqual(app.db.prepare("SELECT COUNT(*) AS count FROM payroll_runs").get().count, before);
  } finally {
    await app.close();
  }
});

test("month-close copilot previews trial balance and VAT without closing the period", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const before = app.db.prepare("SELECT status, closed_at AS closedAt FROM finance_periods WHERE period_key = ?").get("2026-05");
    assert.ok(before, "seeded open period exists");

    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "month-close",
        periodKey: "2026-05",
        question: "Ամսվա փակման համար ցույց տվեք փորձնական հաշվեկշիռը եւ ԱԱՀ ռիսկերը:"
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const copilot = res.json().copilot;
    assert.strictEqual(copilot.intent, "month-close");
    assert.ok(copilot.answer.includes("Ներքին ամսվա փակման ուղեցույց"));
    const citation = copilot.citations.find(source => source.id === "law-tax-code");
    assert.ok(citation);
    assert.match(citation.sourceUrl, /^https?:\/\//);
    assert.match(citation.effectiveDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Object.hasOwn(citation, "latestReview"));
    assert.ok(copilot.calculations.some(calc => calc.kind === "trial-balance"));
    assert.ok(copilot.calculations.some(calc => calc.kind === "vat-report"));
    assert.ok(copilot.proposedActions.some(action => action.key === "finance.period.close.prepare" && action.mutates === true));
    assert.ok(copilot.guardrails.some(text => /չի փակում/i.test(text)));

    const after = app.db.prepare("SELECT status, closed_at AS closedAt FROM finance_periods WHERE period_key = ?").get("2026-05");
    assert.deepStrictEqual(after, before, "copilot must not close finance periods");
  } finally {
    await app.close();
  }
});

test("copilot enforces app access for finance intents", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const supportCookie = await login(app, "support@armosphera.local", DEFAULT_PASSWORD);
    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie: supportCookie },
      payload: { intent: "vat", customerId: "cust-nare", periodKey: "2026-05", question: "Բացատրեք ԱԱՀ պատրաստությունը:" }
    });
    assert.strictEqual(res.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("copilot requires the Copilot app assignment even when the intent app is enabled", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    app.db.prepare(`
      UPDATE app_assignments
      SET enabled = 0
      WHERE role = ? AND app_id = ?
    `).run("Accountant", "copilot");

    const accountantCookie = await login(app, "accountant@armosphera.local", DEFAULT_PASSWORD);
    const suite = await app.inject({ method: "GET", url: "/api/suite", headers: { cookie: accountantCookie } });
    assert.strictEqual(suite.statusCode, 200, suite.body);
    const apps = suite.json().apps.map(item => item.id);
    assert.ok(apps.includes("finance"));
    assert.ok(!apps.includes("copilot"));

    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie: accountantCookie },
      payload: { intent: "vat", customerId: "cust-nare", periodKey: "2026-05", question: "Բացատրեք ԱԱՀ պատրաստությունը:" }
    });
    assert.strictEqual(res.statusCode, 403);
  } finally {
    await app.close();
  }
});

test("copilot returns 404 for unknown customer or document", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const badCustomer = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: { intent: "vat", customerId: "cust-nope", question: "Բացատրեք ԱԱՀ:" }
    });
    assert.strictEqual(badCustomer.statusCode, 404);

    const badDoc = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: { intent: "esign", documentId: "doc-nope", question: "Վերանայեք ստորագրության ապացույցը:" }
    });
    assert.strictEqual(badDoc.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("Open Notebook supplemental sources are opt-in: empty when off, merged when on, never moving the legal gate", async () => {
  const config = require("../server/config");
  const settingsStore = require("../server/settingsStore");
  const realFetch = config.safeFetch;
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app); // Owner

    // Make the VAT legal source review-ready so the answer is a normal "draft"
    // (not blocked) — this proves supplemental doesn't alter a non-blocked gate either.
    await reviewSource(app, cookie, "law-tax-code", "ՀՀ հարկային օրենսգիրք — ԱԱՀ", "Տարեկան վերանայում");

    const ask = () => app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: { intent: "vat", customerId: "cust-nare", periodKey: "2026-05", question: "Բացատրեք ԱԱՀ ուղեցույցը 2026-05 ժամանակաշրջանի համար մանրամասն:" }
    });

    // OFF by default → no supplemental sources, no Open Notebook note in the answer.
    const off = (await ask()).json().copilot;
    assert.deepStrictEqual(off.supplementalSources, []);
    assert.ok(!off.answer.includes("Open Notebook"));

    // Enable Open Notebook and stub the egress fetch with canned hits (one
    // duplicate URL + one lower-scored row to exercise dedupe + ordering).
    settingsStore.updateSettings({ openNotebook: { enabled: true, baseUrl: "https://nb.a1.am", apiKey: "on-key" } });
    config.safeFetch = async () => ({
      ok: true,
      json: async () => ({ results: [
        { title: "Պրակտիկ նշում", content: "ԱԱՀ ժամկետների գործնական քննարկում:", score: 0.82, url: "https://nb.a1.am/n/7" },
        { title: "Կրկնօրինակ", content: "նույն աղբյուրը", score: 0.40, url: "https://nb.a1.am/n/7" },
        { title: "Բլոգ", content: "լրացուցիչ համատեքստ", score: 0.55, url: "https://nb.a1.am/n/9" }
      ] })
    });

    const on = (await ask()).json().copilot;
    // Supplemental merged + clearly labeled
    assert.ok(on.supplementalSources.length >= 1, "supplemental merged when enabled");
    assert.ok(on.supplementalSources.every(s => s.origin === "open-notebook" && s.advisory === true));
    // Dedupe by URL collapsed the duplicate → 2 unique, highest score first
    assert.strictEqual(on.supplementalSources.length, 2);
    assert.strictEqual(on.supplementalSources[0].title, "Պրակտիկ նշում");
    assert.ok(on.answer.includes("Open Notebook"), "answer carries the opt-in supplemental note");

    // The compliance-critical surfaces are identical with and without supplemental.
    assert.strictEqual(on.status, off.status);
    assert.strictEqual(on.confidence, off.confidence);
    assert.deepStrictEqual(on.citations, off.citations);
  } finally {
    config.safeFetch = realFetch;
    settingsStore.updateSettings({ openNotebook: { enabled: false, baseUrl: "", apiKey: "" } });
    await app.close();
  }
});
