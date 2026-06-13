# Armenian Legal And Accounting Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the first shippable A1 Suite copilot slice: an Armenian-first, citation-required legal and accounting assistant that answers VAT, payroll, personal-data, e-signature, and month-close questions from existing A1 Suite data without mutating business records. The configured target model policy is `COPILOT_PROVIDER=gemini`, `COPILOT_MODEL=gemini-3.5-flash`, `COPILOT_LANGUAGE=hy-AM`; tests and local preview keep execution deterministic and outbound network disabled.

**Architecture:** Add a read-only `POST /api/copilot/questions` endpoint that gathers existing domain context from Fastify/SQLite, then delegates answer shaping to a small pure `server/copilot.js` module. The React app gets one focused Copilot panel mounted in the existing workspace data-presence model. The copilot returns Armenian-first structured answers, Gemini 3.5 Flash model policy metadata, citations, calculations, guardrails, and proposed actions; it does not execute SRC exports, privacy packets, document signing, payroll, or period close actions.

**Tech Stack:** Node 22, Fastify 5, `node:sqlite` `DatabaseSync`, existing `server/rag.js` BM25/hybrid legal retrieval, existing `server/ledger.js` / `server/payroll.js` / `server/accounting.js`, React + Vite, `node:test`, Browser plugin or Playwright for local UI proof.

---

## Baseline And Operating Rules

- Repo: `/Users/samvelstepanyan/dev/A1-Suite-Local`
- Remote: `git@github.com:SamStep74/A1-Suite-Local.git`
- Planning-time branch state after repo refresh: `main` was clean and synced with `origin/main` at `c26af65` (`docs: mark docs-templates done; 271 tests, 34 tags`).
- Keep work on `main` unless the user explicitly asks for a feature branch. This repo has been shipping direct checkpoint commits.
- Use path-scoped git adds only. Example: `git add server/copilot.js server/app.js test/copilot.test.js`.
- Push every completed task commit to GitHub: `git push origin main`.
- Do not enable outbound network for the product. Keep `ARMOSPHERA_ONE_ALLOW_EGRESS=0` in dev validation unless a test explicitly verifies egress blocking.
- Legal/tax answers are internal draft guidance. Every VAT, privacy, e-signature, or legal-source answer must include `reviewRequired: true` and at least one cited legal source.
- User-facing copilot docs, API assertions, and UI copy are Armenian-first (`hy-AM`). English remains only as stable product/API terms where useful, such as `SRC`, `Copilot`, and model identifiers.
- The copilot may write audit events only if the implementation chooses to log advisory use. It must not create finance SRC exports, privacy requests, retention assessments, documents, signers, payroll runs, workflow approvals, or workflow runs.

## Research Inputs To Preserve In The Product Direction

- ChatGPT share: `https://chatgpt.com/share/6a1d09b3-ce98-83eb-bfa2-46671dcc4a2c`
- Embedding model direction: `Metric-AI/armenian-text-embeddings-2-base` for phone/local constrained use; `Metric-AI/armenian-text-embeddings-2-large` for Mac/server indexing.
- Practical retrieval rule from the share: use Armenian embeddings for semantic search, not full LLM training; prefix query/document text consistently when embedding; keep BM25 as fallback.
- A1 Suite already has `server/rag.js` with BM25 and optional local embedding via `config.safeFetch`.
- A1 Suite already has source governance around `legal_sources`, `legal_source_reviews`, `legal_questions`, `finance_src_exports`, `privacy_export_packets`, `privacy_retention_assessments`, and Docs & Sign evidence.

## OPPO Remote-Control Availability Protocol

The Codex control plane itself can still expire, the Mac can sleep, and the LAN can change. The durable target is: every implementation checkpoint is recoverable from GitHub and every live preview can be reached from the OPPO phone while the Mac is awake.

- After each task commit, run:

```bash
git status --short --branch
git push origin main
```

- Keep the dev server phone-reachable during UI validation:

```bash
cd /Users/samvelstepanyan/dev/A1-Suite-Local
PORT=4178 HOST=0.0.0.0 ARMOSPHERA_ONE_DB=/tmp/a1-suite-copilot.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 node server/index.js
```

- From the OPPO phone, use the Mac LAN IP and port. Generate the exact URL on the Mac with:

```bash
MAC_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
printf 'http://%s:4178/\n' "$MAC_IP"
```

- If OPPO Wi-Fi ADB is needed later, start from the remembered OPPO IP `192.168.0.178`, then verify live state with:

```bash
adb devices -l
```

- At any pause or handoff, update `HANDOFF.md` with: latest commit SHA, pushed status, test commands and results, live URL/port, and next unchecked task from this plan.

## File Structure

- Create `test/copilot.test.js`
  - Focused API contract tests for auth, response shape, citations, calculations, proposed actions, role/app access, and mutation safety.
- Create `server/copilot.js`
  - Pure deterministic answer shaper. No DB connection, no Fastify request object, no network. It receives normalized context and returns a structured copilot packet.
- Modify `server/app.js`
  - Register `POST /api/copilot/questions`.
  - Validate input, enforce auth/app access, gather customer/legal/finance/payroll/docs/privacy context, call `server/copilot.js`, and return `{ ok: true, copilot }`.
  - Keep helper functions close to existing legal/accounting helpers.
- Create `web/src/copilot.jsx`
  - Copilot panel with question textarea, intent selector, optional customer/period/document/employee controls, response viewer, citations, calculations, guardrails, and proposed action preview.
