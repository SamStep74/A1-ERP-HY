"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("payroll-fk: People-HR run links the run to the employee id; per-employee history is queryable", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Run payroll for a seeded employee via the People-HR route.
    const run = await app.inject({ method: "POST", url: "/api/people/employees/emp-davit/run-payroll",
      headers: { cookie: owner }, payload: { runDate: "2026-05-20" } });
    assert.strictEqual(run.statusCode, 200);
    assert.strictEqual(run.json().run.employeeId, "emp-davit", "run carries the employee id");

    // Per-employee history endpoint returns exactly that run, linked by id (not name).
    const hist = await app.inject({ method: "GET", url: "/api/people/employees/emp-davit/payroll-runs", headers: { cookie: owner } });
    assert.strictEqual(hist.statusCode, 200);
    const runs = hist.json().runs;
    assert.strictEqual(runs.length, 1, "one run in this employee's history");
    assert.strictEqual(runs[0].employeeId, "emp-davit");
    assert.ok(runs[0].net > 0 && runs[0].gross === 450000, "history reflects the run figures");

    // A DIFFERENT employee's history is empty — the FK isolates per-employee, not by shared name.
    const other = await app.inject({ method: "GET", url: "/api/people/employees/emp-anahit/payroll-runs", headers: { cookie: owner } });
    assert.strictEqual(other.json().runs.length, 0, "unrelated employee has no runs");

    // The all-runs Finance list also surfaces employeeId now.
    const all = await app.inject({ method: "GET", url: "/api/payroll/runs", headers: { cookie: owner } });
    assert.ok(all.json().runs.some(r => r.employeeId === "emp-davit"), "finance list carries employeeId");
  } finally { await app.close(); }
});

test("payroll-fk: a rename does not orphan history; ON DELETE SET NULL preserves the run", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    await app.inject({ method: "POST", url: "/api/people/employees/emp-davit/run-payroll", headers: { cookie: owner }, payload: { runDate: "2026-05-20" } });

    // Rename via gross-salary-agnostic field; history must still resolve by id.
    await app.inject({ method: "PATCH", url: "/api/people/employees/emp-davit", headers: { cookie: owner }, payload: { position: "Renamed Position" } });
    const hist = (await app.inject({ method: "GET", url: "/api/people/employees/emp-davit/payroll-runs", headers: { cookie: owner } })).json();
    assert.strictEqual(hist.runs.length, 1, "history survives an employee update");

    // Hard-delete the employee row: the payroll run must remain (ledger history is not erased), employee_id nulled.
    app.db.prepare("DELETE FROM people_employees WHERE id = 'emp-davit'").run();
    const surviving = app.db.prepare("SELECT employee_id, gross FROM payroll_runs WHERE employee_name = 'Դավիթ Պետրոսյան'").get();
    assert.ok(surviving, "payroll run survives employee deletion");
    assert.strictEqual(surviving.employee_id, null, "ON DELETE SET NULL unlinked the run, did not delete it");
  } finally { await app.close(); }
});

test("payroll-fk: generic /payroll/run accepts an optional validated employeeId; bad id -> 400", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // With a valid employeeId, the run is linked.
    const linked = await app.inject({ method: "POST", url: "/api/payroll/run", headers: { cookie: owner },
      payload: { gross: 300000, employeeId: "emp-mariam", employeeName: "Մարիամ Սարգսյան", runDate: "2026-05-10" } });
    assert.strictEqual(linked.statusCode, 200);
    const hist = (await app.inject({ method: "GET", url: "/api/people/employees/emp-mariam/payroll-runs", headers: { cookie: owner } })).json();
    assert.strictEqual(hist.runs.length, 1, "generic run linked to the employee");

    // A bogus employeeId is rejected rather than silently stored unlinked.
    const bad = await app.inject({ method: "POST", url: "/api/payroll/run", headers: { cookie: owner },
      payload: { gross: 300000, employeeId: "emp-nope", runDate: "2026-05-10" } });
    assert.strictEqual(bad.statusCode, 400, "unknown employeeId is rejected");

    // No employeeId at all still works (free-text name), stored unlinked.
    const free = await app.inject({ method: "POST", url: "/api/payroll/run", headers: { cookie: owner },
      payload: { gross: 250000, employeeName: "Contractor X", runDate: "2026-05-10" } });
    assert.strictEqual(free.statusCode, 200);
  } finally { await app.close(); }
});
