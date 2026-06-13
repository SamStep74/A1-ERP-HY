"use strict";

/**
 * Thin adapter over the shared @a1/ai settings store (vendored at ./vendor/a1-ai).
 *
 * Same public API + behavior as before (getSettings / updateSettings /
 * redactedForClient / resolveModelPolicy / MODEL_KEYS / defaults); the storage
 * logic is now shared across A1 products. resolveDataDir defers to config.* at
 * call time so ARMOSPHERA_ONE_DATA_DIR (per-test / per-deploy) is honored.
 */

const config = require("./config");
const a1ai = require("./vendor/a1-ai");

module.exports = a1ai.createSettingsStore({
  resolveDataDir: () => config.resolveDataDir(),
  defaultModels: config.aiModels
});