- Modify `web/src/main.jsx`
  - Import `CopilotPanel`, fetch enough context from existing loaded state, wire `askCopilot`, render the panel in the workspace.
- Modify `web/src/styles.css`
  - Compact, operational styling for the Copilot panel, avoiding decorative/marketing layout.
- Modify `HANDOFF.md`
  - Record the new feature status, tests, and OPPO remote-control runbook after implementation.

## API Contract

Request:

```json
{
  "question": "Can we prepare May 2026 VAT/SRC guidance for cust-nare?",
  "intent": "vat",
  "customerId": "cust-nare",
  "periodKey": "2026-05",
  "employeeId": "",
  "documentId": "",
  "mode": "draft"
}
```

Response:

```json
{
  "ok": true,
  "copilot": {
    "id": "copilot-...",
    "intent": "vat",
    "status": "draft",
    "answer": "Internal draft guidance...",
    "confidence": 90,
    "riskLevel": "legal",
    "reviewRequired": true,
    "advisoryOnly": true,
    "citations": [
      {
        "id": "law-tax-code",
        "title": "RA Tax Code Article 63 VAT rate",
        "status": "needs-accountant-review",
        "effectiveDate": "2024-06-12",
        "sourceUrl": "https://www.arlis.am/hy/acts/224990",
        "excerpt": "Use the Armenian tax-code VAT source as a legal anchor...",
        "relevance": 96
      }
    ],
    "calculations": [
      {
        "kind": "vat-report",
        "label": "VAT report for 2026-05",
        "inputs": { "periodKey": "2026-05" },
        "outputs": { "outputVat": 200, "inputVat": 100, "netVatPayable": 100 }
      }
    ],
    "context": {
      "customer": { "id": "cust-nare", "name": "Nare Clinic" },
      "periodKey": "2026-05"
    },
    "proposedActions": [
      {
        "key": "finance.src.prepare",
        "label": "Prepare SRC export packet after VAT source review",
        "method": "POST",
        "path": "/api/finance/src-exports",
        "payload": { "periodKey": "2026-05", "note": "Prepared from copilot VAT guidance" },
        "requiresApproval": true,
        "mutates": true,
        "disabledReason": "VAT legal source is not active yet"
      }
    ],
    "guardrails": [
      "No SRC submission is performed by this response.",
      "Accountant/legal review is required before customer-facing use."
    ],
    "createdAt": "2026-06-01T00:00:00.000Z"
  }
}
```

## Intent Rules

- `vat`
  - Requires `finance` app access.
  - Cites `law-tax-code`.
  - Includes `ledger.vatReport(db, orgId, periodKey)`.
  - Proposes `POST /api/finance/src-exports`; disables it until `law-tax-code.status === "active"`.
- `payroll`
  - Requires `finance` app access.
  - Uses `payroll.calculatePayroll(gross, { config: resolvePayrollConfig(...) })`.
  - If `employeeId` is supplied, use that employee's `grossSalary`; otherwise allow a numeric `gross` body field.
  - Proposes payroll run but never posts it.
- `personal-data`
  - Requires `crm` app access because it reads customer data.
  - Cites `law-personal-data`.
  - For delete questions, recommends a retention assessment path and states deletion is not automatic.
  - Proposes `POST /api/privacy/requests` with `requestType: "export"` or `"delete"`; disables it until the legal source is active.
- `esign`
  - Requires `docs` app access.
  - Cites `law-esign`.
  - If `documentId` is supplied, includes signer status and checksums from `getDocument`.
  - Proposes opening `/api/docs/documents/:id/export` for evidence review when a document exists.
- `month-close`
  - Requires `finance` app access.
  - Includes trial balance, current period status, and VAT report.
  - Proposes period close only as a guarded action preview.

## Task 1: Write RED API Tests

**Files:**
- Create: `test/copilot.test.js`
- Read: `test/api.test.js`
- Read: `test/legal-grounding.test.js`
- Read: `test/docs-export.test.js`

- [x] **Step 1: Create the focused test file**

Create `test/copilot.test.js` with this structure:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

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
      payload: { intent: "vat", customerId: "cust-nare", periodKey: "2026-05", question: "Explain VAT readiness." }
    });
    assert.strictEqual(res.statusCode, 401);
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
        question: "Can we prepare Armenian VAT and SRC guidance for the May 2026 period?"
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const body = res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.copilot.intent, "vat");
    assert.strictEqual(body.copilot.advisoryOnly, true);
    assert.strictEqual(body.copilot.reviewRequired, true);
    assert.strictEqual(body.copilot.riskLevel, "legal");
    assert.ok(body.copilot.answer.includes("VAT") || body.copilot.answer.includes("ԱԱՀ"));
    assert.ok(body.copilot.citations.some(source => source.id === "law-tax-code"));
    assert.ok(body.copilot.calculations.some(calc => calc.kind === "vat-report"));
    assert.ok(body.copilot.proposedActions.some(action => action.key === "finance.src.prepare" && action.mutates === true));

    const after = app.db.prepare("SELECT COUNT(*) AS count FROM finance_src_exports").get().count;
    assert.strictEqual(after, before, "copilot must not create SRC export packets");
  } finally {
    await app.close();
  }
});

