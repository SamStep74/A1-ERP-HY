"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const config = require("../server/config");

const DEFAULT_SOURCE = path.join(os.homedir(), "Library", "Application Support", "HayHashvapahWebClaude", "data", "laws.sqlite");
const source = process.argv[2] || DEFAULT_SOURCE;
const dest = config.resolveLawsDbPath();

if (!fs.existsSync(source)) {
  console.error(`Source laws DB not found: ${source}\nUsage: node scripts/install-laws.js [path-to-laws.sqlite]`);
  process.exit(1);
}
try {
  const db = new DatabaseSync(source);
  db.prepare("SELECT id, law_title, article, text, embedding FROM law_chunks LIMIT 1").get();
  db.close();
} catch (error) {
  console.error(`Not a valid laws.sqlite (missing law_chunks): ${error.message}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(source, dest);
console.log(`Installed legal KB -> ${dest}`);
console.log("Note: if the source DB uses WAL, checkpoint it first so all rows copy.");
