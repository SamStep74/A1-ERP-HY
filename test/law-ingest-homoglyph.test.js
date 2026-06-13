"use strict";
// TDD for homoglyph-tolerant article splitting in server/lawIngest.js.
// Real RA legal PDFs/OCR substitute Cyrillic о/в/д/а and Latin a for visually-identical
// Armenian ո/վ/դ/ա, silently breaking the exact-match "Հոդված N" splitter. We normalize
// homoglyphs FOR MARKER DETECTION ONLY — the stored chunk body must keep the ORIGINAL bytes
// (never alter the law's text), so a normalized-shadow approach is required.
const test = require("node:test");
const assert = require("node:assert");
const { chunkLegalText, normalizeHomoglyphs } = require("../server/lawIngest");

// "Հоդвaծ" built from Cyrillic о(043e) д(0434) в(0432) + Latin a(0061) — a real-world corruption.
const HOMOGLYPH_MARKER = String.fromCodePoint(0x540, 0x43e, 0x434, 0x432, 0x61, 0x56e); // Հоդвaծ
const PURE_MARKER = "Հոդված";

test("law-ingest-homoglyph: a Cyrillic/Latin-homoglyph article marker still splits into its own chunk", () => {
  assert.notStrictEqual(HOMOGLYPH_MARKER, PURE_MARKER, "fixture really is the corrupted form");
  const text = `Նախաբան։

Հոդված 63. ԱԱՀ-ի դրույքաչափը
ԱԱՀ-ի դրույքաչափը 20 տոկոս է։

${HOMOGLYPH_MARKER} 64. Հարկային ժամանակահատվածը
Հարկային ժամանակահատվածը օրացուցային ամիսն է։`;

  const chunks = chunkLegalText(text, { lawTitle: "ՀՀ Հարկային օրենսգիրք" });
  const articles = chunks.filter((c) => c.article).map((c) => c.article);
  assert.deepStrictEqual(articles, ["63", "64"], "both articles detected despite the homoglyph marker on 64");

  // Article 64 is its own chunk, not merged into 63.
  const art64 = chunks.find((c) => c.article === "64");
  assert.ok(art64, "article 64 is a distinct chunk");
  assert.ok(art64.text.includes("ժամանակահատվածը"), "64 carries its own body");
  const art63 = chunks.find((c) => c.article === "63");
  assert.ok(!art63.text.includes("ժամանակահատվածը"), "63 no longer absorbs 64's body");
});

test("law-ingest-homoglyph: the stored chunk body keeps the ORIGINAL bytes (no content mutation)", () => {
  const body = `${HOMOGLYPH_MARKER} 64. Վերնագիր\nԲովանդակություն։`;
  const chunks = chunkLegalText(body, { lawTitle: "T" });
  const art64 = chunks.find((c) => c.article === "64");
  // The chunk text must still contain the ORIGINAL homoglyph marker, not a rewritten Armenian one.
  assert.ok(art64.text.includes(HOMOGLYPH_MARKER), "original (corrupt) marker bytes preserved in stored text");
  assert.ok(!art64.text.includes(PURE_MARKER), "we did NOT silently rewrite the law's text to pure Armenian");
});

test("law-ingest-homoglyph: normalizeHomoglyphs maps Cyrillic/Latin lookalikes and preserves length", () => {
  const mapped = normalizeHomoglyphs(HOMOGLYPH_MARKER);
  assert.strictEqual(mapped, PURE_MARKER, "homoglyph marker normalizes to canonical Armenian");
  assert.strictEqual(mapped.length, HOMOGLYPH_MARKER.length, "1:1 codepoint mapping preserves offsets");
  // Pure Armenian text is unchanged (idempotent on already-correct input).
  assert.strictEqual(normalizeHomoglyphs(PURE_MARKER), PURE_MARKER);
  // Non-letter content and digits pass through untouched.
  assert.strictEqual(normalizeHomoglyphs("64. Test 20%"), "64. Test 20%");
});

test("law-ingest-homoglyph: a Cyrillic-homoglyph 'ՀՈԴՎԱԾ' (uppercase) marker also splits", () => {
  // Uppercase Armenian heading with Cyrillic uppercase homoglyphs (О/Д/В/А lookalikes).
  const upper = String.fromCodePoint(0x540, 0x548, 0x414, 0x54e, 0x410, 0x53e); // Հ Ո Д(Cyr) Վ А(Cyr) Ծ
  const text = `${upper} 7. Վերնագիր\nՄարմինը մեկն է։`;
  const chunks = chunkLegalText(text, { lawTitle: "T" });
  assert.deepStrictEqual(chunks.filter((c) => c.article).map((c) => c.article), ["7"]);
});
