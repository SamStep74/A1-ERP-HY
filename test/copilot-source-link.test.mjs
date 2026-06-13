import test from "node:test";
import assert from "node:assert/strict";
import { formatSourceDate, getSourceLink } from "../web/src/copilot-source.js";

test("getSourceLink returns safe external link metadata for HTTP(S) sources", () => {
  assert.deepEqual(getSourceLink({ sourceUrl: " https://www.arlis.am/hy/acts/224990 " }), {
    href: "https://www.arlis.am/hy/acts/224990",
    host: "arlis.am"
  });
  assert.deepEqual(getSourceLink({ sourceUrl: "http://www.cba.am/source.pdf" }), {
    href: "http://www.cba.am/source.pdf",
    host: "cba.am"
  });
});

test("getSourceLink rejects missing, malformed, and non-HTTP source URLs", () => {
  assert.equal(getSourceLink({ sourceUrl: "" }), null);
  assert.equal(getSourceLink({ sourceUrl: "not a url" }), null);
  assert.equal(getSourceLink({ sourceUrl: "javascript:alert(1)" }), null);
  assert.equal(getSourceLink({ sourceUrl: "file:///tmp/source.pdf" }), null);
  assert.equal(getSourceLink({ sourceUrl: "https://reviewer:secret@arlis.am/hy/acts/224990" }), null);
});

test("formatSourceDate prefers latest review creation date before source effective date", () => {
  assert.equal(formatSourceDate({ latestReview: { createdAt: "2026-06-01T09:30:00.000Z" }, effectiveDate: "2024-06-12" }), "2026-06-01");
  assert.equal(formatSourceDate({ latestReview: { reviewedAt: "2026-06-02T10:30:00.000Z" }, effectiveDate: "2024-06-12" }), "2026-06-02");
  assert.equal(formatSourceDate({ effectiveDate: "2024-06-12" }), "2024-06-12");
  assert.equal(formatSourceDate({}), "առանց ամսաթվի");
});
