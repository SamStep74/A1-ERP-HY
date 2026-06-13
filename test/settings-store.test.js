const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const store = require("../server/settingsStore");

function withTmpDataDir(fn) {
  const prev = process.env.ARMOSPHERA_ONE_DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aoc-settings-"));
  process.env.ARMOSPHERA_ONE_DATA_DIR = dir;
  try { return fn(dir); }
  finally {
    if (prev === undefined) delete process.env.ARMOSPHERA_ONE_DATA_DIR; else process.env.ARMOSPHERA_ONE_DATA_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("getSettings returns safe defaults when no file exists", () => {
  withTmpDataDir(() => {
    const s = store.getSettings();
    assert.strictEqual(s.openrouterApiKey, "");
    assert.deepStrictEqual(Object.keys(s.models).sort(), ["copilot", "crm", "default", "docs", "finance", "transform"]);
    assert.strictEqual(s.openNotebook.enabled, false);
    assert.strictEqual(s.openNotebook.baseUrl, "");
  });
});

test("updateSettings persists and round-trips through disk", () => {
  withTmpDataDir(() => {
    store.updateSettings({
      openrouterApiKey: "sk-or-abc",
      models: { default: "anthropic/claude-3.5-sonnet", copilot: "openai/gpt-4o" },
      openNotebook: { enabled: true, baseUrl: "https://notebook.a1.am/", apiKey: "on-key" }
    });
    const s = store.getSettings();
    assert.strictEqual(s.openrouterApiKey, "sk-or-abc");
    assert.strictEqual(s.models.default, "anthropic/claude-3.5-sonnet");
    assert.strictEqual(s.models.copilot, "openai/gpt-4o");
    assert.strictEqual(s.openNotebook.enabled, true);
    assert.strictEqual(s.openNotebook.baseUrl, "https://notebook.a1.am", "trailing slash trimmed");
    assert.strictEqual(s.openNotebook.apiKey, "on-key");
  });
});

test("updateSettings deep-merges — a partial patch never wipes other fields", () => {
  withTmpDataDir(() => {
    store.updateSettings({ openrouterApiKey: "sk-or-1", models: { default: "m-default" } });
    store.updateSettings({ models: { copilot: "m-copilot" } });
    const s = store.getSettings();
    assert.strictEqual(s.openrouterApiKey, "sk-or-1", "key preserved across a models-only patch");
    assert.strictEqual(s.models.default, "m-default", "default preserved");
    assert.strictEqual(s.models.copilot, "m-copilot", "copilot added");
  });
});

test("redactedForClient hides secrets but exposes set-flags and non-secret config", () => {
  withTmpDataDir(() => {
    store.updateSettings({ openrouterApiKey: "sk-or-secret", openNotebook: { enabled: true, baseUrl: "https://nb.a1.am", apiKey: "on-secret" } });
    const r = store.redactedForClient(store.getSettings());
    assert.strictEqual(r.openrouterApiKey, undefined, "raw key never leaves the server");
    assert.strictEqual(r.openrouterApiKeySet, true);
    assert.strictEqual(r.openNotebook.apiKey, undefined);
    assert.strictEqual(r.openNotebook.apiKeySet, true);
    assert.strictEqual(r.openNotebook.baseUrl, "https://nb.a1.am", "non-secret config still visible");
    assert.ok(r.models, "model policy visible to the UI");
  });
});

test("the settings file is not group/world readable (secret at rest)", () => {
  withTmpDataDir(dir => {
    store.updateSettings({ openrouterApiKey: "sk-or-x" });
    const file = path.join(dir, "ai-settings.json");
    assert.ok(fs.existsSync(file));
    const mode = fs.statSync(file).mode & 0o777;
    assert.strictEqual(mode & 0o077, 0, `expected 0600-style perms, got ${mode.toString(8)}`);
  });
});

test("getSettings tolerates a corrupt file and falls back to defaults", () => {
  withTmpDataDir(dir => {
    fs.writeFileSync(path.join(dir, "ai-settings.json"), "{ not json");
    const s = store.getSettings();
    assert.strictEqual(s.openrouterApiKey, "");
  });
});

test("resolveModelPolicy lets stored selections override empty config defaults", () => {
  withTmpDataDir(() => {
    store.updateSettings({ models: { default: "stored/default", finance: "stored/finance" } });
    const policy = store.resolveModelPolicy();
    assert.strictEqual(policy.default, "stored/default");
    assert.strictEqual(policy.finance, "stored/finance");
    assert.ok(Object.prototype.hasOwnProperty.call(policy, "copilot"));
  });
});
