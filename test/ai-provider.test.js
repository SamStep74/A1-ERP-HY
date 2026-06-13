const test = require("node:test");
const assert = require("node:assert");
const config = require("../server/config");
const ai = require("../server/aiProvider");

const ALLOW = { ARMOSPHERA_ONE_ALLOW_EGRESS: "1", ARMOSPHERA_ONE_EGRESS_ALLOWLIST: "openrouter.ai" };

function withFetch(impl, fn) {
  config.setFetchImpl(impl);
  return Promise.resolve(fn()).finally(() => config.setFetchImpl((...a) => globalThis.fetch(...a)));
}

test("normalizeModels maps OpenRouter shape and tolerates missing fields", () => {
  const out = ai.normalizeModels({
    data: [
      { id: "anthropic/claude", name: "Anthropic: Claude", context_length: 200000, pricing: { prompt: "0.000003", completion: "0.000015" } },
      { id: "x/bare" }
    ]
  });
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out[0], {
    id: "anthropic/claude",
    name: "Anthropic: Claude",
    contextLength: 200000,
    pricing: { prompt: "0.000003", completion: "0.000015" }
  });
  assert.strictEqual(out[1].id, "x/bare");
  assert.strictEqual(out[1].name, "x/bare", "name falls back to id");
  assert.strictEqual(out[1].contextLength, 0);
});

test("normalizeModels returns [] on malformed input", () => {
  assert.deepStrictEqual(ai.normalizeModels(null), []);
  assert.deepStrictEqual(ai.normalizeModels({ data: "nope" }), []);
});

test("listModels stays OFFLINE (fallback) and never calls fetch when egress is blocked", async () => {
  let called = false;
  await withFetch(async () => { called = true; return { ok: true, json: async () => ({}) }; }, async () => {
    const res = await ai.listModels({ env: {} });
    assert.strictEqual(res.online, false);
    assert.strictEqual(res.source, "fallback");
    assert.ok(res.models.length > 0, "fallback list is non-empty so the dropdown still renders");
    assert.strictEqual(called, false, "must not attempt egress when blocked");
  });
});

test("listModels fetches LIVE when openrouter.ai is allowlisted, sending auth + attribution headers", async () => {
  let seenUrl = ""; let seenHeaders = null;
  await withFetch(async (url, opts) => {
    seenUrl = url; seenHeaders = opts.headers;
    return { ok: true, json: async () => ({ data: [{ id: "openai/gpt-4o", name: "OpenAI: GPT-4o", context_length: 128000 }] }) };
  }, async () => {
    const res = await ai.listModels({ apiKey: "sk-or-test", env: ALLOW });
    assert.strictEqual(res.online, true);
    assert.strictEqual(res.source, "live");
    assert.strictEqual(res.models[0].id, "openai/gpt-4o");
    assert.match(seenUrl, /openrouter\.ai\/api\/v1\/models/);
    assert.strictEqual(seenHeaders.Authorization, "Bearer sk-or-test");
    assert.ok(seenHeaders["HTTP-Referer"], "OpenRouter attribution referer present");
    assert.ok(seenHeaders["X-Title"], "OpenRouter attribution title present");
  });
});

test("listModels degrades to fallback (not throw) when the live fetch errors", async () => {
  await withFetch(async () => { throw new Error("network down"); }, async () => {
    const res = await ai.listModels({ env: ALLOW });
    assert.strictEqual(res.online, false);
    assert.strictEqual(res.source, "fallback");
    assert.ok(res.models.length > 0);
  });
});

test("resolveModelForRequest precedence: module > aspect > default > auto", () => {
  const policy = { default: "d", copilot: "c", transform: "t", finance: "f", crm: "", docs: "" };
  assert.strictEqual(ai.resolveModelForRequest(policy, { aspect: "copilot", module: "finance" }), "f", "module override wins");
  assert.strictEqual(ai.resolveModelForRequest(policy, { aspect: "copilot", module: "crm" }), "c", "empty module falls to aspect");
  assert.strictEqual(ai.resolveModelForRequest(policy, { aspect: "transform" }), "t");
  assert.strictEqual(ai.resolveModelForRequest(policy, { module: "docs" }), "d", "empty module+no aspect falls to default");
  assert.strictEqual(ai.resolveModelForRequest({ default: "" }, { aspect: "copilot" }), "", "all empty => auto (empty)");
});