test("VAT copilot enables SRC proposal only after VAT source review", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    await reviewSource(
      app,
      cookie,
      "law-tax-code",
      "RA Tax Code Article 63 VAT rate - accountant reviewed",
      "Accountant confirmed this source is active for copilot VAT guidance."
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: {
        intent: "vat",
        customerId: "cust-nare",
        periodKey: "2026-05",
        question: "Prepare internal VAT guidance and show the next SRC packet action."
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const action = res.json().copilot.proposedActions.find(item => item.key === "finance.src.prepare");
    assert.ok(action);
    assert.strictEqual(action.disabledReason, "");
    assert.deepStrictEqual(action.payload.periodKey, "2026-05");
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
        question: "Customer asks us to delete personal data. What is the safe Armenian-law workflow?"
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const copilot = res.json().copilot;
    assert.strictEqual(copilot.intent, "personal-data");
    assert.ok(copilot.citations.some(source => source.id === "law-personal-data"));
    assert.ok(/retention|պահպան/i.test(copilot.answer));
    assert.ok(copilot.guardrails.some(text => /not.*automatic|not executed automatically|չի կատարվում/i.test(text)));
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
        question: "Can we rely on this NDA signature evidence internally?"
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const copilot = res.json().copilot;
    assert.strictEqual(copilot.intent, "esign");
    assert.ok(copilot.citations.some(source => source.id === "law-esign"));
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
        question: "Preview Armenian payroll deductions for 600000 AMD gross salary."
      }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const copilot = res.json().copilot;
    assert.strictEqual(copilot.intent, "payroll");
    assert.ok(copilot.calculations.some(calc => calc.kind === "payroll-preview" && calc.outputs.net === 436500));
    assert.ok(copilot.proposedActions.some(action => action.key === "payroll.run.prepare" && action.mutates === true));
    assert.strictEqual(app.db.prepare("SELECT COUNT(*) AS count FROM payroll_runs").get().count, before);
  } finally {
    await app.close();
  }
});
```

- [x] **Step 2: Run the RED tests**

Run:

```bash
node --test test/copilot.test.js
```

Expected: FAIL with `404` for `/api/copilot/questions` or `Cannot find module '../server/copilot'` after the test file exists.

- [x] **Step 3: Commit RED tests**

```bash
git add test/copilot.test.js
git commit -m "test(copilot): define Armenian legal accounting copilot contract"
git push origin main
```

## Task 2: Add The Pure Copilot Engine

**Files:**
- Create: `server/copilot.js`
- Test: `test/copilot.test.js`

- [x] **Step 1: Create `server/copilot.js`**

Implement these exports:

```js
"use strict";

const INTENTS = ["vat", "payroll", "personal-data", "esign", "month-close"];

function normalizeIntent(value, question) {
  const raw = String(value || "").trim();
  if (INTENTS.includes(raw)) return raw;
  const text = String(question || "").toLowerCase();
  if (/(vat|src|tax|invoice|ԱԱՀ|հարկ)/i.test(text)) return "vat";
  if (/(payroll|salary|gross|net|աշխատավարձ|պահում)/i.test(text)) return "payroll";
  if (/(personal[-\s]?data|privacy|delete|export|consent|տվյալ|համաձայն)/i.test(text)) return "personal-data";
  if (/(esign|signature|signed|document|contract|ստորագր)/i.test(text)) return "esign";
  if (/(month|close|period|trial balance|փակում)/i.test(text)) return "month-close";
  return "vat";
}

function requiredAppForIntent(intent) {
  if (intent === "esign") return "docs";
  return intent === "personal-data" ? "crm" : "finance";
}

function buildCopilotPacket(input) {
  const now = input.now || new Date().toISOString();
  const intent = normalizeIntent(input.intent, input.question);
  const citations = Array.isArray(input.citations) ? input.citations : [];
  const calculations = Array.isArray(input.calculations) ? input.calculations : [];
  const context = input.context || {};
  const legal = citations.filter(source => /^law-/.test(source.id || ""));
  const sourceActive = legal.length > 0 && legal.every(source => source.status === "active");
  const status = legal.length === 0 ? "blocked-missing-citation" : "draft";
  const riskLevel = intent === "payroll" || intent === "month-close" ? "financial" : "legal";
  const reviewRequired = true;
  return {
    id: input.id,
    intent,
    status,
    answer: buildAnswer({ intent, question: input.question, citations, calculations, context, sourceActive }),
    confidence: confidenceForIntent(intent, citations, calculations),
    riskLevel,
    reviewRequired,
    advisoryOnly: true,
    citations,
    calculations,
    context,
    proposedActions: buildProposedActions({ intent, context, sourceActive }),
    guardrails: buildGuardrails(intent),
    createdAt: now
  };
}

function confidenceForIntent(intent, citations, calculations) {
  const base = intent === "payroll" ? 88 : intent === "month-close" ? 84 : 82;
  return Math.min(94, base + Math.min(citations.length, 2) * 3 + Math.min(calculations.length, 2) * 2);
}

