"use strict";

/**
 * Sovereign legal-KB ingest CLI.
 *
 * Reads raw .txt/.md/.pdf files of RA legislation from a directory, chunks each into article-aware
 * law_chunks rows (server/lawIngest), and writes an installable laws.sqlite that server/rag.js
 * indexes unchanged. 100% offline — no network, no embedding model (BM25-only by default; run
 * the embedder pass separately if/when a local model is configured). PDFs are extracted via
 * pdftotext (poppler); if it is absent, PDFs are skipped with a warning and .txt/.md still ingest.
 *
 * Usage:
 *   node scripts/ingest-laws.js <source-dir> [dest.sqlite] [--embed]
 *
 * Each file becomes one "law"; its title is the filename without extension (underscores →
 * spaces). Re-running is idempotent (content-hashed chunk ids).
 */

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("../server/config");
const { buildLawsDb } = require("../server/lawIngest");
const { embedLawChunks } = require("../server/lawEmbedIngest");
const { extractPdfText, isPdftotextAvailable, PdftotextUnavailableError } = require("../server/pdfText");

function titleFromFilename(file) {
  return path.basename(file).replace(/\.(txt|md|pdf)$/i, "").replace(/[_]+/g, " ").trim();
}

/**
 * Read law sources from a directory. .txt/.md are read directly; .pdf is extracted via pdftotext
 * (skipped, not fatal, when the binary is unavailable or a file fails to parse). Returns an array
 * of { lawTitle, text } (back-compat contract). Source skips are reported via options.onSkip.
 * @param {string} dir
 * @param {{ extractPdf?: Function, readText?: Function, pdfAvailable?: boolean, onSkip?: (file: string, reason: string) => void }} [options]
 * @returns {Array<{ lawTitle: string, text: string }>}
 */
function readSources(dir, options = {}) {
  const extractPdf = options.extractPdf || extractPdfText;
  const readText = options.readText || ((file) => fs.readFileSync(file, "utf8"));
  const onSkip = options.onSkip || (() => {});
  const entries = fs.readdirSync(dir).filter((f) => /\.(txt|md|pdf)$/i.test(f)).sort();
  // Resolve pdftotext availability lazily — only if a PDF is actually present.
  let pdfAvailable = options.pdfAvailable;
  const sources = [];
  for (const f of entries) {
    if (f.startsWith(".")) {
      onSkip(f, "hidden-file");
      continue;
    }
    const full = path.join(dir, f);
    const entryStat = fs.lstatSync(full);
    if (entryStat.isSymbolicLink()) {
      onSkip(f, "symlink");
      continue;
    }
    if (!entryStat.isFile()) {
      onSkip(f, "not-a-file");
      continue;
    }
    if (/\.pdf$/i.test(f)) {
      if (pdfAvailable === undefined) pdfAvailable = isPdftotextAvailable();
      if (!pdfAvailable) { onSkip(f, "pdftotext-unavailable"); continue; }
      try {
        sources.push({ lawTitle: titleFromFilename(f), text: extractPdf(full) });
      } catch (err) {
        if (err instanceof PdftotextUnavailableError) {
          onSkip(f, "pdftotext-unavailable");
          continue;
        }
        onSkip(f, err && err.message ? err.message : "extract-failed");
      }
    } else {
      try {
        sources.push({ lawTitle: titleFromFilename(f), text: readText(full) });
      } catch {
        onSkip(f, "read-failed");
      }
    }
  }
  return sources;
}

async function main(argv) {
  // Separate flags from positionals so [dest.sqlite] still works with or without --embed.
  const embed = argv.includes("--embed");
  const positionals = argv.slice(2).filter((a) => !a.startsWith("--"));
  const sourceDir = positionals[0];
  if (!sourceDir) {
    console.error("Usage: node scripts/ingest-laws.js <source-dir> [dest.sqlite] [--embed]");
    process.exit(1);
  }
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }
  const dest = positionals[1] || config.resolveLawsDbPath();
  const skipped = [];
  const sources = readSources(sourceDir, { onSkip: (file, reason) => skipped.push({ file, reason }) });
  if (skipped.length > 0) {
    const unavailable = skipped.some((s) => s.reason === "pdftotext-unavailable");
    console.warn(`Skipped ${skipped.length} source file(s): ${skipped.map((s) => s.file).join(", ")}`);
    if (unavailable) console.warn("  pdftotext (poppler) not found — install it, or pre-convert PDFs to .txt.");
  }
  if (sources.length === 0) {
    console.error(`No ingestible .txt/.md/.pdf law files found in ${sourceDir}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const db = new DatabaseSync(dest);
  try {
    const result = buildLawsDb(db, sources);
    console.log(`Ingested ${result.sources} law file(s) -> ${result.chunks} chunk(s)`);
    console.log(`Legal KB written -> ${dest}`);
    if (embed) {
      // Opt-in embedding via the LOCAL loopback embedder. Failure-tolerant: if it is not running,
      // the KB stays BM25-only and the CLI still succeeds (sovereign degrade, no crash).
      console.log(`Embedding via ${config.lawEmbed.baseUrl} (model ${config.lawEmbed.model})…`);
      const e = await embedLawChunks(db);
      console.log(`Embeddings: ${e.embedded} embedded, ${e.failed} failed (of ${e.total}).`);
      if (e.failed > 0) console.log("Some/all embeddings failed (local embedder offline?) — BM25 retrieval still works.");
    } else {
      console.log("Embeddings: none (BM25 lexical retrieval). RAG works offline as-is. Add --embed to populate vectors.");
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = { titleFromFilename, readSources, main };
