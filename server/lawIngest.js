"use strict";

/**
 * Sovereign, offline legal-text ingest for the Armenian legal RAG.
 *
 * Turns raw legal text (plain .txt / markdown of RA legislation) into article-aware
 * chunks shaped exactly like the `law_chunks` table (id, lawTitle, article, text), so
 * `server/rag.js` can index them with no changes and the copilot can ground answers on
 * specific articles ("Հոդված 63" → the VAT-rate article).
 *
 * Pure functions, zero external deps, no network — runs on the server, in scripts, and in
 * tests identically. Chunk ids are content-hashed → re-ingesting the same law is idempotent.
 *
 * This is the front half DECISION-001 flagged as missing: install-laws.js only COPIES a
 * pre-built laws.sqlite; this module CREATES law_chunks rows from text.
 */

const crypto = require("node:crypto");

// Homoglyph map: Cyrillic / Latin codepoints → the visually-identical Armenian letter.
// Real RA legal PDFs/OCR routinely substitute these for the Armenian letters in the article
// markers, which silently break exact-match splitting. The map is 1:1 (one codepoint → one
// codepoint) so normalizing PRESERVES string length and char offsets — letting us detect markers
// on a normalized shadow while slicing chunk bodies from the ORIGINAL (never rewriting the law).
const HOMOGLYPHS = {
  "о": "ո", // Cyrillic о → Armenian ո
  "o": "ո", // Latin o    → Armenian ո
  "д": "դ", // Cyrillic д → Armenian դ
  "в": "վ", // Cyrillic в → Armenian վ
  "а": "ա", // Cyrillic а → Armenian ա
  "a": "ա", // Latin a    → Armenian ա
  "с": "ս", // Cyrillic с → Armenian ս
  "р": "ր", // Cyrillic р → Armenian ր
  "х": "խ", // Cyrillic х → Armenian խ
  "О": "Ո", // Cyrillic О → Armenian Ո
  "O": "Ո", // Latin O    → Armenian Ո
  "Д": "Դ", // Cyrillic Д → Armenian Դ
  "В": "Վ", // Cyrillic В → Armenian Վ
  "А": "Ա", // Cyrillic А → Armenian Ա
  "A": "Ա", // Latin A    → Armenian Ա
};
const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join("")}]`, "gu");

/**
 * Map common Cyrillic/Latin homoglyphs to their Armenian equivalents. 1:1 per codepoint, so the
 * output has the SAME length as the input (offset-preserving). Used to make article-marker
 * detection tolerant of mixed-script OCR — NOT to rewrite stored legal text.
 * @param {string} text
 * @returns {string}
 */
function normalizeHomoglyphs(text) {
  return String(text).replace(HOMOGLYPH_RE, (ch) => HOMOGLYPHS[ch] || ch);
}

// Article markers, anchored to line start so a mid-sentence reference never splits:
//   Armenian: "Հոդված 63." / "Հոдвaծ 63"   ·   Latin: "Article 2." / "ARTICLE 2"
// Capture group 1 = the article number.
// Script-aware: Armenian markers matched on the homoglyph-normalized shadow; Latin markers on
// the original text (normalizing Latin a/o/A/O→Armenian would corrupt a genuine "Article").
const ARTICLE_MARKER_HY = /^[ \t]*(?:Հոդված|ՀՈԴՎԱԾ)[ \t]+(\d+)/gmu;
const ARTICLE_MARKER_LATIN = /^[ \t]*(?:Article|ARTICLE)[ \t]+(\d+)/gmu;
const ARTICLE_MARKER = /^[ \t]*(?:Հոդված|ՀՈԴՎԱԾ|Article|ARTICLE)[ \t]+(\d+)/gmu;

function collapseBlankLines(text) {
  // Normalize CRLF, trim trailing spaces per line, collapse 3+ newlines to a paragraph break.
  return String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function chunkId(lawTitle, article, text) {
  // Content-addressed → stable across runs, idempotent on re-ingest.
  const hash = crypto.createHash("sha256").update(`${lawTitle}\0${article}\0${text}`).digest("hex");
  return `law-${hash.slice(0, 24)}`;
}

/**
 * Split raw legal text into article-aware chunks.
 * @param {string} rawText
 * @param {{ lawTitle?: string }} [options]
 * @returns {Array<{ id: string, lawTitle: string, article: string, text: string }>}
 */
function chunkLegalText(rawText, options = {}) {
  const lawTitle = String((options && options.lawTitle) || "");
  const text = collapseBlankLines(rawText || "");
  if (!text) return [];

  // Find every line-anchored article marker and its offset. Chunk bodies are ALWAYS sliced from
  // the ORIGINAL `text` — we never rewrite the law's content. Detection is script-aware:
  //   - Armenian markers are matched on a homoglyph-normalized SHADOW (offset-identical to the
  //     original, since the map is 1:1), so a mixed-script "Հоդвaծ N" still splits.
  //   - Latin markers are matched on the ORIGINAL, since normalizing Latin a/o→Armenian would
  //     turn a genuine "Article" into a non-marker.
  const shadow = normalizeHomoglyphs(text);
  const markers = [];
  for (const m of shadow.matchAll(ARTICLE_MARKER_HY)) markers.push({ index: m.index, article: m[1] });
  for (const m of text.matchAll(ARTICLE_MARKER_LATIN)) markers.push({ index: m.index, article: m[1] });
  // Merge the two passes into a single ascending-by-offset marker list.
  markers.sort((a, b) => a.index - b.index);

  const segments = [];
  if (markers.length === 0) {
    // No article structure → a single untagged chunk.
    segments.push({ article: "", text });
  } else {
    // Preamble: anything before the first marker (chapter titles, law metadata).
    if (markers[0].index > 0) {
      const pre = text.slice(0, markers[0].index).trim();
      if (pre) segments.push({ article: "", text: pre });
    }
    // Each article runs from its marker to the next marker (or end of text).
    for (let i = 0; i < markers.length; i += 1) {
      const start = markers[i].index;
      const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
      const body = text.slice(start, end).trim();
      if (body) segments.push({ article: markers[i].article, text: body });
    }
  }

  return segments
    .filter((s) => s.text.trim().length > 0)
    .map((s) => ({ id: chunkId(lawTitle, s.article, s.text), lawTitle, article: s.article, text: s.text }));
}

// Canonical law_chunks DDL — the ONE place this table is created. Mirrors exactly the columns
// server/rag.js reads (id, law_title, article, text, embedding). embedding is a nullable Float32
// BLOB; left NULL here means BM25-only retrieval (the sovereign, no-model default).
const LAW_CHUNKS_DDL = `
  CREATE TABLE IF NOT EXISTS law_chunks (
    id TEXT PRIMARY KEY,
    law_title TEXT NOT NULL DEFAULT '',
    article TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    embedding BLOB
  )`;

/**
 * Build a law_chunks table from raw legal sources. Pure I/O over an already-open node:sqlite DB
 * (so it is testable against :memory:). Each source is chunked by chunkLegalText and inserted with
 * INSERT OR REPLACE on the content-hashed id → re-ingesting identical text adds no duplicate rows.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Array<{ lawTitle?: string, text: string }>} sources
 * @returns {{ sources: number, chunks: number }}
 */
function buildLawsDb(db, sources = []) {
  db.exec(LAW_CHUNKS_DDL);
  const insert = db.prepare(
    "INSERT OR REPLACE INTO law_chunks (id, law_title, article, text, embedding) VALUES (?, ?, ?, ?, NULL)",
  );
  let chunkCount = 0;
  for (const source of sources || []) {
    if (!source || typeof source.text !== "string") continue;
    const chunks = chunkLegalText(source.text, { lawTitle: source.lawTitle });
    for (const c of chunks) {
      insert.run(c.id, c.lawTitle, c.article, c.text);
      chunkCount += 1;
    }
  }
  return { sources: (sources || []).length, chunks: chunkCount };
}

module.exports = { chunkLegalText, collapseBlankLines, chunkId, ARTICLE_MARKER, buildLawsDb, LAW_CHUNKS_DDL, normalizeHomoglyphs };
