"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("projects: full hierarchy — project + task + milestone + time entry with rollups", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();

    const unauth = await app.inject({ method: "GET", url: "/api/projects" });
    assert.strictEqual(unauth.statusCode, 401);

    const owner = await login(app);
    const seeded = (await app.inject({ method: "GET", url: "/api/projects", headers: { cookie: owner } })).json();
    assert.ok(Array.isArray(seeded.projects) && seeded.projects.length >= 2, "seeded projects present");
    const nare = seeded.projects.find(p => p.id === "proj-nare-retention");
    assert.ok(nare, "seeded Նարե project present");
    assert.strictEqual(nare.taskTotal, 2, "rollup: 2 seeded tasks");
    assert.strictEqual(nare.totalMinutes, 180, "rollup: 180 seeded minutes");

    // Create a project linked to a customer + deal
    const created = await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: owner },
      payload: { name: "Նոր առաքման նախագիծ", customerId: "cust-ani", dealId: "deal-ani-inbox", status: "active", dueDate: "2026-08-01" } });
    assert.strictEqual(created.statusCode, 200);
    const projId = created.json().project.id;
    assert.strictEqual(created.json().project.status, "active");
    assert.strictEqual(created.json().project.customerId, "cust-ani");
    assert.strictEqual(created.json().project.dealId, "deal-ani-inbox");

    // Name too short -> 400
    const badName = await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: owner }, payload: { name: "x" } });
    assert.strictEqual(badName.statusCode, 400);

    // Unknown linked deal -> 400
    const badDeal = await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: owner }, payload: { name: "Bad deal link", dealId: "deal-nope" } });
    assert.strictEqual(badDeal.statusCode, 400);

    // Add a task, assign to a seeded employee
    const taskRes = await app.inject({ method: "POST", url: `/api/projects/${projId}/tasks`, headers: { cookie: owner },
      payload: { title: "Կարգավորել ալիքները", assigneeEmployeeId: "emp-davit", dueDate: "2026-07-10" } });
    assert.strictEqual(taskRes.statusCode, 200);
    const taskId = taskRes.json().project.tasks[0].id;
    assert.strictEqual(taskRes.json().project.tasks[0].assigneeEmployeeId, "emp-davit");

    // Bad assignee -> 400
    const badAssignee = await app.inject({ method: "POST", url: `/api/projects/${projId}/tasks`, headers: { cookie: owner }, payload: { title: "x task", assigneeEmployeeId: "emp-nope" } });
    assert.strictEqual(badAssignee.statusCode, 400);

    // Move the task to done
    const taskDone = await app.inject({ method: "PATCH", url: `/api/projects/${projId}/tasks/${taskId}`, headers: { cookie: owner }, payload: { status: "done" } });
    assert.strictEqual(taskDone.statusCode, 200);
    assert.strictEqual(taskDone.json().project.tasks.find(t => t.id === taskId).status, "done");

    // Add a milestone, then reach it
    const msRes = await app.inject({ method: "POST", url: `/api/projects/${projId}/milestones`, headers: { cookie: owner }, payload: { title: "Արձակում", dueDate: "2026-07-20" } });
    assert.strictEqual(msRes.statusCode, 200);
    const msId = msRes.json().project.milestones[0].id;
    const msReached = await app.inject({ method: "PATCH", url: `/api/projects/${projId}/milestones/${msId}`, headers: { cookie: owner }, payload: { reached: true } });
    assert.strictEqual(msReached.json().project.milestones.find(m => m.id === msId).reached, 1);

    // Log time against the task
    const timeRes = await app.inject({ method: "POST", url: `/api/projects/${projId}/time-entries`, headers: { cookie: owner }, payload: { minutes: 90, taskId, note: "Setup", entryDate: "2026-06-01" } });
    assert.strictEqual(timeRes.statusCode, 200);
    assert.strictEqual(timeRes.json().project.totalMinutes, 90);

    // Zero/negative minutes -> 400
    const badTime = await app.inject({ method: "POST", url: `/api/projects/${projId}/time-entries`, headers: { cookie: owner }, payload: { minutes: 0 } });
    assert.strictEqual(badTime.statusCode, 400);

    // Rollups reflect in the list
    const list2 = (await app.inject({ method: "GET", url: "/api/projects", headers: { cookie: owner } })).json();
    const mine = list2.projects.find(p => p.id === projId);
    assert.strictEqual(mine.taskTotal, 1);
    assert.strictEqual(mine.taskDone, 1);
    assert.strictEqual(mine.milestoneReached, 1);
    assert.strictEqual(mine.totalMinutes, 90);
  } finally { await app.close(); }
});

