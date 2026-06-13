"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

async function withLocale(value, fn) {
  const prev = process.env.A1_LOCALE;
  if (value === undefined) delete process.env.A1_LOCALE;
  else process.env.A1_LOCALE = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.A1_LOCALE;
    else process.env.A1_LOCALE = prev;
  }
}

async function createBillableProject(app, cookie) {
  // A project linked to a customer, with 3 hours (180 min) of logged time.
  const proj = (await app.inject({ method: "POST", url: "/api/projects", headers: { cookie },
    payload: { name: "Billable delivery", customerId: "cust-ani", status: "active" } })).json().project.id;
  await app.inject({ method: "POST", url: `/api/projects/${proj}/time-entries`, headers: { cookie }, payload: { minutes: 120, entryDate: "2099-03-05", note: "build" } });
  await app.inject({ method: "POST", url: `/api/projects/${proj}/time-entries`, headers: { cookie }, payload: { minutes: 60, entryDate: "2099-03-06", note: "review" } });
  return proj;
}

test("project-billing: unbilled time → posted invoice → ledger; entries marked billed; idempotent", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const proj = await createBillableProject(app, owner);

    // Preview: 180 min @ 10000 AMD/hr = 30000 gross; VAT-inclusive split 25000 + 5000.
    const preview = (await app.inject({ method: "GET", url: `/api/projects/${proj}/billing-preview?hourlyRate=10000`, headers: { cookie: owner } })).json();
    assert.strictEqual(preview.preview.unbilledMinutes, 180);
    assert.strictEqual(preview.preview.total, 30000);
    assert.strictEqual(preview.preview.subtotal, 25000);
    assert.strictEqual(preview.preview.vat, 5000);

    const defaultPreview = (await app.inject({ method: "GET", url: `/api/projects/${proj}/billing-preview`, headers: { cookie: owner } })).json();
    assert.strictEqual(defaultPreview.preview.unbilledMinutes, 180);
    assert.strictEqual(defaultPreview.preview.hourlyRate, 0);
    assert.strictEqual(defaultPreview.preview.total, 0);

    // Bill it (use a non-seeded open period via issueDate 2099-03).
    const billed = await app.inject({ method: "POST", url: `/api/projects/${proj}/bill-time`, headers: { cookie: owner },
      payload: { hourlyRate: 10000, issueDate: "2026-05-15" } });
    assert.strictEqual(billed.statusCode, 200);
    assert.strictEqual(billed.json().idempotent, false);
    assert.strictEqual(billed.json().billedMinutes, 180);
    const invoiceId = billed.json().invoice.id;
    assert.strictEqual(billed.json().invoice.total, 30000);
    assert.strictEqual(billed.json().invoice.vat, 5000);

    // The ledger reconciles: 221 receivable = +30000 (25000 revenue + 5000 VAT), balanced.
    const tb = (await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie: owner } })).json();
    const byCode = {};
    for (const r of (tb.rows || tb.accounts || [])) byCode[String(r.code)] = (r.debit || 0) - (r.credit || 0);
    assert.strictEqual(byCode["221"], 30000, "receivable debit 30000");
    assert.strictEqual(byCode["611"], -25000, "revenue credit 25000");
    assert.strictEqual(byCode["524"], -5000, "output VAT credit 5000");

    // Re-billing the SAME project/period is idempotent — no second invoice, no double-bill.
    const again = await app.inject({ method: "POST", url: `/api/projects/${proj}/bill-time`, headers: { cookie: owner },
      payload: { hourlyRate: 10000, issueDate: "2026-05-15" } });
    assert.strictEqual(again.statusCode, 200);
    assert.strictEqual(again.json().idempotent, true);

    // After billing, there is no more unbilled time.
    const preview2 = (await app.inject({ method: "GET", url: `/api/projects/${proj}/billing-preview?hourlyRate=10000`, headers: { cookie: owner } })).json();
    assert.strictEqual(preview2.preview.unbilledMinutes, 0, "all time now billed");

    // A fresh time entry becomes newly billable (next period).
    await app.inject({ method: "POST", url: `/api/projects/${proj}/time-entries`, headers: { cookie: owner }, payload: { minutes: 30, entryDate: "2099-04-02" } });
    const preview3 = (await app.inject({ method: "GET", url: `/api/projects/${proj}/billing-preview?hourlyRate=10000`, headers: { cookie: owner } })).json();
    assert.strictEqual(preview3.preview.unbilledMinutes, 30, "new entry is unbilled");
  } finally { await app.close(); }
});

