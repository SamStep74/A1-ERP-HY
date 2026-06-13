import test from "node:test";
import assert from "node:assert/strict";
import { canReadAudit, loadAuditForRole } from "../web/src/audit-access.js";

test("canReadAudit allows only global audit-reader roles", () => {
  assert.equal(canReadAudit("Owner"), true);
  assert.equal(canReadAudit("Admin"), true);
  assert.equal(canReadAudit("Auditor"), true);
  assert.equal(canReadAudit("Support"), false);
  assert.equal(canReadAudit("Accountant"), false);
  assert.equal(canReadAudit("Service Manager"), false);
  assert.equal(canReadAudit("Salesperson"), false);
  assert.equal(canReadAudit("Lawyer"), false);
});

test("loadAuditForRole does not call the audit fetcher for non-audit roles", async () => {
  let calls = 0;
  const data = await loadAuditForRole("Support", async () => {
    calls += 1;
    return { events: [{ type: "should-not-load" }] };
  });
  assert.deepEqual(data, { events: [] });
  assert.equal(calls, 0);
});

test("loadAuditForRole calls the audit fetcher for audit-reader roles", async () => {
  let calls = 0;
  const data = await loadAuditForRole("Admin", async () => {
    calls += 1;
    return { events: [{ type: "auth.login" }] };
  });
  assert.deepEqual(data, { events: [{ type: "auth.login" }] });
  assert.equal(calls, 1);
});