test("projects: rejects malformed metadata before persistence", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const counts = () => ({
      projects: app.db.prepare("SELECT COUNT(*) AS count FROM projects WHERE org_id = ?").get("org-armosphera-demo").count,
      tasks: app.db.prepare("SELECT COUNT(*) AS count FROM project_tasks WHERE org_id = ?").get("org-armosphera-demo").count,
      milestones: app.db.prepare("SELECT COUNT(*) AS count FROM project_milestones WHERE org_id = ?").get("org-armosphera-demo").count,
      timeEntries: app.db.prepare("SELECT COUNT(*) AS count FROM project_time_entries WHERE org_id = ?").get("org-armosphera-demo").count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get("org-armosphera-demo", "projects.%").count
    });
    const expectRejected = async (method, url, payload) => {
      const response = await app.inject({ method, url, headers: { cookie: owner }, payload });
      assert.strictEqual(response.statusCode, 400, response.body);
      assert.doesNotMatch(response.body, /secret-projects-/);
    };

    const beforeProjectRejects = counts();
    for (const payload of [
      ["secret-projects-array-body-token"],
      { name: { value: "Project", token: "secret-projects-object-name-token" } },
      { name: `${"P".repeat(201)}secret-projects-long-name-token` },
      { name: "Valid project", description: "Bad\nsecret-projects-control-description-token" },
      { name: "Valid project", description: `${"D".repeat(4001)}secret-projects-long-description-token` },
      { name: "Valid project", status: { value: "active", token: "secret-projects-object-status-token" } },
      { name: "Valid project", status: "ghost-secret-projects-status-token" },
      { name: "Valid project", customerId: ["cust-ani", "secret-projects-customer-array-token"] },
      { name: "Valid project", dealId: { value: "deal-ani-inbox", token: "secret-projects-object-deal-token" } },
      { name: "Valid project", startDate: "2026-02-30" },
      { name: "Valid project", dueDate: "2026-06-01\nsecret-projects-control-due-token" }
    ]) {
      await expectRejected("POST", "/api/projects", payload);
    }
    assert.deepStrictEqual(counts(), beforeProjectRejects);

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: owner },
      payload: { name: "Governed project metadata", status: "active", dueDate: "2026-08-01" }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    const projectId = created.json().project.id;
    const afterProjectCreate = counts();

    for (const payload of [
      ["secret-projects-array-patch-token"],
      { name: { value: "Renamed project", token: "secret-projects-object-patch-name-token" } },
      { description: "Bad\nsecret-projects-control-patch-description-token" },
      { status: "ghost-secret-projects-patch-status-token" },
      { status: "" },
      { dueDate: "2026-02-30" }
    ]) {
      await expectRejected("PATCH", `/api/projects/${projectId}`, payload);
    }
    assert.deepStrictEqual(counts(), afterProjectCreate);

    const clearedProject = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}`,
      headers: { cookie: owner },
      payload: { description: "", dueDate: "" }
    });
    assert.strictEqual(clearedProject.statusCode, 200, clearedProject.body);
    assert.strictEqual(clearedProject.json().project.description, "");
    assert.strictEqual(clearedProject.json().project.dueDate, "");

    const task = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks`,
      headers: { cookie: owner },
      payload: { title: "Valid task", status: "todo", dueDate: "2026-07-01" }
    });
    assert.strictEqual(task.statusCode, 200, task.body);
    const taskId = task.json().project.tasks[0].id;
    const afterTaskCreate = counts();

    for (const payload of [
      ["secret-projects-task-array-token"],
      { title: { value: "Task", token: "secret-projects-object-task-title-token" } },
      { title: `${"T".repeat(201)}secret-projects-long-task-title-token` },
      { title: "Valid task", status: "ghost-secret-projects-task-status-token" },
      { title: "Valid task", assigneeEmployeeId: { value: "emp-davit", token: "secret-projects-object-assignee-token" } },
      { title: "Valid task", dueDate: "2026-02-30" }
    ]) {
      await expectRejected("POST", `/api/projects/${projectId}/tasks`, payload);
    }
    for (const payload of [
      ["secret-projects-task-patch-array-token"],
      { title: "Bad\nsecret-projects-control-task-title-token" },
      { status: { value: "done", token: "secret-projects-object-task-status-token" } },
      { status: "" },
      { assigneeEmployeeId: ["emp-davit", "secret-projects-task-assignee-array-token"] },
      { dueDate: "2026-02-30" }
    ]) {
      await expectRejected("PATCH", `/api/projects/${projectId}/tasks/${taskId}`, payload);
    }
    assert.deepStrictEqual(counts(), afterTaskCreate);

    const clearedTask = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/tasks/${taskId}`,
      headers: { cookie: owner },
      payload: { assigneeEmployeeId: "", dueDate: "" }
    });
    assert.strictEqual(clearedTask.statusCode, 200, clearedTask.body);
    assert.strictEqual(clearedTask.json().project.tasks[0].assigneeEmployeeId, null);
    assert.strictEqual(clearedTask.json().project.tasks[0].dueDate, "");

    const milestone = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/milestones`,
      headers: { cookie: owner },
      payload: { title: "Valid milestone", dueDate: "2026-07-10" }
    });
    assert.strictEqual(milestone.statusCode, 200, milestone.body);
    const milestoneId = milestone.json().project.milestones[0].id;
    const afterMilestoneCreate = counts();

    for (const payload of [
      ["secret-projects-milestone-array-token"],
      { title: { value: "Milestone", token: "secret-projects-object-milestone-title-token" } },
      { title: `${"M".repeat(201)}secret-projects-long-milestone-title-token` },
      { title: "Valid milestone", dueDate: "2026-02-30" }
    ]) {
      await expectRejected("POST", `/api/projects/${projectId}/milestones`, payload);
    }
    for (const payload of [
      ["secret-projects-milestone-patch-array-token"],
      { title: "Bad\nsecret-projects-control-milestone-title-token" },
      { reached: "false" },
      { dueDate: "2026-02-30" }
    ]) {
      await expectRejected("PATCH", `/api/projects/${projectId}/milestones/${milestoneId}`, payload);
    }
    assert.deepStrictEqual(counts(), afterMilestoneCreate);

    const clearedMilestone = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}/milestones/${milestoneId}`,
      headers: { cookie: owner },
      payload: { dueDate: "" }
    });
    assert.strictEqual(clearedMilestone.statusCode, 200, clearedMilestone.body);
    assert.strictEqual(clearedMilestone.json().project.milestones[0].dueDate, "");

    const afterValidChildren = counts();
    for (const payload of [
      ["secret-projects-time-array-token"],
      { minutes: { value: 30, token: "secret-projects-object-minutes-token" } },
      { minutes: "NaN-secret-projects-minutes-token" },
      { minutes: 0.5 },
      { minutes: "44.6" },
      { minutes: 100001 },
      { minutes: 30, taskId: { value: taskId, token: "secret-projects-object-task-token" } },
      { minutes: 30, entryDate: "2026-02-30" },
      { minutes: 30, note: "Bad\nsecret-projects-control-time-note-token" },
      { minutes: 30, note: `${"N".repeat(1001)}secret-projects-long-time-note-token` }
    ]) {
      await expectRejected("POST", `/api/projects/${projectId}/time-entries`, payload);
    }
    assert.deepStrictEqual(counts(), afterValidChildren);

    const time = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/time-entries`,
      headers: { cookie: owner },
      payload: { minutes: "45", taskId, note: "Valid metadata after rejects", entryDate: "2026-06-02" }
    });
    assert.strictEqual(time.statusCode, 200, time.body);
    assert.strictEqual(time.json().project.totalMinutes, 45);
  } finally { await app.close(); }
});