test("project-billing: RU billing stores kopecks while ledger reports rubles", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const owner = await login(app);
      const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
      app.db.prepare("INSERT OR IGNORE INTO tax_rates (id, org_id, kind, effective_date, config, note, created_at) VALUES (?, ?, 'vat', ?, ?, ?, ?)")
        .run(`taxrate-${orgId}-ru-vat-2026`, orgId, "2026-01-01", JSON.stringify({ rate: 0.22 }), "RF 2026 VAT 22%", new Date().toISOString());

      const projectId = (await app.inject({
        method: "POST",
        url: "/api/projects",
        headers: { cookie: owner },
        payload: { name: "RUB billing", customerId: "cust-ani", status: "active" }
      })).json().project.id;
      await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/time-entries`,
        headers: { cookie: owner },
        payload: { minutes: 60, entryDate: "2026-05-10", note: "RUB hour" }
      });

      const billed = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/bill-time`,
        headers: { cookie: owner },
        payload: { hourlyRate: 1000, issueDate: "2026-05-15" }
      });
      assert.strictEqual(billed.statusCode, 200, billed.body);
      assert.strictEqual(billed.json().invoice.total, 100000);
      assert.strictEqual(billed.json().invoice.vat, 18033);

      const tb = (await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie: owner } })).json();
      const byCode = Object.fromEntries(tb.rows.map(row => [String(row.code), row]));
      assert.strictEqual(byCode["62"].debit, 1000);
      assert.strictEqual(byCode["90"].credit, 819.67);
      assert.strictEqual(byCode["68"].credit, 180.33);
      assert.strictEqual(tb.balanced, true);
    } finally {
      await app.close();
    }
  });
});

