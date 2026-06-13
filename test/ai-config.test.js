const test = require("node:test");
const assert = require("node:assert");
const config = require("../server/config");

// OpenRouter is the single cloud provider for the A1 Suite.
test("OpenRouter is configured as the cloud provider", () => {
  assert.strictEqual(config.openrouter.host, "openrouter.ai");
  assert.strictEqual(config.openrouter.baseUrl, "https://openrouter.ai/api/v1");
  assert.match(config.openrouter.modelsUrl, /openrouter\.ai\/api\/v1\/models$/);
});

test("copilot provider defaults to openrouter, not gemini", () => {
  // Default holds only when COPILOT_PROVIDER is unset in the environment.
  if (process.env.COPILOT_PROVIDER === undefined) {
    assert.strictEqual(config.ai.copilotProvider, "openrouter");
  }
  assert.notStrictEqual(config.ai.copilotProvider, "gemini");
});

test("per-aspect model policy keys exist (empty = pick from live menu)", () => {
  for (const key of ["default", "copilot", "transform", "finance", "crm", "docs"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(config.aiModels, key), `aiModels.${key} missing`);
  }
});

test("OpenRouter egress is gated: off by default, on only when allowed AND allowlisted", () => {
  assert.strictEqual(config.isOpenRouterEgressAllowed({}), false);
  assert.strictEqual(
    config.isOpenRouterEgressAllowed({ ARMOSPHERA_ONE_ALLOW_EGRESS: "1" }),
    false,
    "must stay blocked until openrouter.ai is explicitly allowlisted"
  );
  assert.strictEqual(
    config.isOpenRouterEgressAllowed({
      ARMOSPHERA_ONE_ALLOW_EGRESS: "1",
      ARMOSPHERA_ONE_EGRESS_ALLOWLIST: "openrouter.ai"
    }),
    true
  );
  // Allowlisted but egress globally off -> still blocked.
  assert.strictEqual(
    config.isOpenRouterEgressAllowed({ ARMOSPHERA_ONE_EGRESS_ALLOWLIST: "openrouter.ai" }),
    false
  );
});

test("local model + bge-m3 embeddings remain untouched (local-first)", () => {
  assert.strictEqual(config.lawEmbed.model, "bge-m3");
  assert.ok(config.ai.localBaseUrl.startsWith("http://127.0.0.1"));
});
