const test = require("node:test");
const assert = require("node:assert");
const config = require("../server/config");
const on = require("../server/openNotebook");

function withFetch(impl, fn) {
  config.setFetchImpl(impl);
  return Promise.resolve(fn()).finally(() => config.setFetchImpl((...a) => globalThis.fetch(...a)));
}

const enabled = (extra = {}) => ({ openNotebook: { enabled: true, baseUrl: "https://nb.a1.am", apiKey: "on-key", ...extra } });

test("isEnabled requires both the toggle and a baseUrl", () => {
  assert.strictEqual(on.isEnabled({ openNotebook: { enabled: false, baseUrl: "https://nb.a1.am" } }), false);
  assert.strictEqual(on.isEnabled({ openNotebook: { enabled: true, baseUrl: "" } }), false);
  assert.strictEqual(on.isEnabled(enabled()), true);
});

test("normalizeResults accepts results/sources/array shapes and drops empty text", () => {
  const r = on.normalizeResults({ results: [
    { title: "Tax Law", content: "VAT rate text", score: 0.9, url: "https://nb.a1.am/s/1" },
    { name: "no-text" }
  ] }, 6);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(r[0], { title: "Tax Law", text: "VAT rate text", score: 0.9, sourceUrl: "https://nb.a1.am/s/1", origin: "open-notebook" });
  assert.strictEqual(on.normalizeResults([{ text: "x" }], 6).length, 1);
  assert.strictEqual(on.normalizeResults({ sources: [{ snippet: "y" }] }, 6)[0].text, "y");
});

test("search is a no-op (and never calls fetch) when the connector is disabled", async () => {
  let called = false;
  await withFetch(async () => { called = true; return { ok: true, json: async () => ({}) }; }, async () => {
    const out = await on.search("vat rate", { settings: { openNotebook: { enabled: false } }, env: {} });
    assert.deepStrictEqual(out, []);
    assert.strictEqual(called, false);
  });
});

test("search returns [] for an empty query", async () => {
  const out = await on.search("   ", { settings: enabled(), env: { ARMOSPHERA_ONE_ALLOW_EGRESS: "1", ARMOSPHERA_ONE_EGRESS_ALLOWLIST: "nb.a1.am" } });
  assert.deepStrictEqual(out, []);
});

test("search swallows egress-blocked errors (opt-in, gated) and returns []", async () => {
  // enabled + remote host, but egress is off -> safeFetch throws -> connector must not bubble it up.
  const out = await on.search("vat", { settings: enabled(), env: {} });
  assert.deepStrictEqual(out, []);
});

test("search queries a LIVE allowlisted instance, posting query+limit with auth", async () => {
  let seenUrl = ""; let seenBody = null; let seenAuth = "";
  await withFetch(async (url, opts) => {
    seenUrl = url; seenBody = JSON.parse(opts.body); seenAuth = opts.headers.Authorization;
    return { ok: true, json: async () => ({ results: [{ title: "RA Tax Code", content: "Article 63", score: 0.8 }] }) };
  }, async () => {
    const out = await on.search("vat 2026", {
      settings: enabled(), k: 5,
      env: { ARMOSPHERA_ONE_ALLOW_EGRESS: "1", ARMOSPHERA_ONE_EGRESS_ALLOWLIST: "nb.a1.am" }
    });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].text, "Article 63");
    assert.match(seenUrl, /^https:\/\/nb\.a1\.am\/api\/search$/);
    assert.deepStrictEqual(seenBody, { query: "vat 2026", limit: 5 });
    assert.strictEqual(seenAuth, "Bearer on-key");
  });
});

test("search works against a loopback instance even when egress is globally off", async () => {
  await withFetch(async () => ({ ok: true, json: async () => ({ results: [{ text: "local notebook hit", score: 0.5 }] }) }), async () => {
    const out = await on.search("q", { settings: { openNotebook: { enabled: true, baseUrl: "http://127.0.0.1:9999", apiKey: "" } }, env: {} });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].text, "local notebook hit");
  });
});
