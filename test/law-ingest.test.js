"use strict";
// TDD for the sovereign, offline legal-text chunking engine (server/lawIngest.js).
// Implements DECISION-001's borrow-list: turn raw Armenian legal text into article-aware
// law_chunks rows so the copilot's RAG can ground answers on specific articles.
// Pure function, zero deps, no server/app.js — runs anywhere.
const test = require("node:test");
const assert = require("node:assert");
const { chunkLegalText } = require("../server/lawIngest");

// A tiny RA-style law: a preamble, then three numbered articles ("Հոդված N").
const SAMPLE = `ՀԱՅԱՍՏԱՆԻ ՀԱՆՐԱՊԵՏՈՒԹՅԱՆ ՀԱՐԿԱՅԻՆ ՕՐԵՆՍԳԻՐՔ

Սույն օրենսգիրքը կարգավորում է հարկային հարաբերությունները։

Հոդված 60. Ավելացված արժեքի հարկ վճարողները
ԱԱՀ վճարող են համարվում կազմակերպությունները և անհատ ձեռնարկատերերը։

Հոդված 63. ԱԱՀ-ի դրույքաչափը
ԱԱՀ-ի դրույքաչափը սահմանվում է 20 տոկոս։

Հոդված 64. Հարկային ժամանակահատվածը
Հարկային ժամանակահատվածը օրացուցային ամիսն է։`;

test("law-ingest: splits text into one chunk per article, capturing the article number", () => {
  const chunks = chunkLegalText(SAMPLE, { lawTitle: "ՀՀ Հարկային օրենսգիրք" });
  // 1 preamble + 3 articles = 4 chunks.
  const articleChunks = chunks.filter((c) => c.article);
  assert.strictEqual(articleChunks.length, 3, "three article chunks");
  assert.deepStrictEqual(articleChunks.map((c) => c.article), ["60", "63", "64"], "article numbers captured in order");

  // The VAT-rate article carries its own body and nothing from the next article.
  const art63 = chunks.find((c) => c.article === "63");
  assert.ok(art63.text.includes("20 տոկոս"), "article 63 body retained");
  assert.ok(!art63.text.includes("ժամանակահատվածը"), "article 63 does not bleed into article 64");
  assert.ok(art63.text.includes("Հոդված 63"), "the article heading is part of the chunk text");
});

test("law-ingest: every chunk matches the law_chunks row shape and carries the law title", () => {
  const chunks = chunkLegalText(SAMPLE, { lawTitle: "ՀՀ Հարկային օրենսգիրք" });
  for (const c of chunks) {
    assert.ok(typeof c.id === "string" && c.id.length > 0, "id present");
    assert.strictEqual(c.lawTitle, "ՀՀ Հարկային օրենսգիրք", "law title threaded through");
    assert.ok(typeof c.article === "string", "article is a string (possibly empty)");
    assert.ok(typeof c.text === "string" && c.text.trim().length > 0, "non-empty text");
  }
  // ids are unique and deterministic (stable across two runs of the same input).
  const ids = chunks.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length, "ids are unique");
  const again = chunkLegalText(SAMPLE, { lawTitle: "ՀՀ Հարկային օրենսգիրք" });
  assert.deepStrictEqual(again.map((c) => c.id), ids, "ids are deterministic for the same input");
});

test("law-ingest: preamble before the first article is kept as a chunk with an empty article", () => {
  const chunks = chunkLegalText(SAMPLE, { lawTitle: "ՀՀ Հարկային օրենսգիրք" });
  const first = chunks[0];
  assert.strictEqual(first.article, "", "preamble has no article number");
  assert.ok(first.text.includes("կարգավորում է հարկային"), "preamble body retained, not dropped");
});

test("law-ingest: handles the Latin 'Article N' marker too", () => {
  const latin = `Preamble paragraph.

Article 1. Scope
This law applies to everyone.

Article 2. Definitions
Terms are defined here.`;
  const chunks = chunkLegalText(latin, { lawTitle: "Demo Act" });
  assert.deepStrictEqual(chunks.filter((c) => c.article).map((c) => c.article), ["1", "2"]);
});

test("law-ingest: empty / whitespace-only input yields no chunks; missing title defaults safely", () => {
  assert.deepStrictEqual(chunkLegalText("", { lawTitle: "X" }), []);
  assert.deepStrictEqual(chunkLegalText("   \n\n  ", { lawTitle: "X" }), []);
  // A document with no article markers becomes a single untagged chunk.
  const one = chunkLegalText("Just one block of legal prose with no articles.", {});
  assert.strictEqual(one.length, 1);
  assert.strictEqual(one[0].article, "");
  assert.strictEqual(one[0].lawTitle, "", "missing title defaults to empty string, not undefined");
});

test("law-ingest: collapses excess blank lines but preserves the article body text", () => {
  const messy = `Հոդված 5. Վերնագիր\n\n\n\nՄարմինը մեկն է։\n\n\nԵրկրորդ պարբերություն։`;
  const chunks = chunkLegalText(messy, { lawTitle: "T" });
  assert.strictEqual(chunks.length, 1);
  assert.ok(chunks[0].text.includes("Մարմինը մեկն է։"));
  assert.ok(chunks[0].text.includes("Երկրորդ պարբերություն։"));
  assert.ok(!/\n{3,}/.test(chunks[0].text), "3+ consecutive newlines collapsed");
});
