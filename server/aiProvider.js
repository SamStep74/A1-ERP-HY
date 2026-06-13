"use strict";

/**
 * Thin adapter over the shared @a1/ai core (vendored at ./vendor/a1-ai).
 *
 * Behavior is identical to the previous inline implementation — the AI logic now
 * lives in @a1/ai so every A1 product shares one source of truth. The Suite injects
 * its own egress-gated fetch, egress predicate, and OpenRouter config. The injected
 * functions DEFER to config.* at call time, so test-time monkeypatching of
 * config.safeFetch / env-driven egress still takes effect.
 */

const config = require("./config");
const a1ai = require("./vendor/a1-ai");

const catalog = a1ai.createModelCatalog({
  safeFetch: (...args) => config.safeFetch(...args),
  isEgressAllowed: (...args) => config.isOpenRouterEgressAllowed(...args),
  openrouter: config.openrouter
});

module.exports = {
  FALLBACK_MODELS: a1ai.FALLBACK_MODELS,
  normalizeModels: a1ai.normalizeModels,
  listModels: catalog.listModels,
  resolveModelForRequest: a1ai.resolveModelForRequest,
  MODULES: a1ai.MODULES,
  ASPECTS: a1ai.ASPECTS
};
