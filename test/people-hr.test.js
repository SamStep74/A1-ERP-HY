"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("people-hr: registry CRUD, write-gate, and payroll seam (employee -> payroll -> ledger)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();

    // Unauthenticated list -> 401
    const unauth = await app.inject({ method: "GET", url: "/api/people/employees" });
    assert.strictEqual(unauth.statusCode, 401);

    const owner = await login(app);
    const list = (await app.inject({ method: "GET", url: "/api/people/employees", headers: { cookie: owner } })).json();
    assert.ok(Array.isArray(list.employees) && list.employees.length >= 3, "seeded employees present");
    const anahit = list.employees.find(e => e.fullName.includes("Անահիտ"));
    assert.ok(anahit && anahit.grossSalary === 600000, "seeded Անահիտ has 600000 gross");

    // Create (Owner is a people writer)
    const created = await app.inject({
      method: "POST", url: "/api/people/employees", headers: { cookie: owner },
      payload: { fullName: "Գոռ Հովհաննիսյան", taxId: "12345678", position: "Developer", department: "Engineering", grossSalary: 800000, hireDate: "2026-01-10", email: "gor@armosphera.local" }
    });
    assert.strictEqual(created.statusCode, 200);
    const empId = created.json().employee.id;
    assert.strictEqual(created.json().employee.grossSalary, 800000);

    // Invalid ՀՎՀՀ (not 8 digits) -> 400
    const badTax = await app.inject({ method: "POST", url: "/api/people/employees", headers: { cookie: owner }, payload: { fullName: "Bad Tax", taxId: "123" } });
    assert.strictEqual(badTax.statusCode, 400);

    // Missing name -> 400
    const noName = await app.inject({ method: "POST", url: "/api/people/employees", headers: { cookie: owner }, payload: { grossSalary: 100000 } });
    assert.strictEqual(noName.statusCode, 400);

    // Write-gate: Auditor (read-only) cannot create -> 403
    const auditor = await login(app, "auditor@armosphera.local", DEFAULT_PASSWORD);
    const blocked = await app.inject({ method: "POST", url: "/api/people/employees", headers: { cookie: auditor }, payload: { fullName: "Should Fail" } });
    assert.strictEqual(blocked.statusCode, 403);

    // Patch: status + salary
    const patched = await app.inject({ method: "PATCH", url: `/api/people/employees/${empId}`, headers: { cookie: owner }, payload: { employmentStatus: "on-leave", grossSalary: 850000 } });
    assert.strictEqual(patched.statusCode, 200);
    assert.strictEqual(patched.json().employee.employmentStatus, "on-leave");
    assert.strictEqual(patched.json().employee.grossSalary, 850000);

    // Patch unknown employee -> 404
    const missing = await app.inject({ method: "PATCH", url: "/api/people/employees/nope", headers: { cookie: owner }, payload: { position: "x" } });
    assert.strictEqual(missing.statusCode, 404);

    // Payroll seam: run payroll FROM the registry (Անահիտ, gross 600000 -> net 436500 per the engine).
    // Use a non-seeded period (2099-03) to avoid the demo 2026-05 lock.
    const run = await app.inject({ method: "POST", url: `/api/people/employees/${anahit.id}/run-payroll`, headers: { cookie: owner }, payload: { runDate: "2099-03-15" } });
    assert.strictEqual(run.statusCode, 200);
    assert.strictEqual(run.json().run.gross, 600000);
    assert.strictEqual(run.json().run.net, 436500);
    assert.strictEqual(run.json().run.employeeName, anahit.fullName);

    // The run is persisted and visible in the payroll runs list
    const runs = (await app.inject({ method: "GET", url: "/api/payroll/runs", headers: { cookie: owner } })).json();
    assert.ok(runs.runs.some(r => r.net === 436500), "payroll run persisted");

    // Cannot run payroll for a terminated employee -> 409
    await app.inject({ method: "PATCH", url: `/api/people/employees/${empId}`, headers: { cookie: owner }, payload: { employmentStatus: "terminated" } });
    const termRun = await app.inject({ method: "POST", url: `/api/people/employees/${empId}/run-payroll`, headers: { cookie: owner }, payload: { runDate: "2099-03-15" } });
    assert.strictEqual(termRun.statusCode, 409);
  } finally { await app.close(); }
});

