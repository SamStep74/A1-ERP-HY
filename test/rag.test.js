"use strict";
const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { seedLawsDb } = require("./fixtures/seed-laws");
const rag = require("../server/rag");

async function withFixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aoc-laws-"));
  const db = path.join(dir, "laws.sqlite");
  seedLawsDb(db);
  try { return await fn(db); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("init loads the KB, ready without vectors", async () => {
  await withFixture(db => {
    assert.strictEqual(rag.init(db), true);
    const s = rag.stats();
    assert.strictEqual(s.ready, true);
    assert.strictEqual(s.vectors, false);
    assert.ok(s.chunks >= 4);
  });
});

test("BM25 search finds the VAT rate article", async () => {
  await withFixture(db => {
    rag.init(db);
    const hits = rag.search("ԱԱՀ դրույքաչափ տոկոս", 3);
    assert.ok(hits.length > 0);
    assert.match(hits[0].article, /63/);
    assert.match(hits[0].lawTitle, /հարկային/);
  });
});

test("searchHybrid falls back to BM25 when no embedder", async () => {
  await withFixture(async db => {
    rag.init(db);
    const hits = await rag.searchHybrid("ԱԱՀ դրույքաչափ տոկոս", 3);
    assert.ok(hits.length > 0);
    assert.match(hits[0].article, /63/);
  });
});

test("absent DB → not ready, empty search", () => {
  assert.strictEqual(rag.init(path.join(os.tmpdir(), "nope-aoc.sqlite")), false);
  assert.deepStrictEqual(rag.search("anything"), []);
});
