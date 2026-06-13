"use strict";
// TDD for the PDF→text extraction layer (server/pdfText.js) used by the legal-KB ingest.
// We shell out to `pdftotext` (poppler) to keep the project dependency-lean. The subprocess
// runner is dependency-injected so these tests need NO real binary and NO real PDF — and so the
// committed suite passes on machines without poppler. Extraction is failure-tolerant: a missing
// binary surfaces a typed error the CLI can degrade on, never a crash.
const test = require("node:test");
const assert = require("node:assert");
const { extractPdfText, isPdftotextAvailable, PdftotextUnavailableError } = require("../server/pdfText");

// A fake spawnSync-shaped runner factory: returns whatever result we want, and records the args.
function fakeRunner(result) {
  const calls = [];
  const run = (args) => { calls.push(args); return result; };
  run.calls = calls;
  return run;
}

test("pdf-text: extractPdfText returns stdout and invokes pdftotext with UTF-8 + nopgbrk + stdout", () => {
  const runner = fakeRunner({ status: 0, stdout: "Հոդված 1. Տեքստ", stderr: "" });
  const text = extractPdfText("/laws/Code.pdf", { runner });
  assert.strictEqual(text, "Հոդված 1. Տեքստ");
  const args = runner.calls[0];
  assert.ok(args.includes("-enc") && args.includes("UTF-8"), "UTF-8 encoding for Armenian");
  assert.ok(args.includes("-nopgbrk"), "strip page-break form-feeds");
  assert.ok(args.includes("/laws/Code.pdf"), "input path passed");
  assert.strictEqual(args[args.length - 1], "-", "output to stdout");
  // The path is a discrete arg (NOT interpolated into a shell string) — injection-safe.
  assert.ok(args.indexOf("/laws/Code.pdf") >= 0 && typeof args[args.indexOf("/laws/Code.pdf")] === "string");
});

test("pdf-text: a missing binary (ENOENT) raises a typed PdftotextUnavailableError for graceful degrade", () => {
  const runner = fakeRunner({ error: Object.assign(new Error("spawn pdftotext ENOENT"), { code: "ENOENT" }) });
  assert.throws(
    () => extractPdfText("/laws/Code.pdf", { runner }),
    (e) => e instanceof PdftotextUnavailableError,
    "ENOENT → PdftotextUnavailableError (so the CLI can skip PDFs, not crash)"
  );
});

test("pdf-text: a blocked binary raises the same typed unavailable error", () => {
  const runner = fakeRunner({ error: Object.assign(new Error("spawn pdftotext EACCES"), { code: "EACCES" }) });
  assert.throws(
    () => extractPdfText("/laws/Code.pdf", { runner }),
    (e) => e instanceof PdftotextUnavailableError,
    "blocked pdftotext spawn → PdftotextUnavailableError"
  );
});

test("pdf-text: a non-zero exit is a real failure (distinct from 'unavailable')", () => {
  const runner = fakeRunner({ status: 1, stdout: "", stderr: "Syntax Error: not a PDF" });
  assert.throws(
    () => extractPdfText("/laws/broken.pdf", { runner }),
    (e) => e instanceof Error && !(e instanceof PdftotextUnavailableError) && /not a PDF/.test(e.message),
    "extraction failure surfaces stderr and is NOT treated as 'binary unavailable'"
  );
});

test("pdf-text: isPdftotextAvailable reflects whether the binary resolves", () => {
  const present = fakeRunner({ status: 0, stdout: "", stderr: "pdftotext version 26.0" });
  const absent = fakeRunner({ error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }) });
  const blocked = fakeRunner({ error: Object.assign(new Error("EACCES"), { code: "EACCES" }) });
  const failedProbe = fakeRunner({ status: 1, stdout: "", stderr: "permission denied" });
  assert.strictEqual(isPdftotextAvailable(present), true);
  assert.strictEqual(isPdftotextAvailable(absent), false);
  assert.strictEqual(isPdftotextAvailable(blocked), false);
  assert.strictEqual(isPdftotextAvailable(failedProbe), false);
});

// readSources (in the CLI) routes .pdf through extraction — injected so no real binary is needed.
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { readSources, titleFromFilename } = require("../scripts/ingest-laws");

test("pdf-text: titleFromFilename strips .pdf like the other extensions", () => {
  assert.strictEqual(titleFromFilename("Քրեական_օրենսգիրք.pdf"), "Քրեական օրենսգիրք");
});