function buildAnswer({ intent, citations, calculations, context, sourceActive }) {
  const citationNames = citations.map(source => source.title).filter(Boolean).join("; ") || "configured Armenian legal source registry";
  if (intent === "vat") {
    const vat = calculations.find(calc => calc.kind === "vat-report");
    const payable = vat && vat.outputs ? vat.outputs.netVatPayable : null;
    return [
      "Internal draft VAT/ԱԱՀ guidance: use the cited Armenian tax source, verify the customer and accounting period, and keep the response under accountant review.",
      payable !== null ? `The current VAT preview shows ${payable} AMD net VAT payable for ${context.periodKey || "the selected period"}.` : "No VAT amount was posted by this response.",
      sourceActive ? "The VAT source is active, so the next step can be preparing an SRC export packet for accountant review." : "The VAT source is not active yet, so SRC export preparation stays disabled until accountant review.",
      `Cited source(s): ${citationNames}.`
    ].join(" ");
  }
  if (intent === "payroll") {
    const payroll = calculations.find(calc => calc.kind === "payroll-preview");
    const net = payroll && payroll.outputs ? payroll.outputs.net : null;
    return [
      "Internal payroll preview: calculate Armenian payroll deductions using the effective-dated payroll configuration for the selected date.",
      net !== null ? `The preview net salary is ${net} AMD.` : "No payroll run was posted by this response.",
      "Posting payroll still requires finance/operator review and an open period."
    ].join(" ");
  }
  if (intent === "personal-data") {
    const deleteMode = context.requestType === "delete";
    return [
      "Internal personal-data guidance: use the cited Armenian personal-data source and route the final action through owner/legal review.",
      deleteMode ? "For deletion requests, prepare a retention assessment first; do not delete accounting, contract, or statutory-retention records automatically." : "For export requests, prepare an auditable export request and packet after legal-source review.",
      sourceActive ? "The personal-data source is active for workflow preparation." : "The personal-data source is not active yet, so request preparation stays disabled until lawyer review.",
      `Cited source(s): ${citationNames}.`
    ].join(" ");
  }
  if (intent === "esign") {
    const doc = context.document || {};
    return [
      "Internal e-signature guidance: use the cited Armenian electronic document/signature source and inspect the local consent chain before relying on the document externally.",
      doc.id ? `Document ${doc.id} is currently ${doc.status || "unknown"} with ${(doc.signers || []).length} signer(s).` : "No document was selected.",
      "This response does not sign, seal, void, or send any document.",
      `Cited source(s): ${citationNames}.`
    ].join(" ");
  }
  return [
    "Internal month-close guidance: review the open period, trial balance, VAT preview, and period locks before closing.",
    "This response does not close the period or post accounting entries."
  ].join(" ");
}

function buildProposedActions({ intent, context, sourceActive }) {
  if (intent === "vat") {
    return [{
      key: "finance.src.prepare",
      label: "Prepare SRC export packet after VAT source review",
      method: "POST",
      path: "/api/finance/src-exports",
      payload: { periodKey: context.periodKey || "", note: "Prepared from copilot VAT guidance" },
      requiresApproval: true,
      mutates: true,
      disabledReason: sourceActive ? "" : "VAT legal source is not active yet"
    }];
  }
  if (intent === "payroll") {
    return [{
      key: "payroll.run.prepare",
      label: "Run payroll after finance review",
      method: "POST",
      path: "/api/payroll/run",
      payload: { employeeId: context.employee?.id || "", gross: context.gross || 0, runDate: context.asOf || "" },
      requiresApproval: true,
      mutates: true,
      disabledReason: ""
    }];
  }
  if (intent === "personal-data") {
    return [{
      key: "privacy.request.prepare",
      label: context.requestType === "delete" ? "Prepare deletion retention assessment request" : "Prepare data export request",
      method: "POST",
      path: "/api/privacy/requests",
      payload: {
        customerId: context.customer?.id || "",
        requestType: context.requestType || "export",
        requesterEmail: context.customer?.email || "",
        channel: "Copilot",
        note: "Prepared from copilot personal-data guidance"
      },
      requiresApproval: true,
      mutates: true,
      disabledReason: sourceActive ? "" : "Personal-data legal source is not active yet"
    }];
  }
  if (intent === "esign") {
    const docId = context.document?.id || "";
    return [{
      key: "docs.export.open",
      label: "Open printable document evidence certificate",
      method: "GET",
      path: docId ? `/api/docs/documents/${encodeURIComponent(docId)}/export` : "",
      payload: {},
      requiresApproval: false,
      mutates: false,
      disabledReason: docId ? "" : "Select a document first"
    }];
  }
  return [{
    key: "finance.period.close.prepare",
    label: "Review period close",
    method: "POST",
    path: context.periodKey ? `/api/finance/periods/${encodeURIComponent(context.periodKey)}/close` : "",
    payload: { reason: "Prepared from copilot month-close guidance" },
    requiresApproval: true,
    mutates: true,
    disabledReason: "Close only after accountant review"
  }];
}

function buildGuardrails(intent) {
  const common = [
    "Copilot responses are advisory drafts and do not execute business mutations.",
    "Human review is required before external legal, tax, accounting, or customer-facing use."
  ];
  if (intent === "vat") return [...common, "No SRC submission is performed by this response."];
  if (intent === "personal-data") return [...common, "Deletion is not executed automatically."];
  if (intent === "esign") return [...common, "No document signature, seal, send, or void action is performed."];
  if (intent === "payroll") return [...common, "No payroll run is posted by this response."];
  return [...common, "No finance period is closed by this response."];
}

