"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function withLocale(value, fn) {
  const previous = process.env.A1_LOCALE;
  if (value === undefined) delete process.env.A1_LOCALE;
  else process.env.A1_LOCALE = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.A1_LOCALE;
    else process.env.A1_LOCALE = previous;
  }
}

async function login(app) {
  const res = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD }
  });
  return res.headers["set-cookie"];
}

function openPeriod(app, orgId) {
  return app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status = 'open' LIMIT 1")
    .get(orgId).period_key;
}

test("kopeck S7: RU payroll rounds taxes and contributions to whole rubles before storing kopecks", async () => {
  await withLocale("ru", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      await app.ready();
      const cookie = await login(app);
      const orgId = "org-armosphera-demo";
      const period = openPeriod(app, orgId);

      const preview = await app.inject({
        method: "POST",
        url: "/api/payroll/calculate",
        headers: { cookie },
        payload: { gross: "100003.85", asOf: `${period}-15` }
      });
      assert.equal(preview.statusCode, 200, preview.body);
      assert.equal(preview.json().payroll.gross, 10000385);
      assert.equal(preview.json().payroll.incomeTax, 1300100);
      assert.equal(preview.json().payroll.totalDeductions, 1300100);
      assert.equal(preview.json().payroll.net, 8700285);
      assert.equal(preview.json().payroll.employerInsurance, 3000100);
      assert.equal(preview.json().payroll.employerCost, 13000485);

      const run = await app.inject({
        method: "POST",
        url: "/api/payroll/run",
        headers: { cookie },
        payload: { employeeName: "Ivan S7", gross: "100003.85", runDate: `${period}-28` }
      });
      assert.equal(run.statusCode, 200, run.body);
      assert.equal(run.json().run.incomeTax, 1300100);
      assert.equal(run.json().run.employerInsurance, 3000100);
      assert.deepEqual(
        app.db.prepare("SELECT amount FROM ledger_journal WHERE org_id = ? AND source_type = 'payroll' AND source_id = ? ORDER BY amount")
          .all(orgId, run.json().run.id).map((row) => row.amount),
        [1300100, 3000100, 8700285]
      );

      const tb = Object.fromEntries((await app.inject({
        method: "GET",
        url: "/api/finance/trial-balance",
        headers: { cookie }
      })).json().rows.map((row) => [row.code, row]));
      assert.equal(tb["26"].balance, 130004.85);
      assert.equal(tb["68"].balance, -13001);
      assert.equal(tb["69"].balance, -30001);
      assert.equal(tb["70"].balance, -87002.85);
    } finally {
      await app.close();
    }
  });
});
