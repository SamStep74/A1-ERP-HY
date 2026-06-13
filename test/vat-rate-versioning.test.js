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

// A billable project: customer + 5 hours (300 min) of logged time. At 10000 AMD/hr → 50000 gross.
async function billableProject(app, cookie) {
  const proj = (await app.inject({ method: "POST", url: "/api/projects", headers: { cookie },
    payload: { name: "VAT billing", customerId: "cust-ani", status: "active" } })).json().project.id;
  await app.inject({ method: "POST", url: `/api/projects/${proj}/time-entries`, headers: { cookie }, payload: { minutes: 300, entryDate: "2026-05-10" } });
  return proj;
}

test("vat-versioning: billing uses the VAT rate in force on the issue date (20% baseline)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const proj = await billableProject(app, owner);

    // Preview at the standard 20% inclusive rate: 50000 total → 41667 + 8333.
    const preview = (await app.inject({ method: "GET", url: `/api/projects/${proj}/billing-preview?hourlyRate=10000`, headers: { cookie: owner } })).json().preview;
    assert.strictEqual(preview.total, 50000);
    assert.strictEqual(preview.subtotal, Math.round(50000 / 1.2));
    assert.strictEqual(preview.vat, 50000 - Math.round(50000 / 1.2));
    assert.strictEqual(preview.vatRate, 0.2, "preview surfaces the effective VAT rate");

    // Bill into the open 2026-05 period → 20% split persisted on the invoice.
    const billed = await app.inject({ method: "POST", url: `/api/projects/${proj}/bill-time`, headers: { cookie: owner },
      payload: { hourlyRate: 10000, issueDate: "2026-05-15" } });
    assert.strictEqual(billed.statusCode, 200);
    assert.strictEqual(billed.json().invoice.total, 50000);
    assert.strictEqual(billed.json().invoice.vat, 50000 - Math.round(50000 / 1.2));
  } finally { await app.close(); }
});

test("vat-versioning: a future-dated rate changes the split for invoices issued on/after it; history is frozen", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;

    // Schedule a reduced 18% VAT effective 2026-07-01 (at the DB level — no write API in this slice).
    app.db.prepare("INSERT OR IGNORE INTO tax_rates (id, org_id, kind, effective_date, config, note, created_at) VALUES (?, ?, 'vat', ?, ?, ?, ?)")
      .run(`taxrate-${orgId}-vat-2026h2`, orgId, "2026-07-01", JSON.stringify({ rate: 0.18 }), "Hypothetical reduced VAT", new Date().toISOString());

    // Open the 2026-07 period so we can bill into it (seeded closed by default).
    await app.inject({ method: "POST", url: "/api/finance/periods/2026-07/reopen", headers: { cookie: owner }, payload: {} });

    // An invoice issued 2026-07-15 must use 18%: 50000 → 42373 + 7627.
    const proj = await billableProject(app, owner);
    const preview = (await app.inject({ method: "GET", url: `/api/projects/${proj}/billing-preview?hourlyRate=10000&asOf=2026-07-15`, headers: { cookie: owner } })).json().preview;
    assert.strictEqual(preview.vatRate, 0.18, "preview reflects the future rate for that as-of date");
    assert.strictEqual(preview.subtotal, Math.round(50000 / 1.18));
    assert.strictEqual(preview.vat, 50000 - Math.round(50000 / 1.18));

    const billed = await app.inject({ method: "POST", url: `/api/projects/${proj}/bill-time`, headers: { cookie: owner },
      payload: { hourlyRate: 10000, issueDate: "2026-07-15" } });
    assert.strictEqual(billed.statusCode, 200);
    assert.strictEqual(billed.json().invoice.vat, 50000 - Math.round(50000 / 1.18), "invoice frozen at the 18% rate in force on its issue date");

    // A SEPARATE project billed into the still-open 2026-05 period keeps the OLD 20% rate (history frozen).
    const projOld = await billableProject(app, owner);
    const oldBill = await app.inject({ method: "POST", url: `/api/projects/${projOld}/bill-time`, headers: { cookie: owner },
      payload: { hourlyRate: 10000, issueDate: "2026-05-20" } });
    assert.strictEqual(oldBill.json().invoice.vat, 50000 - Math.round(50000 / 1.2), "pre-change issue date still uses 20%");
  } finally { await app.close(); }
});

test("vat-versioning: GET /api/finance/tax-rates lists effective-dated rows (auth-gated)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();

    const unauth = await app.inject({ method: "GET", url: "/api/finance/tax-rates" });
    assert.strictEqual(unauth.statusCode, 401);

    const owner = await login(app);
    const res = (await app.inject({ method: "GET", url: "/api/finance/tax-rates", headers: { cookie: owner } })).json();
    assert.ok(Array.isArray(res.taxRates), "returns a taxRates array");
    const vat = res.taxRates.filter(r => r.kind === "vat");
    assert.ok(vat.length >= 1, "seeded VAT rate present");
    assert.ok(vat[0].effectiveDate && typeof vat[0].rate === "number", "row carries effectiveDate + numeric rate");
    assert.strictEqual(vat.find(r => r.effectiveDate <= "2026-06-30").rate, 0.2, "current VAT is 20%");
  } finally { await app.close(); }
});

test("vat-versioning: workflow draft invoice uses effective rate and stores RUB minor units", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const owner = await login(app);
      const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;
      // S5 stores CRM deal money in active-locale minor units: 1,220.55 RUB -> 122,055 kopecks.
      app.db.prepare("UPDATE deals SET value = ?, currency = 'RUB' WHERE org_id = ? AND id = ?")
        .run(122055, orgId, "deal-nare-retainer");
      app.db.prepare("INSERT OR IGNORE INTO tax_rates (id, org_id, kind, effective_date, config, note, created_at) VALUES (?, ?, 'vat', ?, ?, ?, ?)")
        .run(`taxrate-${orgId}-ru-vat-2026`, orgId, "2026-01-01", JSON.stringify({ rate: 0.22 }), "RF 2026 VAT 22%", new Date().toISOString());

      const decision = await app.inject({
        method: "POST",
        url: "/api/workflow/approvals/approval-deal-nare-invoice/decision",
        headers: { cookie: owner },
        payload: { decision: "approved", note: "Prepare RUB draft invoice" }
      });
      assert.strictEqual(decision.statusCode, 200, decision.body);

      const executed = await app.inject({
        method: "POST",
        url: "/api/workflow/approvals/approval-deal-nare-invoice/execute",
        headers: { cookie: owner }
      });
      assert.strictEqual(executed.statusCode, 200, executed.body);
      const draft = executed.json().draftInvoice;
      assert.strictEqual(draft.total, 122055);
      assert.strictEqual(draft.subtotal, 100045);
      assert.strictEqual(draft.vat, 22010);
    } finally {
      await app.close();
    }
  });
});