test("project-billing: rejects malformed bill-time metadata before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const proj = await createBillableProject(app, owner);
    const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
    const draftInvoiceCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM finance_draft_invoices
      WHERE org_id = ?
        AND source_key LIKE ?
    `).get(orgId, `project-time:${proj}:%`).count;
    const invoiceCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE org_id = ?").get(orgId).count;
    const ledgerCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM ledger_journal WHERE org_id = ?").get(orgId).count;
    const billedEntryCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM project_time_entries
      WHERE org_id = ?
        AND project_id = ?
        AND billed_invoice_id IS NOT NULL
    `).get(orgId, proj).count;
    const billedAuditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE org_id = ?
        AND type = ?
    `).get(orgId, "projects.time.billed").count;

    const snapshot = {
      draftInvoices: draftInvoiceCount(),
      invoices: invoiceCount(),
      ledger: ledgerCount(),
      billedEntries: billedEntryCount(),
      auditEvents: billedAuditCount()
    };
    const malformedRequests = [
      ["secret-project-billing-array-body-token"],
      {
        hourlyRate: [10000],
        issueDate: "2026-05-15",
        token: "secret-project-billing-array-rate-token"
      },
      {
        hourlyRate: { value: 10000, token: "secret-project-billing-object-rate-token" },
        issueDate: "2026-05-15"
      },
      {
        hourlyRate: "10000\nsecret-project-billing-control-rate-token",
        issueDate: "2026-05-15"
      },
      {
        hourlyRate: 10000,
        issueDate: { date: "2026-05-15", token: "secret-project-billing-object-date-token" }
      },
      {
        hourlyRate: 10000,
        issueDate: "2026-02-31",
        token: "secret-project-billing-invalid-date-token"
      },
      {
        hourlyRate: 10000,
        issueDate: "2026-05-15",
        periodKey: ["2026-05"],
        token: "secret-project-billing-array-period-token"
      },
      {
        hourlyRate: 10000,
        issueDate: "2026-05-15",
        periodKey: "2026-13",
        token: "secret-project-billing-invalid-period-token"
      },
      {
        hourlyRate: 10000,
        issueDate: "2026-05-15",
        dueDays: { days: 14, token: "secret-project-billing-object-due-token" }
      },
      {
        hourlyRate: 10000,
        issueDate: "2026-05-15",
        dueDays: [14],
        token: "secret-project-billing-array-due-token"
      },
      {
        hourlyRate: 10000,
        issueDate: "2026-05-15",
        dueDays: "14\nsecret-project-billing-control-due-token"
      }
    ];

    for (const payload of malformedRequests) {
      const rejected = await app.inject({
        method: "POST",
        url: `/api/projects/${proj}/bill-time`,
        headers: { cookie: owner },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.ok(!rejected.body.includes("secret-project-billing"), "rejected payload secret is not reflected");
      assert.deepStrictEqual({
        draftInvoices: draftInvoiceCount(),
        invoices: invoiceCount(),
        ledger: ledgerCount(),
        billedEntries: billedEntryCount(),
        auditEvents: billedAuditCount()
      }, snapshot, "malformed bill-time payload did not mutate billing state");
    }

    const billed = await app.inject({
      method: "POST",
      url: `/api/projects/${proj}/bill-time`,
      headers: { cookie: owner },
      payload: { hourlyRate: 10000, issueDate: "2026-05-15", periodKey: "2026-05", dueDays: 14 }
    });
    assert.strictEqual(billed.statusCode, 200, billed.body);
    assert.strictEqual(billed.json().idempotent, false);
    assert.strictEqual(billed.json().billedMinutes, 180);
    assert.strictEqual(draftInvoiceCount(), snapshot.draftInvoices + 1);
    assert.strictEqual(billedEntryCount(), 2);
    assert.strictEqual(billedAuditCount(), snapshot.auditEvents + 1);
  } finally { await app.close(); }
});

test("project-billing: rejects malformed billing-preview query before quoting", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const proj = await createBillableProject(app, owner);
    const rejectedUrls = [
      `/api/projects/${proj}/billing-preview?hourlyRate=abc`,
      `/api/projects/${proj}/billing-preview?hourlyRate=-1`,
      `/api/projects/${proj}/billing-preview?hourlyRate=10000&asOf=not-a-date`
    ];

    for (const url of rejectedUrls) {
      const rejected = await app.inject({
        method: "GET",
        url,
        headers: { cookie: owner }
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
    }
  } finally { await app.close(); }
});

test("project-billing: malformed project path ids are rejected before billing side effects", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const proj = await createBillableProject(app, owner);
    const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
    const draftInvoiceCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM finance_draft_invoices
      WHERE org_id = ?
        AND source_key LIKE ?
    `).get(orgId, "project-time:%").count;
    const invoiceCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE org_id = ?").get(orgId).count;
    const ledgerCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM ledger_journal WHERE org_id = ?").get(orgId).count;
    const billedEntryCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM project_time_entries
      WHERE org_id = ?
        AND project_id = ?
        AND billed_invoice_id IS NOT NULL
    `).get(orgId, proj).count;
    const billedAuditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE org_id = ?
        AND type = ?
    `).get(orgId, "projects.time.billed").count;
    const current = () => ({
      draftInvoices: draftInvoiceCount(),
      invoices: invoiceCount(),
      ledger: ledgerCount(),
      billedEntries: billedEntryCount(),
      auditEvents: billedAuditCount()
    });
    const before = current();

    const expectPathRejected = async ({ method, url, payload, statusCode = 400, message = /Invalid project id/ }) => {
      const request = { method, url, headers: { cookie: owner } };
      if (payload !== undefined) request.payload = payload;
      const response = await app.inject(request);
      assert.strictEqual(response.statusCode, statusCode, `${url}: ${response.body}`);
      if (statusCode === 400) assert.match(response.body, message);
      assert.doesNotMatch(response.body, /secret-project-billing-path-/);
      assert.deepStrictEqual(current(), before);
    };

    for (const request of [
      { method: "GET", url: "/api/projects/badAsecret-project-billing-path-preview-id-token/billing-preview?hourlyRate=10000" },
      { method: "POST", url: "/api/projects/bad_secret-project-billing-path-bill-id-token/bill-time", payload: { hourlyRate: 10000, issueDate: "2026-05-15", note: "secret-project-billing-path-body-token" } },
      { method: "GET", url: `/api/projects/${"a".repeat(161)}/billing-preview?hourlyRate=10000`, statusCode: 404 },
      { method: "POST", url: "/api/projects/bad%0Asecret-project-billing-path-control-id-token/bill-time", payload: { hourlyRate: 10000, issueDate: "2026-05-15" } }
    ]) {
      await expectPathRejected(request);
    }

    for (const request of [
      { method: "GET", url: "/api/projects/proj-missing/billing-preview?hourlyRate=10000", statusCode: 404 },
      { method: "POST", url: "/api/projects/proj-missing/bill-time", payload: { hourlyRate: 10000, issueDate: "2026-05-15", note: "secret-project-billing-path-missing-body-token" }, statusCode: 404 }
    ]) {
      await expectPathRejected(request);
    }

    const preview = await app.inject({
      method: "GET",
      url: `/api/projects/${proj}/billing-preview?hourlyRate=10000`,
      headers: { cookie: owner }
    });
    assert.strictEqual(preview.statusCode, 200, preview.body);
    assert.strictEqual(preview.json().preview.unbilledMinutes, 180);
    assert.deepStrictEqual(current(), before);
  } finally { await app.close(); }
});