module.exports = {
  INTENTS,
  normalizeIntent,
  requiredAppForIntent,
  buildCopilotPacket
};
```

- [x] **Step 2: Run module-level smoke through API tests**

Run:

```bash
node --test test/copilot.test.js
```

Expected: still FAIL because the route is not registered yet.

- [x] **Step 3: Commit the module**

```bash
git add server/copilot.js
git commit -m "feat(copilot): add deterministic Armenian copilot engine"
git push origin main
```

## Task 3: Wire The Backend Route And Context Gathering

**Files:**
- Modify: `server/app.js`
- Test: `test/copilot.test.js`

- [x] **Step 1: Import the module**

Near the existing imports in `server/app.js`, add:

```js
const copilot = require("./copilot");
```

- [x] **Step 2: Register the route**

Add this route near the legal/finance routes, after `POST /api/legal/questions` and before `GET /api/finance/vat-report`:

```js
app.post("/api/copilot/questions", async request => {
  const user = await app.auth(request);
  const result = createCopilotQuestion(db, user, request.body || {});
  return { ok: true, copilot: result };
});
```

- [x] **Step 3: Add context helpers**

Add these helpers near existing legal helper functions in `server/app.js`:

```js
function createCopilotQuestion(db, user, body) {
  const question = String(body.question || "").trim();
  if (question.length < 8) {
    const err = new Error("Copilot question is required");
    err.statusCode = 400;
    throw err;
  }
  const intent = copilot.normalizeIntent(body.intent, question);
  requireAppAccess(db, user, copilot.requiredAppForIntent(intent));
  const customer = getCopilotCustomer(db, user.org_id, body.customerId);
  const context = buildCopilotContext(db, user, intent, body, customer);
  const citations = getCopilotCitations(db, user.org_id, intent, question);
  const calculations = getCopilotCalculations(db, user.org_id, intent, body, context);
  return copilot.buildCopilotPacket({
    id: randomId("copilot"),
    intent,
    question,
    citations,
    calculations,
    context,
    now: new Date().toISOString()
  });
}

function getCopilotCustomer(db, orgId, customerId) {
  const id = String(customerId || "").trim();
  if (!id) return null;
  const row = db.prepare("SELECT id, name, email, tax_id AS taxId, segment, health_score AS healthScore FROM customers WHERE org_id = ? AND id = ?").get(orgId, id);
  if (!row) {
    const err = new Error("Customer not found");
    err.statusCode = 404;
    throw err;
  }
  return row;
}

function buildCopilotContext(db, user, intent, body, customer) {
  const periodKey = normalizePeriodKey(body.periodKey);
  const base = { customer, periodKey };
  if (intent === "payroll") {
    const employee = body.employeeId ? getEmployee(db, user.org_id, body.employeeId) : null;
    const gross = employee ? employee.grossSalary : Math.max(0, Math.round(Number(body.gross) || 0));
    return { ...base, employee, gross, asOf: normalizeDate(body.asOf) };
  }
  if (intent === "personal-data") {
    const text = `${body.intent || ""} ${body.question || ""}`.toLowerCase();
    return { ...base, requestType: /(delete|erase|ջնջ)/i.test(text) ? "delete" : "export" };
  }
  if (intent === "esign") {
    const documentId = String(body.documentId || "").trim();
    const document = documentId ? getDocument(db, user.org_id, documentId) : null;
    if (documentId && !document) {
      const err = new Error("Document not found");
      err.statusCode = 404;
      throw err;
    }
    return { ...base, document: document ? summarizeCopilotDocument(document) : null };
  }
  if (intent === "month-close") {
    const period = periodKey ? getFinancePeriod(db, user.org_id, periodKey) : null;
    return { ...base, period };
  }
  return base;
}

function normalizePeriodKey(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 7);
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function summarizeCopilotDocument(document) {
  return {
    id: document.id,
    title: document.title,
    docType: document.docType,
    status: document.status,
    sealedChecksum: document.sealedChecksum,
    sealedAt: document.sealedAt,
    signers: (document.signers || []).map(signer => ({
      id: signer.id,
      signerName: signer.signerName,
      status: signer.status,
      signedAt: signer.signedAt,
      checksum: signer.checksum
    }))
  };
}
```

- [x] **Step 4: Add citation/calculation helpers**

Continue in `server/app.js`:

```js
function getCopilotCitations(db, orgId, intent, question) {
  const sourceIds = intent === "vat" || intent === "month-close"
    ? ["law-tax-code"]
    : intent === "personal-data"
      ? ["law-personal-data"]
      : intent === "esign"
        ? ["law-esign"]
        : [];
  const citations = sourceIds.map((id, index) => {
    const source = getLegalSource(db, orgId, id);
    if (!source) return null;
    return {
      id: source.id,
      title: source.title,
      jurisdiction: source.jurisdiction,
      sourceUrl: source.sourceUrl,
      status: source.status,
      effectiveDate: source.effectiveDate,
      latestReview: source.latestReview,
      excerpt: copilotLegalExcerpt(id, question),
      relevance: 96 - index * 5
    };
  }).filter(Boolean);
  if (rag.stats().ready && question) {
    const hits = rag.search(question, 2);
    if (hits.length > 0) {
      const excerpt = hits.map(hit => `[${hit.lawTitle} · ${hit.article}] ${String(hit.text).replace(/\s+/g, " ").trim()}`).join(" ").slice(0, 800);
      return citations.map(source => ({ ...source, excerpt }));
    }
  }
  return citations;
}

