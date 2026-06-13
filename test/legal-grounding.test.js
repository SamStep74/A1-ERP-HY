"use strict";
const test = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { seedLawsDb } = require("./fixtures/seed-laws");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } });
  return res.headers["set-cookie"];
}
async function askVat(app, cookie, customerId) {
  return app.inject({
    method: "POST", url: "/api/legal/questions", headers: { cookie },
    payload: { customerId, topic: "vat", question: "Ի՞նչ է ԱԱՀ դրույքաչափը և տոկոսը հարկվող շրջանառության համար" }
  });
}

test("legal answer excerpt is grounded in a real law article when KB is ready", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aoc-lg-"));
  const lawsDb = path.join(dir, "laws.sqlite");
  seedLawsDb(lawsDb);
  const prev = process.env.ARMOSPHERA_ONE_LAWS_DB;
  process.env.ARMOSPHERA_ONE_LAWS_DB = lawsDb;
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const res = await askVat(app, cookie, "cust-ani");
    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    const tax = body.sources.find(s => s.id === "law-tax-code");
    assert.ok(tax, "tax-code source present");
    assert.ok(tax.relevance >= 90, "relevance preserved");
    assert.match(tax.excerpt, /Հոդված/, "excerpt grounded in a real article citation");
  } finally {
    await app.close();
    if (prev === undefined) delete process.env.ARMOSPHERA_ONE_LAWS_DB; else process.env.ARMOSPHERA_ONE_LAWS_DB = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("legal answer excerpt falls back to the static reference when KB absent", async () => {
  const prev = process.env.ARMOSPHERA_ONE_LAWS_DB;
  process.env.ARMOSPHERA_ONE_LAWS_DB = path.join(os.tmpdir(), "definitely-absent-aoc.sqlite");
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const res = await askVat(app, cookie, "cust-ani");
    const body = res.json();
    const tax = body.sources.find(s => s.id === "law-tax-code");
    assert.ok(tax);
    assert.doesNotMatch(tax.excerpt, /Հոդված/);
  } finally {
    await app.close();
    if (prev === undefined) delete process.env.ARMOSPHERA_ONE_LAWS_DB; else process.env.ARMOSPHERA_ONE_LAWS_DB = prev;
  }
});
