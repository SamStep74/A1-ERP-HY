"use strict";
// Tests for the loadOr resilience primitive used by the post-login workspace
// loader: a failing panel fetch (non-401) should degrade to a fallback value
// instead of blanking the whole workspace, while a 401 must propagate so the
// top-level logout/redirect still fires.
//
// The helper is ESM (web/src/load-section.js, "type":"module"); this CJS test
// (root package is "type":"commonjs") loads it via dynamic import().
const test = require("node:test");
const assert = require("node:assert/strict");

async function getLoadOr() {
  const mod = await import("../web/src/load-section.js");
  return mod.loadOr;
}

test("returns the fetcher's resolved value on success", async () => {
  const loadOr = await getLoadOr();
  const result = await loadOr(["fallback"], async () => ["live", "data"]);
  assert.deepEqual(result, ["live", "data"]);
});

test("returns the fallback when the fetcher throws a non-401 error", async () => {
  const loadOr = await getLoadOr();
  const fallback = { items: [] };
  const err = new Error("server exploded");
  err.status = 500;
  const result = await loadOr(fallback, async () => { throw err; });
  assert.equal(result, fallback);
});

test("returns the fallback for a thrown error with no status", async () => {
  const loadOr = await getLoadOr();
  const result = await loadOr("safe", async () => { throw new Error("network"); });
  assert.equal(result, "safe");
});

test("rethrows a 401 so the top-level logout can handle it", async () => {
  const loadOr = await getLoadOr();
  const err = new Error("unauthorized");
  err.status = 401;
  await assert.rejects(
    () => loadOr("ignored-fallback", async () => { throw err; }),
    (thrown) => thrown === err,
  );
});

test("calls the fetcher exactly once", async () => {
  const loadOr = await getLoadOr();
  let calls = 0;
  await loadOr(null, async () => { calls += 1; return calls; });
  assert.equal(calls, 1);
});
