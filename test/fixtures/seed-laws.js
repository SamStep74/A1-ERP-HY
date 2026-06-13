"use strict";
const { DatabaseSync } = require("node:sqlite");

/** Build a tiny laws.sqlite (no embeddings) for offline BM25 tests. */
function seedLawsDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE IF NOT EXISTS law_chunks (id INTEGER PRIMARY KEY, law_title TEXT, article TEXT, text TEXT, embedding BLOB)");
  const rows = [
    ["ՀՀ հարկային օրենսգիրք", "Հոդված 63", "Ավելացված արժեքի հարկի դրույքաչափը սահմանվում է 20 տոկոս հարկվող շրջանառության նկատմամբ։"],
    ["ՀՀ հարկային օրենսգիրք", "Հոդված 64", "Ավելացված արժեքի հարկից ազատված գործարքների ցանկը սահմանվում է սույն օրենսգրքով։"],
    ["ՀՀ օրենք հաշվապահական հաշվառման մասին", "Հոդված 5", "Հաշվապահական հաշվառման հիմնական սկզբունքները և պահանջները։"],
    ["ՀՀ քաղաքացիական օրենսգիրք", "Հոդված 1", "Քաղաքացիական օրենսդրությունը կարգավորում է քաղաքացիաիրավական հարաբերությունները։"]
  ];
  const ins = db.prepare("INSERT INTO law_chunks (law_title, article, text, embedding) VALUES (?, ?, ?, NULL)");
  for (const r of rows) ins.run(r[0], r[1], r[2]);
  db.close();
}

module.exports = { seedLawsDb };