test("people-hr: rejects malformed employee metadata before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const employeeCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM people_employees
    `).get().count;
    const employeeSecretCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM people_employees
      WHERE full_name LIKE ?
        OR tax_id LIKE ?
        OR position LIKE ?
        OR department LIKE ?
        OR hire_date LIKE ?
        OR email LIKE ?
        OR full_name = ?
        OR position = ?
        OR department = ?
        OR email = ?
    `).get(
      "%secret-people-employee-%",
      "%secret-people-employee-%",
      "%secret-people-employee-%",
      "%secret-people-employee-%",
      "%secret-people-employee-%",
      "%secret-people-employee-%",
      "[object Object]",
      "[object Object]",
      "[object Object]",
      "[object Object]"
    ).count;
    const createdAuditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE type = ?
    `).get("people.employee.created").count;
    const updatedAuditCount = () => app.db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_events
      WHERE type = ?
    `).get("people.employee.updated").count;
    const getDavit = () => app.db.prepare(`
      SELECT position, department, gross_salary AS grossSalary, employment_status AS employmentStatus, email
      FROM people_employees
      WHERE id = ?
    `).get("emp-davit");

    const employeeCountBefore = employeeCount();
    const createdAuditCountBefore = createdAuditCount();
    const updatedAuditCountBefore = updatedAuditCount();
    const davitBefore = getDavit();
    const baseCreate = {
      fullName: "Նոր Աշխատակից",
      taxId: "12345678",
      position: "Developer",
      department: "Engineering",
      grossSalary: 800000,
      hireDate: "2026-01-10",
      email: "new.employee@armosphera.local"
    };
    const malformedCreates = [
      { position: "secret-people-employee-missing-name-token" },
      { ...baseCreate, fullName: { text: "Անի", token: "secret-people-employee-object-name-token" } },
      { ...baseCreate, fullName: "Ա\nsecret-people-employee-control-name-token" },
      { ...baseCreate, fullName: `${"N".repeat(161)}secret-people-employee-long-name-token` },
      { ...baseCreate, taxId: { value: "12345678", token: "secret-people-employee-object-tax-token" } },
      { ...baseCreate, taxId: "123\nsecret-people-employee-control-tax-token" },
      { ...baseCreate, taxId: "123" },
      { ...baseCreate, position: { text: "Developer", token: "secret-people-employee-object-position-token" } },
      { ...baseCreate, position: "Developer\nsecret-people-employee-control-position-token" },
      { ...baseCreate, position: `${"P".repeat(121)}secret-people-employee-long-position-token` },
      { ...baseCreate, department: ["secret-people-employee-array-department-token"] },
      { ...baseCreate, grossSalary: { value: 800000, token: "secret-people-employee-object-salary-token" } },
      { ...baseCreate, grossSalary: ["800000"] },
      { ...baseCreate, grossSalary: -1, fullName: "secret-people-employee-negative-salary-token" },
      { ...baseCreate, grossSalary: "not-a-number-secret-people-employee-salary-token" },
      { ...baseCreate, grossSalary: "800000\nsecret-people-employee-control-salary-token" },
      { ...baseCreate, employmentStatus: { value: "active", token: "secret-people-employee-object-status-token" } },
      { ...baseCreate, employmentStatus: "active\nsecret-people-employee-control-status-token" },
      { ...baseCreate, employmentStatus: "ghost-secret-people-employee-status-token" },
      { ...baseCreate, hireDate: ["2026-01-10"] },
      { ...baseCreate, hireDate: "2026-02-30" },
      { ...baseCreate, hireDate: "2026-01-10\nsecret-people-employee-control-date-token" },
      { ...baseCreate, email: { value: "new.employee@armosphera.local", token: "secret-people-employee-object-email-token" } },
      { ...baseCreate, email: "new.employee@armosphera.local\nsecret-people-employee-control-email-token" },
      { ...baseCreate, email: `${"e".repeat(161)}secret-people-employee-long-email-token` },
      ["secret-people-employee-array-body-token"]
    ];

    const rejectedMissingBody = await app.inject({
      method: "POST",
      url: "/api/people/employees",
      headers: { cookie: owner }
    });
    assert.strictEqual(rejectedMissingBody.statusCode, 400, rejectedMissingBody.body);

    const rejectedNull = await app.inject({
      method: "POST",
      url: "/api/people/employees",
      headers: { cookie: owner, "content-type": "application/json" },
      payload: "null"
    });
    assert.strictEqual(rejectedNull.statusCode, 400, rejectedNull.body);

    for (const payload of malformedCreates) {
      const rejected = await app.inject({
        method: "POST",
        url: "/api/people/employees",
        headers: { cookie: owner },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.doesNotMatch(rejected.body, /secret-people-employee-/);
    }

    const malformedPatches = [
      { fullName: "secret-people-employee-ignored-name-token" },
      { position: { text: "Lead", token: "secret-people-employee-patch-object-position-token" } },
      { position: "Lead\nsecret-people-employee-patch-control-position-token" },
      { position: `${"P".repeat(121)}secret-people-employee-patch-long-position-token` },
      { department: ["secret-people-employee-patch-array-department-token"] },
      { department: "Ops\nsecret-people-employee-patch-control-department-token" },
      { email: { value: "davit@armosphera.local", token: "secret-people-employee-patch-object-email-token" } },
      { email: "davit@armosphera.local\nsecret-people-employee-patch-control-email-token" },
      { email: `${"m".repeat(161)}secret-people-employee-patch-long-email-token` },
      { grossSalary: { value: 900000, token: "secret-people-employee-patch-object-salary-token" } },
      { grossSalary: ["900000"] },
      { grossSalary: -1 },
      { grossSalary: "not-a-number-secret-people-employee-patch-salary-token" },
      { grossSalary: "900000\nsecret-people-employee-patch-control-salary-token" },
      { employmentStatus: { value: "active", token: "secret-people-employee-patch-object-status-token" } },
      { employmentStatus: "active\nsecret-people-employee-patch-control-status-token" },
      { employmentStatus: "ghost-secret-people-employee-patch-status-token" },
      ["secret-people-employee-patch-array-body-token"]
    ];

    const rejectedPatchNull = await app.inject({
      method: "PATCH",
      url: "/api/people/employees/emp-davit",
      headers: { cookie: owner, "content-type": "application/json" },
      payload: "null"
    });
    assert.strictEqual(rejectedPatchNull.statusCode, 400, rejectedPatchNull.body);

    for (const payload of malformedPatches) {
      const rejected = await app.inject({
        method: "PATCH",
        url: "/api/people/employees/emp-davit",
        headers: { cookie: owner },
        payload
      });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
      assert.doesNotMatch(rejected.body, /secret-people-employee-/);
    }

    assert.strictEqual(employeeCount(), employeeCountBefore);
    assert.strictEqual(employeeSecretCount(), 0);
    assert.strictEqual(createdAuditCount(), createdAuditCountBefore);
    assert.strictEqual(updatedAuditCount(), updatedAuditCountBefore);
    assert.deepStrictEqual(getDavit(), davitBefore);

    const created = await app.inject({
      method: "POST",
      url: "/api/people/employees",
      headers: { cookie: owner },
      payload: { ...baseCreate, fullName: "Վավեր Աշխատակից", grossSalary: "810000" }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    assert.strictEqual(created.json().employee.fullName, "Վավեր Աշխատակից");
    assert.strictEqual(created.json().employee.grossSalary, 810000);

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/people/employees/emp-davit",
      headers: { cookie: owner },
      payload: { position: "Senior Accountant", grossSalary: "920000", employmentStatus: "on-leave" }
    });
    assert.strictEqual(patched.statusCode, 200, patched.body);
    assert.strictEqual(patched.json().employee.position, "Senior Accountant");
    assert.strictEqual(patched.json().employee.grossSalary, 920000);
    assert.strictEqual(patched.json().employee.employmentStatus, "on-leave");
  } finally { await app.close(); }
});