test("projects: malformed path ids are rejected before lifecycle side effects", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: { cookie: owner },
      payload: { name: "Path guarded project", status: "active", dueDate: "2026-08-01" }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    const projectId = created.json().project.id;

    const task = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/tasks`,
      headers: { cookie: owner },
      payload: { title: "Path guarded task", dueDate: "2026-07-01" }
    });
    assert.strictEqual(task.statusCode, 200, task.body);
    const taskId = task.json().project.tasks[0].id;

    const milestone = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/milestones`,
      headers: { cookie: owner },
      payload: { title: "Path guarded milestone", dueDate: "2026-07-15" }
    });
    assert.strictEqual(milestone.statusCode, 200, milestone.body);
    const milestoneId = milestone.json().project.milestones[0].id;

    const counts = () => ({
      projects: app.db.prepare("SELECT COUNT(*) AS count FROM projects WHERE org_id = ?").get("org-armosphera-demo").count,
      tasks: app.db.prepare("SELECT COUNT(*) AS count FROM project_tasks WHERE org_id = ?").get("org-armosphera-demo").count,
      milestones: app.db.prepare("SELECT COUNT(*) AS count FROM project_milestones WHERE org_id = ?").get("org-armosphera-demo").count,
      timeEntries: app.db.prepare("SELECT COUNT(*) AS count FROM project_time_entries WHERE org_id = ?").get("org-armosphera-demo").count,
      audits: app.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE org_id = ? AND type LIKE ?").get("org-armosphera-demo", "projects.%").count
    });
    const projectRow = () => app.db.prepare("SELECT name, description, status, due_date AS dueDate FROM projects WHERE org_id = ? AND id = ?").get("org-armosphera-demo", projectId);
    const taskRow = () => app.db.prepare("SELECT title, status, due_date AS dueDate FROM project_tasks WHERE org_id = ? AND id = ?").get("org-armosphera-demo", taskId);
    const milestoneRow = () => app.db.prepare("SELECT title, reached, due_date AS dueDate FROM project_milestones WHERE org_id = ? AND id = ?").get("org-armosphera-demo", milestoneId);
    const before = counts();
    const beforeProject = projectRow();
    const beforeTask = taskRow();
    const beforeMilestone = milestoneRow();

    const expectRejected = async ({ method, url, payload, statusCode = 400, statusCodes, message = /Invalid project id/ }) => {
      const request = { method, url, headers: { cookie: owner } };
      if (payload !== undefined) request.payload = payload;
      const response = await app.inject(request);
      const allowedStatuses = statusCodes || [statusCode];
      assert.ok(allowedStatuses.includes(response.statusCode), `${url}: ${response.body}`);
      if (response.statusCode === 400) assert.match(response.body, message);
      assert.doesNotMatch(response.body, /secret-projects-path-/);
      assert.deepStrictEqual(counts(), before);
      assert.deepStrictEqual(projectRow(), beforeProject);
      assert.deepStrictEqual(taskRow(), beforeTask);
      assert.deepStrictEqual(milestoneRow(), beforeMilestone);
    };

    for (const request of [
      { method: "GET", url: "/api/projects/badAsecret-projects-path-read-id-token" },
      { method: "PATCH", url: "/api/projects/bad_secret-projects-path-patch-id-token", payload: { name: "secret-projects-path-patch-body-token" } },
      { method: "POST", url: "/api/projects/badAsecret-projects-path-task-parent-token/tasks", payload: { title: "secret-projects-path-task-body-token" } },
      { method: "POST", url: "/api/projects/bad_secret-projects-path-milestone-parent-token/milestones", payload: { title: "secret-projects-path-milestone-body-token" } },
      { method: "POST", url: "/api/projects/badAsecret-projects-path-time-parent-token/time-entries", payload: { minutes: 30, note: "secret-projects-path-time-body-token" } },
      { method: "GET", url: "/api/projects/bad_secret-projects-path-preview-parent-token/billing-preview?hourlyRate=10000" },
      { method: "POST", url: "/api/projects/badAsecret-projects-path-bill-parent-token/bill-time", payload: { hourlyRate: 10000, issueDate: "2026-05-15", token: "secret-projects-path-bill-body-token" } },
      { method: "GET", url: `/api/projects/${"a".repeat(161)}`, statusCodes: [400, 404] },
      { method: "POST", url: "/api/projects/bad%0Asecret-projects-path-control-parent-token/tasks", payload: { title: "secret-projects-path-encoded-task-body-token" } },
      { method: "POST", url: "/api/projects/%20%20/time-entries", payload: { minutes: 30, note: "secret-projects-path-encoded-time-body-token" } },
      { method: "PATCH", url: `/api/projects/${projectId}/tasks/badAsecret-projects-path-task-id-token`, payload: { status: "done" }, message: /Invalid project task id/ },
      { method: "PATCH", url: `/api/projects/${projectId}/tasks/bad%0Asecret-projects-path-task-control-token`, payload: { title: "secret-projects-path-task-encoded-body-token" }, message: /Invalid project task id/ },
      { method: "PATCH", url: `/api/projects/${projectId}/milestones/bad_secret-projects-path-milestone-id-token`, payload: { reached: true }, message: /Invalid project milestone id/ },
      { method: "PATCH", url: `/api/projects/${projectId}/milestones/%20%20`, payload: { title: "secret-projects-path-milestone-encoded-body-token" }, message: /Invalid project milestone id/ }
    ]) {
      await expectRejected(request);
    }

    for (const request of [
      { method: "GET", url: "/api/projects/proj-missing", statusCode: 404 },
      { method: "PATCH", url: "/api/projects/proj-missing", payload: { name: "secret-projects-path-missing-patch-body-token" }, statusCode: 404 },
      { method: "POST", url: "/api/projects/proj-missing/tasks", payload: { title: "secret-projects-path-missing-task-body-token" }, statusCode: 404 },
      { method: "POST", url: "/api/projects/proj-missing/milestones", payload: { title: "secret-projects-path-missing-milestone-body-token" }, statusCode: 404 },
      { method: "POST", url: "/api/projects/proj-missing/time-entries", payload: { minutes: 30, note: "secret-projects-path-missing-time-body-token" }, statusCode: 404 },
      { method: "GET", url: "/api/projects/proj-missing/billing-preview?hourlyRate=10000", statusCode: 404 },
      { method: "POST", url: "/api/projects/proj-missing/bill-time", payload: { hourlyRate: 10000, issueDate: "2026-05-15", token: "secret-projects-path-missing-bill-body-token" }, statusCode: 404 },
      { method: "PATCH", url: `/api/projects/${projectId}/tasks/ptask-missing`, payload: { status: "done" }, statusCode: 404 },
      { method: "PATCH", url: `/api/projects/${projectId}/milestones/pms-missing`, payload: { reached: true }, statusCode: 404 }
    ]) {
      await expectRejected(request);
    }

    const time = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/time-entries`,
      headers: { cookie: owner },
      payload: { minutes: 30, taskId, note: "Valid path guard proof", entryDate: "2026-06-03" }
    });
    assert.strictEqual(time.statusCode, 200, time.body);
    assert.strictEqual(time.json().project.totalMinutes, 30);
  } finally { await app.close(); }
});

test("projects: write-gate (Auditor 403) and cross-org isolation (404)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Auditor (read-only) cannot create -> 403
    const auditor = await login(app, "auditor@armosphera.local", DEFAULT_PASSWORD);
    const blocked = await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: auditor }, payload: { name: "Should fail" } });
    assert.strictEqual(blocked.statusCode, 403);

    // Cross-org: seed a foreign project, confirm it's invisible + 404 on detail/mutate
    const now = new Date().toISOString();
    const otherOrgId = "org-other-proj";
    app.db.prepare("INSERT INTO organizations (id, name, legal_name, tax_id, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(otherOrgId, "Other Proj LLC", "Other Proj LLC", "66666666", "AMD", now);
    const foreignId = "proj-foreign-1";
    app.db.prepare(`INSERT INTO projects (id, org_id, name, description, status, customer_id, deal_id, start_date, due_date, created_at, updated_at)
      VALUES (?, ?, ?, '', 'active', NULL, NULL, '', '', ?, ?)`).run(foreignId, otherOrgId, "Foreign project", now, now);

    const list = (await app.inject({ method: "GET", url: "/api/projects", headers: { cookie: owner } })).json();
    assert.ok(!list.projects.some(p => p.id === foreignId), "foreign project leaked into owner list");
    const get = await app.inject({ method: "GET", url: `/api/projects/${foreignId}`, headers: { cookie: owner } });
    assert.strictEqual(get.statusCode, 404);
    const addTask = await app.inject({ method: "POST", url: `/api/projects/${foreignId}/tasks`, headers: { cookie: owner }, payload: { title: "x" } });
    assert.strictEqual(addTask.statusCode, 404);
  } finally { await app.close(); }
});

test("projects: a child cannot be addressed under the wrong parent project (404)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const owner = await login(app);

    // Two sibling projects in the SAME org.
    const a = (await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: owner }, payload: { name: "Project Alpha" } })).json().project.id;
    const b = (await app.inject({ method: "POST", url: "/api/projects", headers: { cookie: owner }, payload: { name: "Project Beta" } })).json().project.id;

    // A task + milestone that belong to A.
    const taskA = (await app.inject({ method: "POST", url: `/api/projects/${a}/tasks`, headers: { cookie: owner }, payload: { title: "Alpha task" } })).json().project.tasks[0].id;
    const msA = (await app.inject({ method: "POST", url: `/api/projects/${a}/milestones`, headers: { cookie: owner }, payload: { title: "Alpha milestone" } })).json().project.milestones[0].id;

    // Addressing A's task under parent B must 404 — the child is scoped to its real parent,
    // so a mismatched :id/:taskId pair cannot mutate across projects.
    const wrongParentTask = await app.inject({ method: "PATCH", url: `/api/projects/${b}/tasks/${taskA}`, headers: { cookie: owner }, payload: { status: "done" } });
    assert.strictEqual(wrongParentTask.statusCode, 404);

    // Same for milestones.
    const wrongParentMs = await app.inject({ method: "PATCH", url: `/api/projects/${b}/milestones/${msA}`, headers: { cookie: owner }, payload: { reached: true } });
    assert.strictEqual(wrongParentMs.statusCode, 404);

    // And a time entry referencing A's task while posting under B must be rejected (not silently mislinked).
    const wrongParentTime = await app.inject({ method: "POST", url: `/api/projects/${b}/time-entries`, headers: { cookie: owner }, payload: { minutes: 30, taskId: taskA } });
    assert.ok([400, 404].includes(wrongParentTime.statusCode), `expected 400/404 for cross-project task link, got ${wrongParentTime.statusCode}`);

    // Control: the correct parent still works.
    const ok = await app.inject({ method: "PATCH", url: `/api/projects/${a}/tasks/${taskA}`, headers: { cookie: owner }, payload: { status: "done" } });
    assert.strictEqual(ok.statusCode, 200);
  } finally { await app.close(); }
});
