"use strict";

/**
 * Thin adapter over the shared @a1/ai Open Notebook connector (vendored at
 * ./vendor/a1-ai). Same public API (isEnabled, normalizeResults, search,
 * DEFAULT_SEARCH_PATH) + behavior. safeFetch defers to config.safeFetch at call
 * time, so egress gating and test-time monkeypatching both keep working.
 */

const config = require("./config");
const a1ai = require("./vendor/a1-ai");

module.exports = a1ai.createOpenNotebook({
  safeFetch: (...args) => config.safeFetch(...args)
});
