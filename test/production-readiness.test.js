"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

async function reviewSource(app, cookie, sourceId, roleLabel) {
  const source = app.db.prepare("SELECT title, source_url AS sourceUrl, effective_date AS effectiveDate FROM legal_sources WHERE id = ?").get(sourceId);
  assert.ok(source, `${sourceId} seeded`);
  const res = await app.inject({
    method: "POST",
    url: `/api/legal/sources/${sourceId}/reviews`,
    headers: { cookie },
    payload: {
      title: `${source.title} - ${roleLabel} reviewed`,
      sourceUrl: source.sourceUrl,
      effectiveDate: source.effectiveDate,
      status: "active",
      reviewNote: `${roleLabel} confirmed this source for production readiness.`
    }
  });
  assert.strictEqual(res.statusCode, 200, res.body);
}

test("production readiness gate blocks production while legal/accounting sources need review", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const beforeReviews = app.db.prepare("SELECT COUNT(*) AS count FROM legal_source_reviews").get().count;

    const res = await app.inject({
      method: "GET",
      url: "/api/compliance/production-readiness?asOf=2026-05-31",
      headers: { cookie }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const gate = res.json().readiness;
    assert.strictEqual(gate.status, "blocked");
    assert.strictEqual(gate.reviewRequired, true);
    assert.strictEqual(gate.asOf, "2026-05-31");
    assert.ok(gate.gates.some(item => item.key === "law-tax-code" && item.pass === false && item.ownerRole === "Accountant"));
    assert.ok(gate.gates.some(item => item.key === "law-personal-data" && item.pass === false && item.ownerRole === "Lawyer"));
    assert.ok(gate.gates.some(item => item.key === "tax-rate-vat-current" && item.pass === true));
    assert.ok(gate.gates.some(item => item.key === "tax-rate-payroll-current" && item.pass === true));
    assert.ok(gate.blockers.length >= 3, "legal sources block production");
    assert.strictEqual(app.db.prepare("SELECT COUNT(*) AS count FROM legal_source_reviews").get().count, beforeReviews, "readiness gate is read-only");
  } finally {
    await app.close();
  }
});

test("production readiness gate becomes ready after required professional reviews", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const ownerCookie = await login(app);
    const accountantCookie = await login(app, "accountant@armosphera.local", DEFAULT_PASSWORD);
    const lawyerCookie = await login(app, "lawyer@armosphera.local", DEFAULT_PASSWORD);

    await reviewSource(app, ownerCookie, "law-tax-code", "Owner");
    await reviewSource(app, ownerCookie, "law-personal-data", "Owner");
    await reviewSource(app, ownerCookie, "law-esign", "Owner");

    const ownerOnly = await app.inject({
      method: "GET",
      url: "/api/compliance/production-readiness?asOf=2026-05-31",
      headers: { cookie: ownerCookie }
    });
    assert.strictEqual(ownerOnly.statusCode, 200, ownerOnly.body);
    assert.strictEqual(ownerOnly.json().readiness.status, "blocked", "owner maintenance review is not professional sign-off");

    await reviewSource(app, accountantCookie, "law-tax-code", "Accountant");
    await reviewSource(app, lawyerCookie, "law-personal-data", "Lawyer");
    await reviewSource(app, lawyerCookie, "law-esign", "Lawyer");

    const res = await app.inject({
      method: "GET",
      url: "/api/compliance/production-readiness?asOf=2026-05-31",
      headers: { cookie: ownerCookie }
    });

    assert.strictEqual(res.statusCode, 200, res.body);
    const gate = res.json().readiness;
    assert.strictEqual(gate.status, "ready");
    assert.strictEqual(gate.reviewRequired, false);
    assert.strictEqual(gate.summary.blocked, 0);
    assert.strictEqual(gate.summary.passed, gate.summary.total);
    assert.ok(gate.gates.every(item => item.pass === true));
  } finally {
    await app.close();
  }
});

test("production readiness gate is limited to review roles", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const supportCookie = await login(app, "support@armosphera.local", DEFAULT_PASSWORD);
    const accountantCookie = await login(app, "accountant@armosphera.local", DEFAULT_PASSWORD);
    const lawyerCookie = await login(app, "lawyer@armosphera.local", DEFAULT_PASSWORD);

    const blocked = await app.inject({
      method: "GET",
      url: "/api/compliance/production-readiness",
      headers: { cookie: supportCookie }
    });
    assert.strictEqual(blocked.statusCode, 403);

    const allowed = await app.inject({
      method: "GET",
      url: "/api/compliance/production-readiness",
      headers: { cookie: accountantCookie }
    });
    assert.strictEqual(allowed.statusCode, 200, allowed.body);

    const lawyerAllowed = await app.inject({
      method: "GET",
      url: "/api/compliance/production-readiness",
      headers: { cookie: lawyerCookie }
    });
    assert.strictEqual(lawyerAllowed.statusCode, 200, lawyerAllowed.body);
  } finally {
    await app.close();
  }
});

test("production readiness gate rejects malformed asOf query before readiness checks", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/compliance/production-readiness?asOf=%00bad",
      headers: { cookie }
    });

    assert.strictEqual(res.statusCode, 400, res.body);
    assert.match(res.body, /Invalid production readiness query/);
  } finally {
    await app.close();
  }
});

test("legal source reviews require the matching professional role", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const accountantCookie = await login(app, "accountant@armosphera.local", DEFAULT_PASSWORD);
    const lawyerCookie = await login(app, "lawyer@armosphera.local", DEFAULT_PASSWORD);
    const auditorCookie = await login(app, "auditor@armosphera.local", DEFAULT_PASSWORD);

    await reviewSource(app, accountantCookie, "law-tax-code", "Accountant");

    const accountantOnEsign = await app.inject({
      method: "POST",
      url: "/api/legal/sources/law-esign/reviews",
      headers: { cookie: accountantCookie },
      payload: {
        title: "RA Law on Electronic Document and Electronic Signature",
        sourceUrl: "https://www.cba.am/EN/lalaws/Law_on_e_docs_and%20_e_signatures.pdf",
        effectiveDate: "2026-05-31",
        status: "active",
        reviewNote: "Accountant cannot certify the legal e-sign source."
      }
    });
    assert.strictEqual(accountantOnEsign.statusCode, 403);

    await reviewSource(app, lawyerCookie, "law-esign", "Lawyer");

    const lawyerOnTax = await app.inject({
      method: "POST",
      url: "/api/legal/sources/law-tax-code/reviews",
      headers: { cookie: lawyerCookie },
      payload: {
        title: "RA Tax Code Article 63 VAT rate",
        sourceUrl: "https://www.arlis.am/hy/acts/224990",
        effectiveDate: "2026-05-31",
        status: "active",
        reviewNote: "Lawyer cannot certify the tax accounting source."
      }
    });
    assert.strictEqual(lawyerOnTax.statusCode, 403);

    const auditorOnTax = await app.inject({
      method: "POST",
      url: "/api/legal/sources/law-tax-code/reviews",
      headers: { cookie: auditorCookie },
      payload: {
        title: "RA Tax Code Article 63 VAT rate",
        sourceUrl: "https://www.arlis.am/hy/acts/224990",
        effectiveDate: "2026-05-31",
        status: "active",
        reviewNote: "Auditor is read-only and cannot certify source content."
      }
    });
    assert.strictEqual(auditorOnTax.statusCode, 403);
  } finally {
    await app.close();
  }
});
