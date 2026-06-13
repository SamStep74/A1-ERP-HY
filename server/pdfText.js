"use strict";

/**
 * PDF → text extraction for the legal-KB ingest.
 *
 * Sovereign/lean by design: instead of adding a heavy pure-JS PDF dependency to a 3-dep project,
 * we shell out to `pdftotext` (poppler) when it is available. Extraction is dependency-injected
 * (runner) so it is unit-testable with no real binary, and failure-tolerant — a missing pdftotext
 * raises a typed PdftotextUnavailableError that the ingest CLI degrades on (skip PDFs, keep going)
 * rather than crashing.
 *
 * Security: the subprocess is invoked with an ARGS ARRAY and no shell (spawnSync default
 * shell:false), so a user-supplied file path is always a single literal argument — never
 * interpolated into a shell command. No shell-injection surface.
 */

const { spawnSync } = require("node:child_process");

/** Raised when the pdftotext binary cannot be found, so callers can degrade gracefully. */
class PdftotextUnavailableError extends Error {
  constructor(message = "pdftotext (poppler) is not installed") {
    super(message);
    this.name = "PdftotextUnavailableError";
  }
}

// 64 MB cap — generous for a single statute, bounded so a pathological PDF can't exhaust memory.
const MAX_BUFFER = 64 * 1024 * 1024;
const UNAVAILABLE_SPAWN_ERROR_CODES = new Set(["ENOENT", "EACCES", "EPERM"]);

/** Default runner: a thin spawnSync wrapper. Returns the raw spawnSync result object. */
function defaultRunner(args) {
  return spawnSync("pdftotext", args, { encoding: "utf8", maxBuffer: MAX_BUFFER, shell: false });
}

/**
 * Whether the pdftotext binary resolves on this machine.
 * @param {(args: string[]) => { error?: { code?: string } }} [runner]
 * @returns {boolean}
 */
function isPdftotextAvailable(runner = defaultRunner) {
  const result = runner(["-v"]);
  if (!result || result.error) return false;
  return result.status === 0;
}

function isUnavailableSpawnError(error) {
  return !!(error && UNAVAILABLE_SPAWN_ERROR_CODES.has(error.code));
}

/**
 * Extract UTF-8 text from a PDF via pdftotext.
 *   -enc UTF-8  : required for Armenian (default encoding would mangle it)
 *   -nopgbrk    : drop the form-feed page-break chars that would otherwise pollute chunk text
 *   <path> -    : write to stdout
 * @param {string} pdfPath
 * @param {{ runner?: (args: string[]) => { status?: number, stdout?: string, stderr?: string, error?: any } }} [options]
 * @returns {string} extracted text
 * @throws {PdftotextUnavailableError} if the binary is missing
 * @throws {Error} if extraction fails (non-zero exit)
 */
function extractPdfText(pdfPath, options = {}) {
  const runner = options.runner || defaultRunner;
  const result = runner(["-enc", "UTF-8", "-nopgbrk", pdfPath, "-"]);
  if (result && result.error) {
    if (isUnavailableSpawnError(result.error)) throw new PdftotextUnavailableError();
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = (result.stderr || "").trim() || `exit ${result.status}`;
    throw new Error(`pdftotext failed for ${pdfPath}: ${detail}`);
  }
  return result.stdout || "";
}

module.exports = { extractPdfText, isPdftotextAvailable, PdftotextUnavailableError };