test("people-hr: malformed employee path ids are rejected before payroll side effects", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;

    const counts = () => ({
      employees: app.db.prepare("SELECT COUNT(*) AS count FROM people_employees WHERE org_id = ?").get(orgId).count,
      payrollRuns: app.db.prepare("SELECT COUNT(*) AS count FROM payroll_runs WHERE org_id = ?").get(orgId).count,
      ledgerRows: app.db.prepare("SELECT COUNT(*) AS count FROM ledger_journal WHERE org_id = ?").get(orgId).count,
      peopleAudits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get(orgId, "people.%").count,
      payrollAudits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type = ?").get(orgId, "payroll.run.posted").count
    });
    const davitRow = () => app.db.prepare(`
      SELECT position, department, gross_salary AS grossSalary, employment_status AS employmentStatus, email
      FROM people_employees
      WHERE org_id = ? AND id = ?
    `).get(orgId, "emp-davit");
    const before = counts();
    const beforeDavit = davitRow();

    const expectRejected = async ({ method, url, payload, statusCode = 400, statusCodes }) => {
      const request = { method, url, headers: { cookie: owner } };
      if (payload !== undefined) request.payload = payload;
      const response = await app.inject(request);
      const allowedStatuses = statusCodes || [statusCode];
      assert.ok(allowedStatuses.includes(response.statusCode), `${url}: ${response.body}`);
      if (response.statusCode === 400) {
        assert.match(response.body, /Invalid employee id/);
      }
      assert.doesNotMatch(response.body, /secret-people-path-/);
      assert.deepStrictEqual(counts(), before);
      assert.deepStrictEqual(davitRow(), beforeDavit);
    };

    for (const request of [
      { method: "PATCH", url: "/api/people/employees/badAsecret-people-path-patch-id-token", payload: { position: "secret-people-path-patch-body-token" } },
      { method: "POST", url: "/api/people/employees/bad_secret-people-path-payroll-id-token/run-payroll", payload: { runDate: "2099-03-15", token: "secret-people-path-payroll-body-token" } },
      { method: "GET", url: "/api/people/employees/badAsecret-people-path-history-id-token/payroll-runs" },
      { method: "PATCH", url: `/api/people/employees/${"a".repeat(161)}`, payload: { position: "secret-people-path-overlong-body-token" }, statusCodes: [400, 404] },
      { method: "POST", url: "/api/people/employees/bad%0Asecret-people-path-control-id-token/run-payroll", payload: { runDate: "2099-03-15" }, statusCodes: [400, 404] },
      { method: "GET", url: "/api/people/employees/%20%20/payroll-runs", statusCodes: [400, 404] }
    ]) {
      await expectRejected(request);
    }

    for (const request of [
      { method: "PATCH", url: "/api/people/employees/emp-missing", payload: { position: "secret-people-path-missing-patch-body-token" }, statusCode: 404 },
      { method: "POST", url: "/api/people/employees/emp-missing/run-payroll", payload: { runDate: "2099-03-15", token: "secret-people-path-missing-payroll-body-token" }, statusCode: 404 },
      { method: "GET", url: "/api/people/employees/emp-missing/payroll-runs", statusCode: 404 }
    ]) {
      await expectRejected(request);
    }

    const patched = await app.inject({
      method: "PATCH",
      url: "/api/people/employees/emp-davit",
      headers: { cookie: owner },
      payload: { position: "Path Guarded Accountant" }
    });
    assert.strictEqual(patched.statusCode, 200, patched.body);
    assert.strictEqual(patched.json().employee.position, "Path Guarded Accountant");

    const run = await app.inject({
      method: "POST",
      url: "/api/people/employees/emp-davit/run-payroll",
      headers: { cookie: owner },
      payload: { runDate: "2099-03-15" }
    });
    assert.strictEqual(run.statusCode, 200, run.body);
    assert.strictEqual(run.json().run.employeeId, "emp-davit");

    const history = await app.inject({
      method: "GET",
      url: "/api/people/employees/emp-davit/payroll-runs",
      headers: { cookie: owner }
    });
    assert.strictEqual(history.statusCode, 200, history.body);
    assert.ok(history.json().runs.some(r => r.employeeId === "emp-davit"));
  } finally { await app.close(); }
});

