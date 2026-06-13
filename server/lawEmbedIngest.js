"use strict";

/**
 * Optional embedding pass for the legal RAG knowledge base.
 *
 * Upgrades a BM25-only law_chunks table to HYBRID retrieval by populating the `embedding`
 * column. This is strictly OPT-IN and FAILURE-TOLERANT — the sovereign default is BM25 with
 * no model, so a missing/offline embedder must never corrupt the KB: failed rows stay NULL and
 * lexical search keeps working (mirrors rag.searchHybrid's own BM25 fallback).
 *
 * The embedder is dependency-injected (embedFn) so this is testable with no real model and no
 * network. The default embedder calls the LOCAL Ollama-compatible /api/embed via config.safeFetch
 * (loopback → always permitted by the egress gate, even with ARMOSPHERA_ONE_ALLOW_EGRESS=0).
 */

const config = require("./config");

/** Serialize a number[] into a Float32 little-endian BLOB matching rag.js toFloat32. */
function floatsToBlob(vec) {
  const f32 = Float32Array.from(vec);
  // Copy into a tightly-sized Buffer (byteOffset 0, exact length) so the stored BLOB is clean.
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/** Default embedder: local Ollama-compatible endpoint via the loopback-safe fetch. */
async function defaultEmbedFn(text) {
  const res = await config.safeFetch(`${config.lawEmbed.baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.lawEmbed.model, input: String(text) }),
  });
  const data = await res.json();
  if (!res.ok || !data.embeddings || !data.embeddings[0]) {
    throw new Error(data.error || `embed failed (${res.status})`);
  }
  return data.embeddings[0];
}

function isValidVector(v) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => Number.isFinite(x));
}

/**
 * Embed every law_chunks row that has a NULL embedding (idempotent: already-embedded rows are
 * skipped, so a re-run only fills gaps). Never throws on an embedder failure — counts it.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ embedFn?: (text:string)=>Promise<number[]>, onProgress?: (done:number,total:number)=>void }} [options]
 * @returns {Promise<{ total: number, embedded: number, failed: number }>}
 */
async function embedLawChunks(db, options = {}) {
  const embedFn = (options && options.embedFn) || defaultEmbedFn;
  const rows = db.prepare("SELECT id, text FROM law_chunks WHERE embedding IS NULL").all();
  const update = db.prepare("UPDATE law_chunks SET embedding = ? WHERE id = ?");
  let embedded = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    try {
      const vec = await embedFn(row.text);
      if (!isValidVector(vec)) { failed += 1; continue; }
      update.run(floatsToBlob(vec), row.id);
      embedded += 1;
    } catch {
      // Tolerate a down/slow embedder — leave the row NULL so BM25 still serves it.
      failed += 1;
    }
    if (typeof options.onProgress === "function") options.onProgress(i + 1, rows.length);
  }
  return { total: rows.length, embedded, failed };
}

module.exports = { embedLawChunks, floatsToBlob, defaultEmbedFn, isValidVector };