test("pdf-text: readSources extracts .pdf alongside .txt/.md using the injected extractor", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-src-"));
  try {
    fs.writeFileSync(path.join(dir, "Tax.txt"), "Հոդված 1. Տեքստ");
    fs.writeFileSync(path.join(dir, "Labor.pdf"), "%PDF-1.4 fake bytes");
    const sources = readSources(dir, {
      pdfAvailable: true,
      extractPdf: () => "Հոդված 7. Աշխատանք",
    });
    assert.strictEqual(sources.length, 2, "txt + pdf both ingested");
    const labor = sources.find((s) => s.lawTitle === "Labor");
    assert.ok(labor && labor.text.includes("Աշխատանք"), "pdf text came from the extractor");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pdf-text: readSources skips PDFs (and reports them) when pdftotext is unavailable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-src2-"));
  try {
    fs.writeFileSync(path.join(dir, "Tax.txt"), "Հոդված 1. Տեքստ");
    fs.writeFileSync(path.join(dir, "Labor.pdf"), "%PDF-1.4 fake");
    const skipped = [];
    const sources = readSources(dir, {
      pdfAvailable: false,
      onSkip: (file, reason) => skipped.push({ file, reason }),
    });
    assert.strictEqual(sources.length, 1, "only the .txt ingested; pdf skipped not fatal");
    assert.deepStrictEqual(skipped, [{ file: "Labor.pdf", reason: "pdftotext-unavailable" }]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pdf-text: readSources reports extractor-level unavailable errors with the canonical skip reason", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-src3-"));
  try {
    fs.writeFileSync(path.join(dir, "Labor.pdf"), "%PDF-1.4 fake");
    const skipped = [];
    const sources = readSources(dir, {
      pdfAvailable: true,
      extractPdf: () => { throw new PdftotextUnavailableError(); },
      onSkip: (file, reason) => skipped.push({ file, reason }),
    });
    assert.strictEqual(sources.length, 0, "unavailable extractor skips the PDF");
    assert.deepStrictEqual(skipped, [{ file: "Labor.pdf", reason: "pdftotext-unavailable" }]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pdf-text: readSources skips extension-named directories before text or PDF extraction", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-src4-"));
  try {
    fs.writeFileSync(path.join(dir, "Tax.txt"), "Հոդված 1. Տեքստ");
    fs.mkdirSync(path.join(dir, "Archive.pdf"));
    fs.mkdirSync(path.join(dir, "Notes.md"));
    const skipped = [];
    const sources = readSources(dir, {
      pdfAvailable: true,
      extractPdf: () => { throw new Error("directory should not be extracted"); },
      onSkip: (file, reason) => skipped.push({ file, reason }),
    });
    assert.strictEqual(sources.length, 1, "only regular source files are ingested");
    assert.deepStrictEqual(
      skipped,
      [
        { file: "Archive.pdf", reason: "not-a-file" },
        { file: "Notes.md", reason: "not-a-file" },
      ]
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pdf-text: readSources skips extension-named symlinks before text or PDF extraction", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-src5-"));
  try {
    fs.writeFileSync(path.join(dir, "Tax.txt"), "Հոդված 1. Տեքստ");
    fs.symlinkSync(path.join(dir, "Tax.txt"), path.join(dir, "Linked.pdf"));
    const skipped = [];
    const sources = readSources(dir, {
      pdfAvailable: true,
      extractPdf: () => { throw new Error("symlink should not be extracted"); },
      onSkip: (file, reason) => skipped.push({ file, reason }),
    });
    assert.strictEqual(sources.length, 1, "only regular source files are ingested");
    assert.deepStrictEqual(skipped, [{ file: "Linked.pdf", reason: "symlink" }]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pdf-text: readSources skips hidden extension-named sidecars before text or PDF extraction", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-src6-"));
  try {
    fs.writeFileSync(path.join(dir, "Tax.txt"), "Հոդված 1. Տեքստ");
    fs.writeFileSync(path.join(dir, "._Tax.pdf"), "AppleDouble sidecar");
    fs.writeFileSync(path.join(dir, ".Draft.md"), "hidden draft");
    const skipped = [];
    const sources = readSources(dir, {
      pdfAvailable: true,
      extractPdf: () => { throw new Error("hidden sidecar should not be extracted"); },
      onSkip: (file, reason) => skipped.push({ file, reason }),
    });
    assert.strictEqual(sources.length, 1, "only visible regular source files are ingested");
    assert.deepStrictEqual(
      skipped,
      [
        { file: ".Draft.md", reason: "hidden-file" },
        { file: "._Tax.pdf", reason: "hidden-file" },
      ]
    );
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("pdf-text: readSources skips text read failures without aborting the whole source set", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-src7-"));
  try {
    fs.writeFileSync(path.join(dir, "Broken.md"), "unreadable placeholder");
    fs.writeFileSync(path.join(dir, "Tax.txt"), "Հոդված 1. Տեքստ");
    const skipped = [];
    const sources = readSources(dir, {
      readText: (file) => {
        if (path.basename(file) === "Broken.md") throw new Error("permission denied");
        return fs.readFileSync(file, "utf8");
      },
      onSkip: (file, reason) => skipped.push({ file, reason }),
    });
    assert.strictEqual(sources.length, 1, "readable source files still ingest");
    assert.strictEqual(sources[0].lawTitle, "Tax");
    assert.deepStrictEqual(skipped, [{ file: "Broken.md", reason: "read-failed" }]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
