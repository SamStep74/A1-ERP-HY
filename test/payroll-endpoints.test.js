"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } });
  return res.headers["set-cookie"];
}

test("payroll run computes net and posts a balanced ledger entry", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const calc = await app.inject({ method: "POST", url: "/api/payroll/calculate", headers: { cookie }, payload: { gross: 600000 } });
    assert.strictEqual(calc.json().payroll.net, 436500);
    const run = await app.inject({ method: "POST", url: "/api/payroll/run", headers: { cookie }, payload: { employeeName: "Անի", gross: 600000, runDate: `${openPeriod}-28` } });
    assert.strictEqual(run.statusCode, 200);
    assert.strictEqual(run.json().run.net, 436500);
    const tb = await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } });
    const byCode = Object.fromEntries(tb.json().rows.map(r => [r.code, r]));
    assert.strictEqual(byCode["714"].balance, 600000);
    assert.strictEqual(byCode["521"].balance, -436500);
    assert.strictEqual(byCode["525"].balance, -163500);
    assert.strictEqual(tb.json().balanced, true);
    const runs = await app.inject({ method: "GET", url: "/api/payroll/runs", headers: { cookie } });
    assert.ok(runs.json().runs.length >= 1);
  } finally { await app.close(); }
});

test("RU payroll run posts НДФЛ to 68 and employer insurance to 69", async () => {
  const prev = process.env.A1_LOCALE;
  process.env.A1_LOCALE = "ru";
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const run = await app.inject({
      method: "POST",
      url: "/api/payroll/run",
      headers: { cookie },
      payload: { employeeName: "Иван", gross: 100000, runDate: `${openPeriod}-28` },
    });
    assert.strictEqual(run.statusCode, 200, run.body);
    assert.strictEqual(run.json().run.incomeTax, 1300000);
    assert.strictEqual(run.json().run.totalDeductions, 1300000);
    assert.strictEqual(run.json().run.net, 8700000);
    assert.strictEqual(run.json().run.employerInsurance, 3000000);
    const tb = await app.inject({ method: "GET", url: "/api/finance/trial-balance", headers: { cookie } });
    const byCode = Object.fromEntries(tb.json().rows.map(r => [r.code, r]));
    assert.strictEqual(byCode["26"].balance, 130000);
    assert.strictEqual(byCode["70"].balance, -87000);
    assert.strictEqual(byCode["68"].balance, -13000);
    assert.strictEqual(byCode["69"].balance, -30000);
    assert.strictEqual(tb.json().balanced, true);
  } finally {
    await app.close();
    if (prev === undefined) delete process.env.A1_LOCALE;
    else process.env.A1_LOCALE = prev;
  }
});

test("payroll calculate rejects malformed preview metadata without persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const payrollCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM payroll_runs").get().count;
    const ledgerCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM ledger_journal").get().count;
    const auditCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count;
    const payrollCountBefore = payrollCount();
    const ledgerCountBefore = ledgerCount();
    const auditCountBefore = auditCount();
    const basePayload = { gross: 600000, asOf: "2026-05-15" };
    const malformedRequests = [
      { gross: ["600000"], asOf: "2026-05-15" },
      { gross: { value: 600000, token: "secret-payroll-calc-object-gross-token" }, asOf: "2026-05-15" },
      { gross: "600000\nsecret-payroll-calc-control-gross-token", asOf: "2026-05-15" },
      { gross: "not-a-number-secret-payroll-calc-gross-token", asOf: "2026-05-15" },
      { gross: 0, asOf: "2026-05-15" },
      { gross: -1, asOf: "2026-05-15" },
      { ...basePayload, asOf: ["2026-05-15"] },
      { ...basePayload, asOf: "2026-05-15\nsecret-payroll-calc-control-date-token" },
      { ...basePayload, asOf: "not-a-date-secret-payroll-calc-date-token" },
      { ...basePayload, asOf: "2026-02-30" },
      { ...basePayload, config: ["secret-payroll-calc-array-config-token"] },
      { ...basePayload, config: { secret: "secret-payroll-calc-unknown-config-token" } },
      { ...basePayload, config: { incomeTaxRate: 2 } },
      { ...basePayload, config: { incomeTaxRate: "999999999999999999999999" } },
      { ...basePayload, config: { pension: { highRate: 2 } } },
      { ...basePayload, config: { pension: { baseCap: 500000.5 } } },
      { ...basePayload, config: { stampBrackets: [{ upTo: 100000, amount: ["1500"] }] } },
      { ...basePayload, config: { stampBrackets: [{ upTo: 100000, amount: 1500 }, { upTo: 50000, amount: 3000 }] } },
      { ...basePayload, config: { stampBrackets: [{ upTo: 1000, amount: 2000 }] } },
      { ...basePayload, config: { stampBrackets: [{ upTo: 100000, amount: 1500 }] } },
      ["secret-payroll-calc-array-body-token"]
    ];

    const rejectedMissingBody = await app.inject({
      method: "POST",
      url: "/api/payroll/calculate",
      headers: { cookie }
    });
    assert.strictEqual(rejectedMissingBody.statusCode, 400, rejectedMissingBody.body);

    const rejectedNull = await app.inject({
      method: "POST",
      url: "/api/payroll/calculate",
      headers: { cookie, "content-type": "application/json" },
      payload: "null"
    });
    assert.strictEqual(rejectedNull.statusCode, 400, rejectedNull.body);

    for (const payload of malformedRequests) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/payroll/calculate",
        headers: { cookie },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.doesNotMatch(rejected.body, /secret-payroll-calc-/);
    }

    assert.strictEqual(payrollCount(), payrollCountBefore);
    assert.strictEqual(ledgerCount(), ledgerCountBefore);
    assert.strictEqual(auditCount(), auditCountBefore);

    const valid = await app.inject({
      method: "POST",
      url: "/api/payroll/calculate",
      headers: { cookie },
      payload: { gross: "600000", asOf: "2026-05-15" }
    });
    assert.strictEqual(valid.statusCode, 200, valid.body);
    assert.strictEqual(valid.json().payroll.gross, 600000);
    assert.strictEqual(valid.json().payroll.net, 436500);
    assert.strictEqual(payrollCount(), payrollCountBefore);
    assert.strictEqual(ledgerCount(), ledgerCountBefore);
    assert.strictEqual(auditCount(), auditCountBefore);
  } finally { await app.close(); }
});

