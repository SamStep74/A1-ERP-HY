"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Isolate the AI settings file per test process (settings are written to the data dir).
process.env.ARMOSPHERA_ONE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "aoc-ai-endpoints-"));

const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

async function login(app, email = DEFAULT_EMAIL, password = DEFAULT_PASSWORD) {
  const res = await app.inject({ method: "POST", url: "/api/login", payload: { email, password } });
  return res.headers["set-cookie"];
}

test("AI settings round-trip: save key/models/open-notebook, read back redacted", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);

    const before = await app.inject({ method: "GET", url: "/api/ai/settings", headers: { cookie } });
    assert.strictEqual(before.statusCode, 200, before.body);
    const b = before.json();
    assert.strictEqual(b.provider, "openrouter");
    assert.strictEqual(b.settings.openrouterApiKeySet, false);
    assert.ok(b.settings.models && Object.prototype.hasOwnProperty.call(b.settings.models, "copilot"));
    assert.strictEqual(b.settings.openNotebook.enabled, false);

    const put = await app.inject({
      method: "PUT", url: "/api/ai/settings", headers: { cookie },
      payload: {
        openrouterApiKey: "sk-or-secret-123",
        models: { default: "anthropic/claude-3.5-sonnet", copilot: "openai/gpt-4o", finance: "openai/gpt-4o-mini" },
        openNotebook: { enabled: true, baseUrl: "https://nb.a1.am/", apiKey: "on-secret" }
      }
    });
    assert.strictEqual(put.statusCode, 200, put.body);
    const p = put.json();
    assert.strictEqual(p.ok, true);
    assert.strictEqual(p.settings.openrouterApiKeySet, true);
    assert.strictEqual(p.settings.openrouterApiKey, undefined, "raw OpenRouter key must never be returned");
    assert.strictEqual(p.settings.models.default, "anthropic/claude-3.5-sonnet");
    assert.strictEqual(p.settings.openNotebook.enabled, true);
    assert.strictEqual(p.settings.openNotebook.baseUrl, "https://nb.a1.am", "trailing slash trimmed");
    assert.strictEqual(p.settings.openNotebook.apiKeySet, true);
    assert.strictEqual(p.settings.openNotebook.apiKey, undefined);

    // Whole response must not leak either raw secret.
    assert.ok(!put.body.includes("sk-or-secret-123"));
    assert.ok(!put.body.includes("on-secret"));

    const after = await app.inject({ method: "GET", url: "/api/ai/settings", headers: { cookie } });
    assert.strictEqual(after.json().settings.models.copilot, "openai/gpt-4o");
  } finally {
    await app.close();
  }
});

test("GET /api/ai/models always returns a non-empty menu (fallback when egress off)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const res = await app.inject({ method: "GET", url: "/api/ai/models", headers: { cookie } });
    assert.strictEqual(res.statusCode, 200, res.body);
    const j = res.json();
    assert.strictEqual(j.provider, "openrouter");
    assert.strictEqual(j.online, false, "egress is off in tests");
    assert.strictEqual(j.source, "fallback");
    assert.ok(Array.isArray(j.models) && j.models.length > 0, "dropdown is never empty");
    assert.ok(j.models[0].id && j.models[0].name);
  } finally {
    await app.close();
  }
});

test("PUT /api/ai/settings validates input (400 on bad baseUrl and non-string key)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const cookie = await login(app);
    const badUrl = await app.inject({
      method: "PUT", url: "/api/ai/settings", headers: { cookie },
      payload: { openNotebook: { baseUrl: "ftp://nope" } }
    });
    assert.strictEqual(badUrl.statusCode, 400, badUrl.body);

    const badKey = await app.inject({
      method: "PUT", url: "/api/ai/settings", headers: { cookie },
      payload: { openrouterApiKey: 12345 }
    });
    assert.strictEqual(badKey.statusCode, 400, badKey.body);
  } finally {
    await app.close();
  }
});

test("AI settings are Owner-only (Operator is forbidden)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const operator = await login(app, "operator@armosphera.local", DEFAULT_PASSWORD);
    const res = await app.inject({ method: "GET", url: "/api/ai/settings", headers: { cookie: operator } });
    assert.strictEqual(res.statusCode, 403, res.body);
  } finally {
    await app.close();
  }
});
