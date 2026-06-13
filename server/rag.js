"use strict";

/**
 * Retrieval over the Armenian RA-law knowledge base.
 * Lexical BM25 is always available (no model, no network). When the KB has
 * embeddings, searchHybrid blends BM25 with cosine similarity; the query
 * embedding goes to the local embedder via config.safeFetch (loopback is
 * always permitted by the egress gate). Any embed failure falls back to BM25.
 */

const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const config = require("./config");

const K1 = 1.5;
const B = 0.75;

let chunks = [];
let df = new Map();
let avgLen = 0;
let ready = false;
let hasVectors = false;

function tokenize(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function toFloat32(blob) {
  if (!blob) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (!buf.length || buf.length % 4 !== 0) return null;
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function norm(vec) {
  let s = 0;
  for (let i = 0; i < vec.length; i += 1) s += vec[i] * vec[i];
  return Math.sqrt(s) || 1;
}

function init(dbPath) {
  ready = false; hasVectors = false; chunks = []; df = new Map(); avgLen = 0;
  if (!dbPath || !fs.existsSync(dbPath)) return false;
  let db;
  try { db = new DatabaseSync(dbPath); } catch { return false; }
  let rows;
  try { rows = db.prepare("SELECT id, law_title, article, text, embedding FROM law_chunks").all(); }
  catch { db.close(); return false; }
  db.close();

  let vectorCount = 0;
  for (const row of rows) {
    const tokens = tokenize(row.text);
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    const vec = toFloat32(row.embedding);
    if (vec) vectorCount += 1;
    chunks.push({ id: row.id, lawTitle: row.law_title, article: row.article, text: row.text, tf, len: tokens.length, vec, vnorm: vec ? norm(vec) : 0 });
    for (const token of tf.keys()) df.set(token, (df.get(token) || 0) + 1);
  }
  avgLen = chunks.length ? chunks.reduce((sum, c) => sum + c.len, 0) / chunks.length : 0;
  ready = chunks.length > 0;
  hasVectors = vectorCount > 0 && vectorCount === chunks.length;
  return ready;
}

function idf(term) {
  const n = chunks.length;
  const d = df.get(term) || 0;
  return Math.log(1 + (n - d + 0.5) / (d + 0.5));
}

function bm25Scores(query) {
  const qTokens = [...new Set(tokenize(query))];
  return chunks.map((c) => {
    let score = 0;
    for (const term of qTokens) {
      const f = c.tf.get(term);
      if (!f) continue;
      score += idf(term) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * c.len) / (avgLen || 1))));
    }
    return score;
  });
}

function toResult(c, score) {
  return { lawTitle: c.lawTitle, article: c.article, text: c.text, score: Number(score.toFixed(4)) };
}

function search(query, k = 5) {
  if (!ready) return [];
  const scores = bm25Scores(query);
  return chunks.map((c, i) => ({ c, score: scores[i] }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score)
    .slice(0, k).map((x) => toResult(x.c, x.score));
}

async function embedQuery(query) {
  const res = await config.safeFetch(`${config.lawEmbed.baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.lawEmbed.model, input: String(query) })
  });
  const data = await res.json();
  if (!res.ok || !data.embeddings || !data.embeddings[0]) {
    throw new Error(data.error || `embed failed (${res.status})`);
  }
  return data.embeddings[0];
}

function cosineScores(queryVec) {
  const q = Float32Array.from(queryVec);
  const qn = norm(q);
  return chunks.map((c) => {
    if (!c.vec) return 0;
    let dot = 0; const v = c.vec; const len = Math.min(v.length, q.length);
    for (let i = 0; i < len; i += 1) dot += v[i] * q[i];
    return dot / (qn * c.vnorm);
  });
}

function normalize(arr) {
  const max = Math.max(0, ...arr);
  return max > 0 ? arr.map((x) => x / max) : arr;
}

async function searchHybrid(query, k = 8) {
  if (!ready) return [];
  const bm = bm25Scores(query);
  if (!hasVectors) {
    return chunks.map((c, i) => ({ c, score: bm[i] }))
      .filter((x) => x.score > 0).sort((a, b) => b.score - a.score)
      .slice(0, k).map((x) => toResult(x.c, x.score));
  }
  let cos;
  try { cos = cosineScores(await embedQuery(query)); } catch { return search(query, k); }
  const bmN = normalize(bm); const cosN = normalize(cos);
  return chunks.map((c, i) => ({ c, score: 0.5 * bmN[i] + 0.5 * cosN[i] }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score)
    .slice(0, k).map((x) => toResult(x.c, x.score));
}

function stats() {
  return { ready, chunks: chunks.length, vectors: hasVectors, embedModel: hasVectors ? config.lawEmbed.model : null };
}

module.exports = { init, search, searchHybrid, embedQuery, stats, tokenize };