test("payroll run rejects malformed metadata before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const orgId = app.db.prepare("SELECT id FROM organizations LIMIT 1").get().id;
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const payrollCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM payroll_runs
    `).get().count;
    const payrollSecretCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM payroll_runs
      WHERE employee_name LIKE ?
        OR run_date LIKE ?
        OR period_key LIKE ?
        OR employee_name = ?
    `).get(
      "%secret-payroll-run-%",
      "%secret-payroll-run-%",
      "%secret-payroll-run-%",
      "[object Object]"
    ).count;
    const ledgerCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM ledger_journal
    `).get().count;
    const ledgerSecretCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM ledger_journal
      WHERE memo LIKE ?
        OR memo = ?
    `).get("%secret-payroll-run-%", "Payroll net [object Object]").count;
    const financeAuditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE type = ?
    `).get("finance.payroll.run").count;
    const peopleAuditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE type = ?
    `).get("people.payroll.run").count;
    const totalAuditCount = () => app.db.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count;

    const payrollCountBefore = payrollCount();
    const ledgerCountBefore = ledgerCount();
    const financeAuditCountBefore = financeAuditCount();
    const peopleAuditCountBefore = peopleAuditCount();
    const totalAuditCountBefore = totalAuditCount();
    const basePayload = {
      employeeName: "Անի",
      gross: 600000,
      runDate: `${openPeriod}-20`
    };
    const malformedFinanceRequests = [
      { employeeName: "secret-payroll-run-missing-gross-token", runDate: `${openPeriod}-20` },
      { ...basePayload, gross: ["600000"], employeeName: "secret-payroll-run-array-gross-token" },
      { ...basePayload, gross: { value: 600000, token: "secret-payroll-run-object-gross-token" } },
      { ...basePayload, gross: "600000\nsecret-payroll-run-control-gross-token" },
      { ...basePayload, gross: "not-a-number-secret-payroll-run-gross-token" },
      { ...basePayload, gross: 0, employeeName: "secret-payroll-run-zero-gross-token" },
      { ...basePayload, gross: -1, employeeName: "secret-payroll-run-negative-gross-token" },
      { ...basePayload, gross: "-0.1", employeeName: "secret-payroll-run-fractional-negative-gross-token" },
      { ...basePayload, runDate: [`${openPeriod}-20`], employeeName: "secret-payroll-run-array-date-token" },
      { ...basePayload, runDate: `${openPeriod}-20\nsecret-payroll-run-control-date-token` },
      { ...basePayload, runDate: "not-a-date-secret-payroll-run-date-token" },
      { ...basePayload, runDate: "2026-02-30", employeeName: "secret-payroll-run-impossible-date-token" },
      { ...basePayload, employeeName: { text: "Անի", token: "secret-payroll-run-object-name-token" } },
      { ...basePayload, employeeName: "Անի\nsecret-payroll-run-control-name-token" },
      { ...basePayload, employeeName: `${"N".repeat(161)}secret-payroll-run-long-name-token` },
      { ...basePayload, employeeId: ["emp-mariam"] },
      { ...basePayload, employeeId: { id: "emp-mariam", token: "secret-payroll-run-object-employee-token" } },
      { ...basePayload, employeeId: "emp-mariam\nsecret-payroll-run-control-employee-token" },
      { ...basePayload, config: ["secret-payroll-run-array-config-token"] },
      { ...basePayload, config: { incomeTaxRate: ["0.2"] } },
      { ...basePayload, config: { incomeTaxRate: 2 }, employeeName: "secret-payroll-run-rate-too-high-token" },
      { ...basePayload, config: { incomeTaxRate: "999999999999999999999999" }, employeeName: "secret-payroll-run-rate-extreme-token" },
      { ...basePayload, config: { incomeTaxRate: "0.2\nsecret-payroll-run-control-config-token" } },
      { ...basePayload, config: { pension: ["secret-payroll-run-pension-config-token"] } },
      { ...basePayload, config: { pension: { lowRate: { value: 0.05 } } } },
      { ...basePayload, config: { pension: { lowRate: 2 } }, employeeName: "secret-payroll-run-pension-rate-token" },
      { ...basePayload, config: { pension: { threshold: 500000.5 } }, employeeName: "secret-payroll-run-fractional-threshold-token" },
      { ...basePayload, config: { stampBrackets: [{ upTo: 100000, amount: ["1500"] }] } },
      { ...basePayload, config: { stampBrackets: [{ upTo: 100000, amount: 1500 }, { upTo: 50000, amount: 3000 }] } },
      { ...basePayload, config: { stampBrackets: [{ upTo: 1000, amount: 2000 }] } },
      { ...basePayload, config: { stampBrackets: [{ upTo: 100000, amount: 1500 }] }, employeeName: "secret-payroll-run-bracket-gap-token" },
      ["secret-payroll-run-array-body-token"]
    ];

    const rejectedMissingBody = await app.inject({
      method: "POST",
      url: "/api/payroll/run",
      headers: { cookie }
    });
    assert.strictEqual(rejectedMissingBody.statusCode, 400, rejectedMissingBody.body);

    const rejectedNull = await app.inject({
      method: "POST",
      url: "/api/payroll/run",
      headers: { cookie, "content-type": "application/json" },
      payload: "null"
    });
    assert.strictEqual(rejectedNull.statusCode, 400, rejectedNull.body);

    for (const payload of malformedFinanceRequests) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/payroll/run",
        headers: { cookie },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.doesNotMatch(rejected.body, /secret-payroll-run-/);
    }

    const malformedPeopleRequests = [
      { runDate: [`${openPeriod}-21`] },
      { runDate: `${openPeriod}-21\nsecret-payroll-run-people-date-token` },
      { runDate: "not-a-date-secret-payroll-run-people-date-token" },
      { runDate: "2026-02-30" },
      { gross: 600000 },
      { employeeName: "secret-payroll-run-people-name-token" },
      { employeeId: "emp-davit" },
      { config: { incomeTaxRate: { value: 0.2 } } },
      ["secret-payroll-run-people-array-body-token"]
    ];

    const rejectedPeopleNull = await app.inject({
      method: "POST",
      url: "/api/people/employees/emp-davit/run-payroll",
      headers: { cookie, "content-type": "application/json" },
      payload: "null"
    });
    assert.strictEqual(rejectedPeopleNull.statusCode, 400, rejectedPeopleNull.body);

    for (const payload of malformedPeopleRequests) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/people/employees/emp-davit/run-payroll",
        headers: { cookie },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.doesNotMatch(rejected.body, /secret-payroll-run-/);
    }

    assert.strictEqual(payrollCount(), payrollCountBefore);
    assert.strictEqual(payrollSecretCount(), 0);
    assert.strictEqual(ledgerCount(), ledgerCountBefore);
    assert.strictEqual(ledgerSecretCount(), 0);
    assert.strictEqual(financeAuditCount(), financeAuditCountBefore);
    assert.strictEqual(peopleAuditCount(), peopleAuditCountBefore);
    assert.strictEqual(totalAuditCount(), totalAuditCountBefore);

    const financeRun = await app.inject({
      method: "POST",
      url: "/api/payroll/run",
      headers: { cookie },
      payload: {
        employeeId: "emp-mariam",
        gross: "300000",
        runDate: `${openPeriod}-22`
      }
    });
    assert.strictEqual(financeRun.statusCode, 200, financeRun.body);
    assert.strictEqual(financeRun.json().run.employeeId, "emp-mariam");
    assert.strictEqual(financeRun.json().run.employeeName, "Մարիամ Սարգսյան");
    assert.strictEqual(financeRun.json().run.gross, 300000);

    const peopleRun = await app.inject({
      method: "POST",
      url: "/api/people/employees/emp-davit/run-payroll",
      headers: { cookie },
      payload: {
        runDate: `${openPeriod}-23`
      }
    });
    assert.strictEqual(peopleRun.statusCode, 200, peopleRun.body);
    assert.strictEqual(peopleRun.json().run.employeeId, "emp-davit");
    assert.strictEqual(peopleRun.json().run.employeeName, "Դավիթ Պետրոսյան");
  } finally { await app.close(); }
});