function copilotLegalExcerpt(sourceId, question) {
  if (sourceId === "law-tax-code") return `VAT/ԱԱՀ source anchor for: ${String(question || "").slice(0, 160)}`;
  if (sourceId === "law-personal-data") return `Personal-data consent/export/delete source anchor for: ${String(question || "").slice(0, 160)}`;
  if (sourceId === "law-esign") return `Electronic document/signature source anchor for: ${String(question || "").slice(0, 160)}`;
  return "Configured Armenian legal source registry.";
}

function getCopilotCalculations(db, orgId, intent, body, context) {
  if (intent === "vat") {
    const report = ledger.vatReport(db, orgId, context.periodKey);
    return [{
      kind: "vat-report",
      label: `VAT report for ${context.periodKey}`,
      inputs: { periodKey: context.periodKey },
      outputs: {
        outputVat: report.outputVat,
        inputVat: report.inputVat,
        netVatPayable: report.netVatPayable
      }
    }];
  }
  if (intent === "payroll") {
    const gross = Math.max(0, Math.round(Number(context.gross) || 0));
    if (gross <= 0) {
      const err = new Error("gross or employeeId is required for payroll preview");
      err.statusCode = 400;
      throw err;
    }
    const calc = payroll.calculatePayroll(gross, { config: resolvePayrollConfig(db, orgId, context.asOf) });
    return [{
      kind: "payroll-preview",
      label: `Payroll preview for ${context.asOf}`,
      inputs: { gross, asOf: context.asOf, employeeId: context.employee?.id || "" },
      outputs: calc
    }];
  }
  if (intent === "month-close") {
    const vat = ledger.vatReport(db, orgId, context.periodKey);
    const tb = ledger.trialBalance(db, orgId);
    return [
      {
        kind: "trial-balance",
        label: "Trial balance",
        inputs: { periodKey: context.periodKey },
        outputs: { balanced: tb.balanced, totalDebit: tb.totalDebit, totalCredit: tb.totalCredit }
      },
      {
        kind: "vat-report",
        label: `VAT report for ${context.periodKey}`,
        inputs: { periodKey: context.periodKey },
        outputs: { outputVat: vat.outputVat, inputVat: vat.inputVat, netVatPayable: vat.netVatPayable }
      }
    ];
  }
  return [];
}
```

- [x] **Step 5: Run focused tests**

```bash
node --test test/copilot.test.js
```

Expected: PASS.

- [x] **Step 6: Commit the backend route**

```bash
git add server/app.js test/copilot.test.js
git commit -m "feat(copilot): expose cited Armenian legal accounting endpoint"
git push origin main
```

## Task 4: Expand Backend Coverage For Access And Missing Context

**Files:**
- Modify: `test/copilot.test.js`
- Modify as needed: `server/app.js`

- [x] **Step 1: Add access-control tests**

Append tests proving:

```js
test("copilot enforces app access for finance intents", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const supportCookie = await login(app, "support@armosphera.local", DEFAULT_PASSWORD);
    const res = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie: supportCookie },
      payload: { intent: "vat", customerId: "cust-nare", periodKey: "2026-05", question: "Explain VAT readiness." }
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
      payload: { intent: "vat", customerId: "cust-nope", question: "Explain VAT." }
    });
    assert.strictEqual(badCustomer.statusCode, 404);

    const badDoc = await app.inject({
      method: "POST",
      url: "/api/copilot/questions",
      headers: { cookie },
      payload: { intent: "esign", documentId: "doc-nope", question: "Review signature evidence." }
    });
    assert.strictEqual(badDoc.statusCode, 404);
  } finally {
    await app.close();
  }
});
```

- [x] **Step 2: Run focused and adjacent tests**

```bash
node --test test/copilot.test.js test/legal-grounding.test.js test/legal-search.test.js test/payroll-endpoints.test.js test/docs-export.test.js
```

Expected: PASS.

- [x] **Step 3: Commit expanded coverage**

```bash
git add test/copilot.test.js server/app.js
git commit -m "test(copilot): cover access and missing context guardrails"
git push origin main
```

## Task 5: Build The React Copilot Panel

**Files:**
- Create: `web/src/copilot.jsx`
- Modify later: `web/src/main.jsx`
- Modify later: `web/src/styles.css`

- [x] **Step 1: Create the component**

Create `web/src/copilot.jsx`:

```jsx
import React, { useMemo, useState } from "react";

const INTENTS = [
  ["vat", "VAT / SRC"],
  ["payroll", "Payroll"],
  ["personal-data", "Personal data"],
  ["esign", "E-sign"],
  ["month-close", "Month close"]
];

const money = value => `${Number(value || 0).toLocaleString("hy-AM")} AMD`;