test("people-hr: cross-org isolation — a foreign employee is invisible (404, not 403)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Resolve the demo owner's org so we can seed a SEPARATE tenant.
    const ownerOrgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;

    // Seed a second org (FK enforcement is ON) and an employee that belongs to it.
    const now = new Date().toISOString();
    const otherOrgId = "org-other-tenant";
    app.db.prepare(`INSERT INTO organizations (id, name, legal_name, tax_id, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(otherOrgId, "Other Tenant LLC", "Other Tenant LLC", "99999999", "AMD", now);
    const foreignId = "emp-foreign-1";
    app.db.prepare(`INSERT INTO people_employees (id, org_id, full_name, tax_id, position, department, gross_salary, employment_status, hire_date, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(foreignId, otherOrgId, "Foreign Employee", "", "", "", 500000, "active", "", "", now, now);

    // The foreign employee must NOT appear in the owner's registry.
    const list = (await app.inject({ method: "GET", url: "/api/people/employees", headers: { cookie: owner } })).json();
    assert.ok(!list.employees.some(e => e.id === foreignId), "foreign employee leaked into owner registry");

    // PATCH a foreign employee -> 404 (resource invisible), NOT 403 (which would leak existence).
    const patch = await app.inject({ method: "PATCH", url: `/api/people/employees/${foreignId}`, headers: { cookie: owner }, payload: { position: "x" } });
    assert.strictEqual(patch.statusCode, 404);

    // run-payroll for a foreign employee -> 404 (cannot be scheduled across tenants).
    const run = await app.inject({ method: "POST", url: `/api/people/employees/${foreignId}/run-payroll`, headers: { cookie: owner }, payload: { runDate: "2099-04-15" } });
    assert.strictEqual(run.statusCode, 404);

    // Sanity: the foreign row still exists in its own tenant (we proved isolation, not deletion).
    const stillThere = app.db.prepare("SELECT org_id FROM people_employees WHERE id = ?").get(foreignId);
    assert.strictEqual(stillThere.org_id, otherOrgId);
    assert.notStrictEqual(otherOrgId, ownerOrgId);
  } finally { await app.close(); }
});

