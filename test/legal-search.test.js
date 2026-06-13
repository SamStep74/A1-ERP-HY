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

test("GET /api/legal/law-search returns cited articles (auth required)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aoc-laws-ep-"));
  const lawsDb = path.join(dir, "laws.sqlite");
  seedLawsDb(lawsDb);
  const prev = process.env.ARMOSPHERA_ONE_LAWS_DB;
  process.env.ARMOSPHERA_ONE_LAWS_DB = lawsDb;
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const unauth = await app.inject({ method: "GET", url: "/api/legal/law-search?q=ԱԱՀ" });
    assert.strictEqual(unauth.statusCode, 401);
    const cookie = await login(app);
    const res = await app.inject({ method: "GET", url: "/api/legal/law-search?q=" + encodeURIComponent("ԱԱՀ դրույքաչափ տոկոս"), headers: { cookie } });
    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.ready, true);
    assert.ok(body.results.length > 0);
    assert.match(body.results[0].article, /63/);

    const limited = await app.inject({
      method: "GET",
      url: "/api/legal/law-search?q=" + encodeURIComponent("ԱԱՀ") + "&k=1",
      headers: { cookie }
    });
    assert.strictEqual(limited.statusCode, 200);
    assert.ok(limited.json().results.length <= 1);
  } finally {
    await app.close();
    if (prev === undefined) delete process.env.ARMOSPHERA_ONE_LAWS_DB; else process.env.ARMOSPHERA_ONE_LAWS_DB = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GET /api/legal/law-search rejects malformed query metadata before search", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const rejectedUrls = [
      "/api/legal/law-search?q=%00",
      "/api/legal/law-search?q=" + encodeURIComponent("Ա".repeat(501)),
      "/api/legal/law-search?q=ԱԱՀ&k=abc",
      "/api/legal/law-search?q=ԱԱՀ&k=0",
      "/api/legal/law-search?q=ԱԱՀ&k=21",
      "/api/legal/law-search?q=ԱԱՀ&k=1.5"
    ];

    for (const url of rejectedUrls) {
      const rejected = await app.inject({ method: "GET", url, headers: { cookie } });
      assert.strictEqual(rejected.statusCode, 400, rejected.body);
    }
  } finally {
    await app.close();
  }
});
