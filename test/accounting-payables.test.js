"use strict";
// Characterization tests for the accounts-payable aging logic in server/accounting.js.
// calculatePayables mirrors calculateReceivables over supplier bills, but with one critical
// asymmetry pinned here: AP does NOT exclude draft bills (AR does). These lock the exact engine
// behavior (verified live) so a future "harmonize AR/AP" refactor can't silently drop payables.
// Pure engine: require the module directly, no server/app.js, no DB.
const test = require("node:test");
const assert = require("node:assert");
const accounting = require("../server/accounting");

const { calculatePayables } = accounting;

test("accounting-payables: roll-up totals, paid separation, and aging buckets", () => {
  const account = {
    bills: [
      // 48 days overdue as of 2026-02-01 (due 2025-12-15) → days31To60
      { id: "b1", supplier: "S1", total: 1000, status: "open", date: "2025-12-01", dueDate: "2025-12-15" },
      // not yet due (due 2026-02-15) → current
      { id: "b2", supplier: "S2", total: 500, status: "open", date: "2026-01-20", dueDate: "2026-02-15" },
      // fully paid → counted as paid, not open
      { id: "b3", supplier: "S3", total: 800, status: "paid", date: "2025-11-01", dueDate: "2025-11-15" },
    ],
  };
  const r = calculatePayables(account, { asOf: "2026-02-01" });

  assert.strictEqual(r.billCount, 3);
  assert.strictEqual(r.openCount, 2, "the paid bill is not open");
  assert.strictEqual(r.totalBilled, 2300);
  assert.strictEqual(r.totalPaid, 800);
  assert.strictEqual(r.totalOutstanding, 1500);
  assert.strictEqual(r.overdueOutstanding, 1000, "only b1 is past due");
  assert.deepStrictEqual(
    r.aging,
    { current: 500, days1To30: 0, days31To60: 1000, days61To90: 0, over90: 0 },
    "b2 current, b1 days31To60"
  );
});

test("accounting-payables: AP includes draft bills (the deliberate asymmetry vs AR)", () => {
  // AR's calculateReceivables filters out status==='draft'; calculatePayables does NOT.
  // A draft supplier bill is a real obligation to track, so it must count in AP.
  const account = {
    bills: [
      { id: "b1", supplier: "S1", total: 1000, status: "open", date: "2025-12-01", dueDate: "2025-12-15" },
      // draft, 8 days overdue as of 2026-02-01 (due 2026-01-24) → days1To30, still counted
      { id: "draft1", supplier: "S2", total: 600, status: "draft", date: "2026-01-10", dueDate: "2026-01-24" },
    ],
  };
  const r = calculatePayables(account, { asOf: "2026-02-01" });

  assert.strictEqual(r.billCount, 2, "draft bill is NOT excluded from AP");
  assert.strictEqual(r.openCount, 2, "the draft is open (has outstanding)");
  assert.ok(r.openBills.some((b) => b.id === "draft1"), "draft bill appears in openBills");
  assert.strictEqual(r.totalBilled, 1600, "draft 600 counts toward totalBilled");
  assert.strictEqual(r.aging.days1To30, 600, "the draft's 600 lands in days1To30");
  assert.strictEqual(r.aging.days31To60, 1000, "the open bill in days31To60");
  assert.strictEqual(r.overdueOutstanding, 1600, "both are past due → full overdue exposure");
});

test("accounting-payables: a partially-paid bill carries only its remaining outstanding", () => {
  const account = {
    bills: [
      { id: "b1", supplier: "S1", total: 1000, status: "open", date: "2025-12-01", dueDate: "2025-12-15", paidAmount: 400 },
    ],
  };
  const r = calculatePayables(account, { asOf: "2026-02-01" });
  assert.strictEqual(r.totalBilled, 1000);
  assert.strictEqual(r.totalPaid, 400);
  assert.strictEqual(r.totalOutstanding, 600, "only the unpaid remainder is outstanding");
  assert.strictEqual(r.openCount, 1);
});

test("accounting-payables: empty or missing bills yields a fully-zero AP snapshot", () => {
  for (const account of [{ bills: [] }, {}]) {
    const r = calculatePayables(account, { asOf: "2026-02-01" });
    assert.strictEqual(r.billCount, 0);
    assert.strictEqual(r.openCount, 0);
    assert.strictEqual(r.totalBilled, 0);
    assert.strictEqual(r.totalOutstanding, 0);
    assert.strictEqual(r.overdueOutstanding, 0);
    assert.deepStrictEqual(r.aging, { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, over90: 0 });
  }
});
