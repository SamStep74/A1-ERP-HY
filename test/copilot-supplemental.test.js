"use strict";

// Pure unit tests for the opt-in Open Notebook "supplemental sources" channel.
//
// Compliance invariant under test: supplemental (Open Notebook) results are
// advisory-only. They are surfaced in the packet but MUST NOT enter the
// curated law-* citation set, change `status`/`sourceReady`, or move
// `confidence`. Only professionally-reviewed legal sources are authoritative.

const test = require("node:test");
const assert = require("node:assert");
const copilot = require("../server/copilot");

const baseInput = (extra = {}) => ({
  id: "copilot-test",
  intent: "vat",
  question: "Կարո՞ղ ենք պատրաստել հայկական ԱԱՀ ուղեցույց 2026-05 ժամանակաշրջանի համար:",
  citations: [],
  calculations: [],
  context: {},
  now: "2026-06-04T00:00:00.000Z",
  ...extra
});

// --- normalizeSupplementalSources: the merge/ranking policy -------------------

test("normalizeSupplementalSources returns [] for non-array / empty input", () => {
  assert.deepStrictEqual(copilot.normalizeSupplementalSources(undefined), []);
  assert.deepStrictEqual(copilot.normalizeSupplementalSources(null), []);
  assert.deepStrictEqual(copilot.normalizeSupplementalSources("nope"), []);
  assert.deepStrictEqual(copilot.normalizeSupplementalSources([]), []);
});

test("normalizeSupplementalSources drops rows with no usable text", () => {
  const out = copilot.normalizeSupplementalSources([
    { title: "Empty", text: "   ", score: 0.9 },
    { title: "Good", text: "ԱԱՀ դրույքաչափը 20% է:", score: 0.5 }
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].title, "Good");
});

test("normalizeSupplementalSources sorts by score desc and caps to MAX_SUPPLEMENTAL_SOURCES", () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ title: `N${i}`, text: `chunk ${i}`, score: i / 10 }));
  const out = copilot.normalizeSupplementalSources(rows);
  assert.strictEqual(out.length, copilot.MAX_SUPPLEMENTAL_SOURCES);
  assert.strictEqual(out[0].title, "N7", "highest score first");
  assert.ok(out[0].score >= out[1].score);
});

test("normalizeSupplementalSources dedupes by sourceUrl, keeping the highest score", () => {
  const out = copilot.normalizeSupplementalSources([
    { title: "Low copy", text: "b", score: 0.2, sourceUrl: "https://nb.a1.am/n/7" },
    { title: "High copy", text: "a", score: 0.9, sourceUrl: "https://nb.a1.am/n/7" }
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].title, "High copy");
});

test("normalizeSupplementalSources dedupes by title when no sourceUrl (case/space-insensitive)", () => {
  const out = copilot.normalizeSupplementalSources([
    { title: "VAT Guide", text: "a", score: 0.9 },
    { title: "  vat guide ", text: "b", score: 0.8 }
  ]);
  assert.strictEqual(out.length, 1);
});

test("normalizeSupplementalSources tags rows advisory/open-notebook and truncates the excerpt", () => {
  const long = "ա".repeat(600);
  const out = copilot.normalizeSupplementalSources([{ title: "Long", text: long, score: 1, sourceUrl: "https://nb.a1.am/n/1" }]);
  assert.strictEqual(out[0].origin, "open-notebook");
  assert.strictEqual(out[0].advisory, true);
  assert.strictEqual(out[0].sourceUrl, "https://nb.a1.am/n/1");
  assert.ok(out[0].excerpt.length <= 300, "excerpt truncated to a snippet");
});

// --- buildCopilotPacket: supplemental channel must not touch the legal gate ---

test("packet always carries a supplementalSources array (empty when none provided)", () => {
  const packet = copilot.buildCopilotPacket(baseInput());
  assert.deepStrictEqual(packet.supplementalSources, []);
});

test("supplemental sources surface in the packet but never change gating, citations, or confidence", () => {
  const supplemental = [
    { title: "Practitioner note", text: "Discussion of Armenian VAT timing.", score: 0.7, sourceUrl: "https://nb.a1.am/n/1" }
  ];
  const without = copilot.buildCopilotPacket(baseInput());
  const withSupp = copilot.buildCopilotPacket(baseInput({ supplementalSources: supplemental }));

  // VAT with no curated law-* citation is blocked; supplemental must NOT unblock it.
  assert.strictEqual(without.status, "blocked-missing-citation");
  assert.strictEqual(withSupp.status, "blocked-missing-citation");
  // confidence + curated citations channel are identical
  assert.strictEqual(withSupp.confidence, without.confidence);
  assert.deepStrictEqual(withSupp.citations, without.citations);
  // supplemental is surfaced and clearly labeled
  assert.strictEqual(withSupp.supplementalSources.length, 1);
  assert.strictEqual(withSupp.supplementalSources[0].origin, "open-notebook");
  assert.strictEqual(withSupp.supplementalSources[0].advisory, true);
  // the advisory note is woven into the answer, but the authoritative citations line is unchanged
  assert.ok(withSupp.answer.includes("Practitioner note"));
  assert.ok(!without.answer.includes("Practitioner note"));
});

test("a law-like supplemental title can never satisfy the legal citation requirement", () => {
  const supplemental = [{ title: "law-tax-code", text: "not authoritative", score: 1 }];
  const packet = copilot.buildCopilotPacket(baseInput({ intent: "vat", supplementalSources: supplemental }));
  assert.strictEqual(packet.status, "blocked-missing-citation");
  assert.strictEqual(packet.citations.length, 0);
});