test("people-hr: payroll respects a closed finance period (409 PERIOD_LOCKED)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const orgId = app.db.prepare("SELECT org_id FROM users WHERE email = ?").get(DEFAULT_EMAIL).org_id;

    // Pick an open finance period and an active employee from the same tenant.
    const openPeriod = app.db.prepare("SELECT period_key FROM finance_periods WHERE org_id = ? AND status='open' LIMIT 1").get(orgId).period_key;
    const list = (await app.inject({ method: "GET", url: "/api/people/employees", headers: { cookie: owner } })).json();
    const employee = list.employees.find(e => e.employmentStatus === "active");
    assert.ok(employee, "an active seeded employee is available");

    // A run date inside the open period succeeds first (control).
    const runDate = `${openPeriod}-15`;
    const ok = await app.inject({ method: "POST", url: `/api/people/employees/${employee.id}/run-payroll`, headers: { cookie: owner }, payload: { runDate } });
    assert.strictEqual(ok.statusCode, 200);

    // Close that period, then a run dated inside it must be rejected with 409.
    const close = await app.inject({ method: "POST", url: `/api/finance/periods/${openPeriod}/close`, headers: { cookie: owner }, payload: { reason: "test close" } });
    assert.strictEqual(close.statusCode, 200);
    const locked = await app.inject({ method: "POST", url: `/api/people/employees/${employee.id}/run-payroll`, headers: { cookie: owner }, payload: { runDate } });
    assert.strictEqual(locked.statusCode, 409);
  } finally { await app.close(); }
});