export function CopilotPanel({ customers, docs, people, onAsk, actionState }) {
  const [intent, setIntent] = useState("vat");
  const [question, setQuestion] = useState("Can we prepare May VAT/SRC guidance for this customer?");
  const [customerId, setCustomerId] = useState("cust-nare");
  const [periodKey, setPeriodKey] = useState("2026-05");
  const [employeeId, setEmployeeId] = useState("");
  const [gross, setGross] = useState("600000");
  const [documentId, setDocumentId] = useState("doc-anahit-nda");
  const [result, setResult] = useState(null);
  const busy = actionState === "copilot:ask";
  const employees = (people && people.employees) || [];
  const documents = (docs && docs.documents) || [];
  const customerOptions = useMemo(() => customers || [], [customers]);

  async function ask() {
    if (question.trim().length < 8) return;
    const payload = {
      intent,
      question: question.trim(),
      customerId: customerId || undefined,
      periodKey: periodKey || undefined,
      employeeId: employeeId || undefined,
      gross: gross ? Number(gross) : undefined,
      documentId: documentId || undefined
    };
    setResult(await onAsk(payload));
  }

  return (
    <article className="panel copilot-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">A1 Copilot</span>
          <h2>Legal &amp; accounting copilot</h2>
        </div>
        <strong className="aging-badge">local draft</strong>
      </div>

      <div className="copilot-controls">
        <div className="segmented">
          {INTENTS.map(([key, label]) => (
            <button key={key} type="button" className={intent === key ? "active" : ""} onClick={() => setIntent(key)}>{label}</button>
          ))}
        </div>
        <textarea value={question} onChange={event => setQuestion(event.target.value)} rows={3} />
        <div className="inline-form">
          <select value={customerId} onChange={event => setCustomerId(event.target.value)}>
            <option value="">No customer</option>
            {customerOptions.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          {(intent === "vat" || intent === "month-close") && (
            <input value={periodKey} onChange={event => setPeriodKey(event.target.value)} placeholder="YYYY-MM" />
          )}
          {intent === "payroll" && (
            <>
              <select value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
                <option value="">Manual gross</option>
                {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
              </select>
              <input value={gross} onChange={event => setGross(event.target.value)} inputMode="numeric" placeholder="Gross AMD" />
            </>
          )}
          {intent === "esign" && (
            <select value={documentId} onChange={event => setDocumentId(event.target.value)}>
              <option value="">Select document</option>
              {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
            </select>
          )}
          <button className="mini-action" type="button" disabled={busy} onClick={ask}>{busy ? "Asking" : "Ask"}</button>
        </div>
      </div>

      {result && <CopilotResult result={result} />}
    </article>
  );
}

function CopilotResult({ result }) {
  const citations = result.citations || [];
  const calculations = result.calculations || [];
  const actions = result.proposedActions || [];
  return (
    <div className="copilot-result">
      <p>{result.answer}</p>
      <div className="meta-row">
        <span>{result.intent}</span>
        <span>{result.riskLevel}</span>
        <span>{result.confidence}% confidence</span>
        <span>{result.reviewRequired ? "review required" : "review optional"}</span>
      </div>
      {calculations.length > 0 && (
        <div className="copilot-block">
          <h3>Calculations</h3>
          {calculations.map(calc => (
            <div className="row" key={calc.kind}>
              <span>{calc.label}</span>
              <strong>{formatCalculation(calc)}</strong>
            </div>
          ))}
        </div>
      )}
      {citations.length > 0 && (
        <div className="copilot-block">
          <h3>Citations</h3>
          {citations.map(source => (
            <div className="row" key={source.id}>
              <span>{source.title} · {source.status}</span>
              <strong>{source.effectiveDate || "no date"}</strong>
            </div>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div className="copilot-block">
          <h3>Proposed actions</h3>
          {actions.map(action => (
            <div className="row" key={action.key}>
              <span>{action.label}{action.disabledReason ? ` · ${action.disabledReason}` : ""}</span>
              <strong>{action.method} {action.path || "blocked"}</strong>
            </div>
          ))}
        </div>
      )}
      {(result.guardrails || []).map(item => <p className="action-status" key={item}>{item}</p>)}
    </div>
  );
}

function formatCalculation(calc) {
  const outputs = calc.outputs || {};
  if (calc.kind === "vat-report") return money(outputs.netVatPayable);
  if (calc.kind === "payroll-preview") return money(outputs.net);
  if (calc.kind === "trial-balance") return outputs.balanced ? "balanced" : "check";
  return Object.keys(outputs).length ? JSON.stringify(outputs) : "-";
}
```

- [x] **Step 2: Build UI to verify compile failure before integration is expected**

Run:

```bash
npm run build:ui
```

Expected: PASS because the new component is not imported yet.

- [x] **Step 3: Commit the standalone UI component**

```bash
git add web/src/copilot.jsx
git commit -m "feat(copilot): add React copilot panel"
git push origin main
```

## Task 6: Mount The Copilot Panel In The Workspace

**Files:**
- Modify: `web/src/main.jsx`
- Modify: `web/src/styles.css`
- Test: `web build`, Browser/Playwright local UI

- [x] **Step 1: Import the panel**

At the top of `web/src/main.jsx`, add:

```jsx
import { CopilotPanel } from "./copilot.jsx";
```

- [x] **Step 2: Add the action handler in `Workspace`**

Inside `Workspace`, near other mutation handlers:

```jsx
async function askCopilot(payload) {
  setActionState("copilot:ask");
  setActionError("");
  try {
    const data = await api("/api/copilot/questions", { method: "POST", body: payload });
    return data.copilot;
  } catch (err) {
    reportActionError(err);
    throw err;
  } finally {
    setActionState("");
  }
}
```

- [x] **Step 3: Render the panel**

In the main `<section className="content-grid">`, render this near the top, after `Customer360` and before domain-specific panels:

```jsx
<CopilotPanel
  customers={(serviceConsole && serviceConsole.customers) || []}
  docs={docs}
  people={people}
  onAsk={askCopilot}
  actionState={actionState}
/>
```

- [x] **Step 4: Add CSS**

Append compact styles to `web/src/styles.css`:

```css
.copilot-panel textarea {
  width: 100%;
  min-height: 86px;
  resize: vertical;
}

.copilot-controls {
  display: grid;
  gap: 10px;
}

.segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.segmented button {
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  cursor: pointer;
}

.segmented button.active {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 12%, var(--panel));
}

.copilot-result {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.copilot-block {
  display: grid;
  gap: 6px;
}

.copilot-block h3 {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.2;
}
```

- [x] **Step 5: Run build**

```bash
npm run build:ui
```

Expected: PASS.

- [x] **Step 6: Commit UI integration**

```bash
git add web/src/main.jsx web/src/styles.css
git commit -m "feat(copilot): mount local legal accounting copilot"
git push origin main
```

## Task 7: Full Verification And Browser Proof

**Files:**
- No planned code changes unless verification finds defects.

- [x] **Step 1: Run focused tests**

```bash
node --test test/copilot.test.js test/legal-grounding.test.js test/legal-search.test.js test/payroll-endpoints.test.js test/docs-export.test.js
```

Expected: PASS.

- [x] **Step 2: Run full suite**

```bash
npm test
```

Expected: all tests PASS. At planning time the suite was 268 tests before copilot; expect the count to increase by the new copilot tests.

- [x] **Step 3: Run UI build**

```bash
npm run build:ui
```

Expected: PASS and Vite output under `public/`.

- [x] **Step 4: Run smoke**

```bash
ARMOSPHERA_ONE_DB=/tmp/a1-suite-copilot-smoke.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 npm run smoke
```

Expected: PASS. If the smoke script already sets its own DB path, do not override it; use the repo's existing smoke convention.

- [x] **Step 5: Start local LAN server**

```bash
PORT=4178 HOST=0.0.0.0 ARMOSPHERA_ONE_DB=/tmp/a1-suite-copilot-ui.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 node server/index.js
```

Expected terminal output:

```text
A1 Suite listening on http://0.0.0.0:4178 (data: /tmp/a1-suite-copilot-ui.sqlite)
```

- [x] **Step 6: Browser verify desktop**

Use Browser plugin or Playwright:

```text
Open http://127.0.0.1:4178/
Login owner@armosphera.local / change-me-now
Verify the A1 Copilot panel renders.
Ask VAT guidance for cust-nare and 2026-05.
Verify answer, citations, VAT calculation, guardrails, and proposed SRC action render without overflow.
```

- [x] **Step 7: Browser verify mobile width**

Use a 390px-wide viewport:

```text
Verify segmented intent controls wrap cleanly.
Verify long Armenian/legal text does not overlap buttons or rows.
Verify the proposed action path fits or wraps within the panel.
```

- [x] **Step 8: OPPO reachability check**

Get Mac LAN IP:

```bash
ipconfig getifaddr en0 || ipconfig getifaddr en1
```

From OPPO Codex/browser, open the exact URL printed by:

```bash
MAC_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
printf 'http://%s:4178/\n' "$MAC_IP"
```

Expected: login page appears. If not reachable, check macOS firewall and that the server was started with `HOST=0.0.0.0`.

## Task 8: Update Handoff And Tag

**Files:**
- Modify: `HANDOFF.md`

- [x] **Step 1: Update handoff**

Before editing, collect exact verification numbers:

```bash
git tag --list | wc -l
npm test
```

Then update the first status line in `HANDOFF.md` with the exact tag count and the exact test result from the command output. Keep the format used by the file today, for example:

```markdown
_Last updated: 2026-06-01 · main after Armenian legal/accounting copilot slice · 35 tags · 279 tests (279 pass, 0 fail, 0 cancelled)_
```

Add a short completed backlog bullet:

```markdown
- **Armenian legal/accounting copilot** — DONE: local advisory `POST /api/copilot/questions`, citation-required VAT/privacy/e-sign guidance, deterministic payroll/VAT/month-close previews, proposed actions only, React Copilot panel, no external egress.
```

Add remote runbook:

````markdown
### OPPO remote-control / live preview

Run from `~/dev/A1-Suite-Local`:

```bash
PORT=4178 HOST=0.0.0.0 ARMOSPHERA_ONE_DB=/tmp/a1-suite-copilot.sqlite ARMOSPHERA_ONE_ALLOW_EGRESS=0 node server/index.js
```

Open from OPPO on the same LAN using the exact URL printed by:

```bash
MAC_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
printf 'http://%s:4178/\n' "$MAC_IP"
```
````

- [x] **Step 2: Commit handoff**

```bash
git add HANDOFF.md
git commit -m "docs: record copilot verification and OPPO preview runbook"
git push origin main
```

- [x] **Step 3: Tag after full green verification**

```bash
git tag armenian-copilot-mvp
git push origin armenian-copilot-mvp
```

## Final Self-Review Checklist

- [x] `test/copilot.test.js` fails before implementation and passes after.
- [x] `POST /api/copilot/questions` is authenticated.
- [x] Intent-specific app access is enforced.
- [x] VAT answers cite `law-tax-code`.
- [x] Personal-data answers cite `law-personal-data` and do not delete data.
- [x] E-sign answers cite `law-esign` and expose document evidence only.
- [x] Payroll answers calculate but do not post `payroll_runs`.
- [x] Month-close answers do not close periods.
- [x] Proposed actions are previews; they are not executed by the copilot endpoint.
- [x] No external network calls are introduced.
- [x] UI renders in desktop and mobile widths with no overlap.
- [x] Every task commit is pushed to GitHub.
- [x] `HANDOFF.md` contains the latest commit, test results, live URL command, and OPPO access note.
