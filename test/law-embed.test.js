"use strict";
// TDD for the OPTIONAL embedding pass over the legal KB (server/lawEmbedIngest.js).
// Upgrades BM25-only law_chunks to hybrid by populating the `embedding` BLOB. Opt-in and
// failure-tolerant: a down embedder must NOT corrupt the DB — rows stay NULL, BM25 keeps working.
// The embedder is dependency-injected so tests need no real model (sovereign + deterministic).
const test = require("node:test");
const assert = require("node:assert");
const { DatabaseSync } = require("node:sqlite");
const { buildLawsDb } = require("../server/lawIngest");
const { embedLawChunks, floatsToBlob } = require("../server/lawEmbedIngest");

const SOURCES = [
  { lawTitle: "Tax", text: "Հոդված 63. ԱԱՀ-ի դրույքաչափը 20 տոկոս է։" },
  { lawTitle: "Labor", text: "Հոдвaծ 1. Ոլորտ — placeholder" }, // NOTE: deliberately a plain non-article block
];

// A deterministic fake embedder: 4-dim vector derived from text length (no network, no model).
function fakeEmbed(text) {
  const n = text.length;
  return [n, n / 2, n / 3, 1];
}

test("law-embed: floatsToBlob produces a Float32 little-endian BLOB that rag.js reads back exactly", () => {
  const vec = [0.5, -1.25, 3.0, 42.0];
  const blob = floatsToBlob(vec);
  assert.ok(Buffer.isBuffer(blob), "returns a Buffer");
  assert.strictEqual(blob.length, vec.length * 4, "4 bytes per float32");
  // Mirror rag.js toFloat32 exactly.
  const back = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
  assert.deepStrictEqual(Array.from(back), vec.map((x) => Math.fround(x)), "round-trips through Float32");
});

test("law-embed: embedLawChunks fills NULL embeddings using the injected embedder", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    buildLawsDb(db, SOURCES);
    const before = db.prepare("SELECT COUNT(*) AS n FROM law_chunks WHERE embedding IS NULL").get().n;
    assert.ok(before >= 2, "chunks start with NULL embeddings");

    const result = await embedLawChunks(db, { embedFn: async (t) => fakeEmbed(t) });
    assert.strictEqual(result.embedded, before, "every NULL-embedding row got embedded");
    assert.strictEqual(result.failed, 0);

    const remaining = db.prepare("SELECT COUNT(*) AS n FROM law_chunks WHERE embedding IS NULL").get().n;
    assert.strictEqual(remaining, 0, "no NULL embeddings left");

    // The stored BLOB decodes to the fake vector for a known row.
    const row = db.prepare("SELECT text, embedding FROM law_chunks LIMIT 1").get();
    const f = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);
    assert.deepStrictEqual(Array.from(f), fakeEmbed(row.text).map((x) => Math.fround(x)));
  } finally { db.close(); }
});

test("law-embed: already-embedded rows are skipped on a re-run (idempotent, no re-embed)", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    buildLawsDb(db, SOURCES);
    let calls = 0;
    const counting = async (t) => { calls += 1; return fakeEmbed(t); };
    const first = await embedLawChunks(db, { embedFn: counting });
    const callsAfterFirst = calls;
    const second = await embedLawChunks(db, { embedFn: counting });
    assert.strictEqual(second.embedded, 0, "nothing left to embed on the second pass");
    assert.strictEqual(calls, callsAfterFirst, "embedder not called again for already-embedded rows");
    assert.strictEqual(first.embedded, callsAfterFirst);
  } finally { db.close(); }
});

test("law-embed: a failing embedder leaves rows NULL and is reported (BM25 stays usable)", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    buildLawsDb(db, SOURCES);
    const total = db.prepare("SELECT COUNT(*) AS n FROM law_chunks").get().n;
    const result = await embedLawChunks(db, { embedFn: async () => { throw new Error("embedder offline"); } });
    assert.strictEqual(result.embedded, 0, "nothing embedded when the embedder is down");
    assert.strictEqual(result.failed, total, "every attempt reported as failed");
    const stillNull = db.prepare("SELECT COUNT(*) AS n FROM law_chunks WHERE embedding IS NULL").get().n;
    assert.strictEqual(stillNull, total, "DB not corrupted — all rows remain NULL, BM25 still works");
  } finally { db.close(); }
});

test("law-embed: a malformed embedder result (non-array / empty) is treated as a failure, not stored", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    buildLawsDb(db, SOURCES);
    const total = db.prepare("SELECT COUNT(*) AS n FROM law_chunks").get().n;
    const result = await embedLawChunks(db, { embedFn: async () => null });
    assert.strictEqual(result.embedded, 0);
    assert.strictEqual(result.failed, total, "null embedding result counts as a failure");
    assert.strictEqual(db.prepare("SELECT COUNT(*) AS n FROM law_chunks WHERE embedding IS NULL").get().n, total);
  } finally { db.close(); }
});
