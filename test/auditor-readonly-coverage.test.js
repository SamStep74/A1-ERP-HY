"use strict";
// Cross-cutting authorization guard: the read-only Auditor role must be DENIED (403) on the
// primary mutating endpoint of every core domain. This is the systematic inverse of the
// per-domain RBAC tests — a single place that fails loudly if a new write route ships without
// a role gate (the realistic regression: add an endpoint, forget requires*-gate). Auditor is
// the canonical "authenticated but read-only" principal, so 403 (not 401) is the assertion.
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

// Each row: a human label + the primary write of a domain. Bodies are intentionally minimal —
// the role gate must fire BEFORE body validation (403 beats 400), which is the property we pin.
function writeEndpoints() {
  return [
    ["CRM lead", "POST", "/api/crm/leads", { companyName: "X", contactName: "Y", email: "x@y.am" }],
    ["Docs document", "POST", "/api/docs/documents", { title: "Audit attempt", docType: "agreement" }],
    ["Docs template generate", "POST", "/api/docs/templates/doctpl-org-armosphera-demo-nda/generate", {}],
    ["Project", "POST", "/api/projects", { name: "Audit project" }],
    ["People employee", "POST", "/api/people/employees", { fullName: "Audit Hire" }],
    ["People run-payroll", "POST", "/api/people/employees/emp-davit/run-payroll", {}],
    ["Forms definition", "POST", "/api/forms", { title: "Audit form", fields: [] }],
    ["Inventory stock move", "POST", "/api/inventory/moves", { catalogItemId: "catitem-pos-barcode-scanner", sourceLocationId: "stockloc-main-warehouse", destinationLocationId: "stockloc-customer", moveType: "outbound", quantity: 1 }],
    ["Purchase order", "POST", "/api/purchase/orders", { supplier: "Audit Supplier", lines: [{ catalogItemId: "catitem-pos-barcode-scanner", quantity: 1 }] }],
    ["Legal source review", "POST", "/api/legal/sources/law-tax-code/reviews", { title: "Audit source", sourceUrl: "https://www.arlis.am/hy/acts/224990", effectiveDate: "2026-05-31", status: "active", reviewNote: "Auditor must not certify legal sources." }],
    ["Finance expense", "POST", "/api/finance/expenses", { description: "x", subtotal: 1000, vat: 200 }],
    ["Finance bill", "POST", "/api/finance/bills", { supplier: "x", subtotal: 1000, vat: 200 }],
    ["Finance VAT return", "POST", "/api/finance/vat-returns", { periodKey: "2026-05", note: "Auditor must not prepare VAT return packets." }],
    ["Payroll run", "POST", "/api/payroll/run", { gross: 300000 }],
    ["Project bill-time", "POST", "/api/projects/proj-nare-retention/bill-time", { hourlyRate: 10000 }]
  ];
}

test("auditor-readonly: the read-only Auditor is denied (403) on every core-domain write", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const auditor = await login(app, "auditor@armosphera.local");
    assert.ok(auditor, "auditor login returns a session cookie");

    const failures = [];
    for (const [label, method, url, payload] of writeEndpoints()) {
      const res = await app.inject({ method, url, headers: { cookie: auditor }, payload });
      // 403 = correctly gated. 404 is acceptable ONLY if it's a missing seeded id, never for a
      // write that should be role-gated — so we treat anything other than 403 as a finding.
      if (res.statusCode !== 403) failures.push(`${label} → ${res.statusCode} (expected 403)`);
    }
    assert.deepStrictEqual(failures, [], `Auditor was NOT denied on:\n  ${failures.join("\n  ")}`);
  } finally { await app.close(); }
});

test("auditor-readonly: the same Auditor CAN still read (sanity — it is read-only, not locked out)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const auditor = await login(app, "auditor@armosphera.local");
    // A representative read from each gated domain must succeed (200) for the same principal.
    for (const url of ["/api/docs/documents", "/api/projects", "/api/people/employees", "/api/forms", "/api/inventory/stock", "/api/purchase/orders", "/api/finance/trial-balance", "/api/finance/tax-rates", "/api/finance/vat-returns"]) {
      const res = await app.inject({ method: "GET", url, headers: { cookie: auditor } });
      assert.strictEqual(res.statusCode, 200, `Auditor must be able to read ${url}`);
    }
  } finally { await app.close(); }
});
