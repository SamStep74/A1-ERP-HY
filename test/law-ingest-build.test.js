"use strict";
// TDD for buildLawsDb — the second half of the sovereign legal ingest: take raw law sources,
// chunk them (server/lawIngest.chunkLegalText), and write a law_chunks SQLite that server/rag.js
// indexes UNCHANGED. The headline test is a true round-trip: build → rag.init → search finds it.
// Pure/offline, no network, no server/app.js.
const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { buildLawsDb } = require("../server/lawIngest");

const SOURCES = [
  {
    lawTitle: "ՀՀ Հարկային օրենսգիրք",
    text: `ՀԱՐԿԱՅԻՆ ՕՐԵՆՍԳԻՐՔ

Սույն օրենսգիրքը կարգավորում է հարկային հարաբերությունները։

Հոդված 63. ԱԱՀ-ի դրույքաչափը
ԱԱՀ-ի դրույքաչափը սահմանվում է 20 տոկոս։`,
  },
  {
    lawTitle: "ՀՀ Աշխատանքային օրենսգիրք",
    text: `Հոդված 1. Գործողության ոլորտը
Սույն օրենսգիրքը կարգավորում է աշխատանքային հարաբերությունները։`,
  },
];

test("law-ingest-build: buildLawsDb creates the law_chunks table and inserts chunked rows", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const result = buildLawsDb(db, SOURCES);
    // 1 preamble + 1 article (tax) + 1 article (labor) = 3 chunks.
    assert.strictEqual(result.chunks, 3, "three chunks written");
    assert.strictEqual(result.sources, 2, "two source laws");

    const rows = db.prepare("SELECT id, law_title, article, text, embedding FROM law_chunks ORDER BY law_title, article").all();
    assert.strictEqual(rows.length, 3);
    // Every row matches the rag.js read shape; embedding is NULL (BM25-only, sovereign default).
    for (const r of rows) {
      assert.ok(typeof r.id === "string" && r.id.length > 0);
      assert.ok(typeof r.law_title === "string" && r.law_title.length > 0);
      assert.ok(typeof r.text === "string" && r.text.length > 0);
      assert.strictEqual(r.embedding, null, "no embedding → BM25 fallback");
    }
    // The VAT article is present and tagged with article 63.
    const vat = rows.find((r) => r.article === "63");
    assert.ok(vat && vat.text.includes("20 տոկոս"), "VAT article 63 stored");
  } finally { db.close(); }
});

test("law-ingest-build: re-running is idempotent (content-hashed ids → no duplicate rows)", () => {
  const db = new DatabaseSync(":memory:");
  try {
    buildLawsDb(db, SOURCES);
    const first = db.prepare("SELECT COUNT(*) AS n FROM law_chunks").get().n;
    buildLawsDb(db, SOURCES); // same input again
    const second = db.prepare("SELECT COUNT(*) AS n FROM law_chunks").get().n;
    assert.strictEqual(second, first, "re-ingesting identical sources adds no rows");
  } finally { db.close(); }
});

test("law-ingest-build: round-trip — a built DB is indexed by rag.js and search finds the article", () => {
  // Write a real laws.sqlite, then point the RAG engine at it.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laws-ingest-"));
  const dbPath = path.join(dir, "laws.sqlite");
  try {
    const db = new DatabaseSync(dbPath);
    buildLawsDb(db, SOURCES);
    db.close();

    // rag.init reads the same columns buildLawsDb wrote — no schema drift.
    const rag = require("../server/rag");
    const ready = rag.init(dbPath);
    assert.strictEqual(ready, true, "rag indexed the built KB");
    const s = rag.stats();
    assert.ok(s.ready && s.chunks === 3, "stats report the ingested chunks");

    // A BM25 lexical query for the VAT rate retrieves the tax article.
    const hits = rag.search("ԱԱՀ դրույքաչափ տոկոս", 3);
    assert.ok(hits.length > 0, "search returns results");
    assert.ok(hits.some((h) => h.article === "63"), "the VAT article is retrieved by BM25");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("law-ingest-build: empty sources produce an empty (but valid) law_chunks table", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const result = buildLawsDb(db, []);
    assert.strictEqual(result.chunks, 0);
    const n = db.prepare("SELECT COUNT(*) AS n FROM law_chunks").get().n;
    assert.strictEqual(n, 0, "table exists and is empty");
  } finally { db.close(); }
});

test("ingest-laws CLI: filename → law title, and reads only .txt/.md sources from a dir", () => {
  const { titleFromFilename, readSources } = require("../scripts/ingest-laws");
  assert.strictEqual(titleFromFilename("Հարկային_օրենսգիրք.txt"), "Հարկային օրենսգիրք", "underscores → spaces, ext stripped");
  assert.strictEqual(titleFromFilename("labor-code.md"), "labor-code");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laws-src-"));
  try {
    fs.writeFileSync(path.join(dir, "Tax_Code.txt"), "Հոդված 63. ԱԱՀ\n20 տոկոս։");
    fs.writeFileSync(path.join(dir, "Labor.md"), "Հոդված 1. Ոլորտ\nԿարգավորում է։");
    fs.writeFileSync(path.join(dir, "notes.json"), "{}"); // must be ignored
    const sources = readSources(dir);
    assert.strictEqual(sources.length, 2, "only .txt/.md picked up");
    assert.deepStrictEqual(sources.map((s) => s.lawTitle).sort(), ["Labor", "Tax Code"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
