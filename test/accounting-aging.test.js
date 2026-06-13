"use strict";
// Characterization tests for the accounts-receivable / aging logic in server/accounting.js.
// AR aging drives collections, overdue exposure and the owner dashboard, so the bucket edges
// and the paid/outstanding fallbacks are high-stakes. These pin the EXACT engine behavior
// (verified against the live module) so a refactor can't silently misclassify an invoice.
// Pure engine: require the module directly, no server/app.js, no DB.
const test = require("node:test");
const assert = require("node:assert");
const accounting = require("../server/accounting");

const {
  agingBucket,
  calculateDaysPastDue,
  invoicePaidAmount,
  invoiceOutstanding,
  calculateReceivables,
} = accounting;

test("accounting-aging: bucket edges are inclusive-lower (0/1, 30/31, 60/61, 90/91)", () => {
  assert.strictEqual(agingBucket(-5), "current", "negative days = current");
  assert.strictEqual(agingBucket(0), "current", "0 days = current");
  assert.strictEqual(agingBucket(1), "days1To30", "1 day past due");
  assert.strictEqual(agingBucket(30), "days1To30", "30 is still the first bucket");
  assert.strictEqual(agingBucket(31), "days31To60", "31 flips to the second bucket");
  assert.strictEqual(agingBucket(60), "days31To60");
  assert.strictEqual(agingBucket(61), "days61To90");
  assert.strictEqual(agingBucket(90), "days61To90");
  assert.strictEqual(agingBucket(91), "over90", "91 flips to over90");
  assert.strictEqual(agingBucket(3650), "over90");
});

test("accounting-aging: days-past-due floors at 0, is UTC-stable, and tolerates garbage", () => {
  assert.strictEqual(calculateDaysPastDue("2026-01-01", "2026-01-01"), 0, "due today = 0");
  assert.strictEqual(calculateDaysPastDue("2026-01-01", "2026-01-31"), 30, "exact day count");
  assert.strictEqual(calculateDaysPastDue("2026-02-01", "2026-01-01"), 0, "not yet due never negative");
  assert.strictEqual(calculateDaysPastDue("not-a-date", "2026-01-01"), 0, "unparseable due date → 0");
  // ISO datetime inputs are sliced to the date — no timezone drift across the day boundary.
  assert.strictEqual(calculateDaysPastDue("2026-01-01T23:59:59Z", "2026-01-02T00:00:01Z"), 1);
});

test("accounting-aging: paid-amount fallback chain (explicit → payments[] → status=paid → 0)", () => {
  assert.strictEqual(invoicePaidAmount({ total: 1000, paidAmount: 300 }), 300, "explicit paidAmount wins");
  assert.strictEqual(invoicePaidAmount({ total: 1000, payments: [{ amount: 200 }, { amount: 150 }] }), 350, "sum of payments[]");
  assert.strictEqual(invoicePaidAmount({ total: 1000, status: "paid" }), 1000, "status=paid with no amounts → full total");
  assert.strictEqual(invoicePaidAmount({ total: 1000, status: "sent" }), 0, "open invoice with no payment data → 0");
  assert.strictEqual(invoicePaidAmount({ total: 1000, paidAmount: -50 }), 0, "negative paidAmount floors at 0");
});

test("accounting-aging: outstanding is never negative even when overpaid", () => {
  assert.strictEqual(invoiceOutstanding({ total: 1000, paidAmount: 1200 }), 0, "overpayment → 0, not negative");
  assert.strictEqual(invoiceOutstanding({ total: 1000, paidAmount: 400 }), 600);
  assert.strictEqual(invoiceOutstanding({ total: 1000, status: "paid" }), 0, "fully-paid status → 0 outstanding");
});

test("accounting-aging: calculateReceivables excludes drafts, separates paid, and buckets open invoices", () => {
  const account = {
    invoices: [
      // 48 days overdue as of 2026-02-01 (due 2025-12-15) → days31To60
      { id: "i1", customer: "A", total: 1000, status: "sent", date: "2025-12-01", dueDate: "2025-12-15" },
      // not yet due (due 2026-02-15) → current
      { id: "i2", customer: "B", total: 500, status: "sent", date: "2026-01-20", dueDate: "2026-02-15" },
      // fully paid → counted as paid, not open
      { id: "i3", customer: "C", total: 800, status: "paid", date: "2025-11-01", dueDate: "2025-11-15" },
      // draft → excluded from AR entirely
      { id: "i4", customer: "D", total: 600, status: "draft", date: "2026-01-10", dueDate: "2026-01-24" },
    ],
  };
  const r = calculateReceivables(account, { asOf: "2026-02-01" });

  assert.strictEqual(r.invoiceCount, 3, "draft is excluded from the invoice set");
  assert.strictEqual(r.openCount, 2, "only the two unpaid non-drafts are open");
  assert.strictEqual(r.totalInvoiced, 2300, "1000 + 500 + 800 (excludes the 600 draft)");
  assert.strictEqual(r.totalPaid, 800, "the paid invoice contributes to totalPaid");
  assert.strictEqual(r.totalOutstanding, 1500, "1000 + 500 open");
  assert.strictEqual(r.overdueOutstanding, 1000, "only i1 is past due");
  assert.deepStrictEqual(
    r.aging,
    { current: 500, days1To30: 0, days31To60: 1000, days61To90: 0, over90: 0 },
    "i2 in current, i1 in days31To60, nothing elsewhere"
  );
  // The not-yet-due invoice carries 0 days past due and the current bucket.
  const i2 = r.openInvoices.find((x) => x.id === "i2");
  assert.strictEqual(i2.daysPastDue, 0);
  assert.strictEqual(i2.agingBucket, "current");
});

test("accounting-aging: an empty account yields a fully-zero AR snapshot", () => {
  const r = calculateReceivables({ invoices: [] }, { asOf: "2026-02-01" });
  assert.strictEqual(r.invoiceCount, 0);
  assert.strictEqual(r.openCount, 0);
  assert.strictEqual(r.totalOutstanding, 0);
  assert.strictEqual(r.overdueOutstanding, 0);
  assert.deepStrictEqual(r.aging, { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, over90: 0 });
});