test("project-billing: cannot bill into a closed finance period (409 PERIOD_LOCKED)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const proj = await createBillableProject(app, owner);

    // A control project proves the open period bills fine; the target project is billed for
    // the FIRST time only AFTER the period closes — so the idempotency short-circuit (which is
    // checked before the period gate) cannot mask the lock.
    const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const issueDate = `${openPeriod}-15`;
    const control = await app.inject({ method: "POST", url: `/api/projects/${proj}/bill-time`, headers: { cookie: owner }, payload: { hourlyRate: 10000, issueDate } });
    assert.strictEqual(control.statusCode, 200, "control bill into the open period succeeds");

    // A SEPARATE billable project that has never been billed in this period.
    const target = await createBillableProject(app, owner);

    // Close the period, then the target's FIRST bill into it must be rejected with 409.
    const close = await app.inject({ method: "POST", url: `/api/finance/periods/${openPeriod}/close`, headers: { cookie: owner }, payload: { reason: "month closed" } });
    assert.strictEqual(close.statusCode, 200, "owner closes the period");

    const lockedBill = await app.inject({ method: "POST", url: `/api/projects/${target}/bill-time`, headers: { cookie: owner }, payload: { hourlyRate: 10000, issueDate } });
    assert.strictEqual(lockedBill.statusCode, 409, "billing into a closed period is rejected");

    // The target's time remains UNBILLED — the rejected bill posted nothing.
    const preview = (await app.inject({ method: "GET", url: `/api/projects/${target}/billing-preview?hourlyRate=10000`, headers: { cookie: owner } })).json();
    assert.strictEqual(preview.preview.unbilledMinutes, 180, "closed-period bill left the time unbilled");
  } finally { await app.close(); }
});

test("project-billing: guards — no customer (400), no unbilled time (400), finance gate (403)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Project WITHOUT a customer cannot be billed.
    const noCust = (await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: owner }, payload: { name: "Internal project" } })).json().project.id;
    await app.inject({ method: "POST", url: `/api/projects/${noCust}/time-entries`, headers: { cookie: owner }, payload: { minutes: 60, entryDate: "2099-03-05" } });
    const noCustBill = await app.inject({ method: "POST", url: `/api/projects/${noCust}/bill-time`, headers: { cookie: owner }, payload: { hourlyRate: 10000, issueDate: "2026-05-15" } });
    assert.strictEqual(noCustBill.statusCode, 400);

    // A customer project with NO time -> 400 (nothing to bill).
    const empty = (await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: owner }, payload: { name: "Empty", customerId: "cust-ani" } })).json().project.id;
    const emptyBill = await app.inject({ method: "POST", url: `/api/projects/${empty}/bill-time`, headers: { cookie: owner }, payload: { hourlyRate: 10000, issueDate: "2026-05-15" } });
    assert.strictEqual(emptyBill.statusCode, 400);

    // Finance gate: an Operator (Projects writer but NOT a finance operator) cannot bill -> 403.
    const proj = await createBillableProject(app, owner);
    const opLogin = await app.inject({ method: "POST", url: "/api/login", payload: { email: "operator@armosphera.local", password: DEFAULT_PASSWORD } });
    const opCookie = opLogin.headers["set-cookie"];
    const opBill = await app.inject({ method: "POST", url: `/api/projects/${proj}/bill-time`, headers: { cookie: opCookie }, payload: { hourlyRate: 10000, issueDate: "2026-05-15" } });
    assert.strictEqual(opBill.statusCode, 403);
  } finally { await app.close(); }
});
