const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const config = require("../server/config");

test("PRODUCT identity is A1 Suite", () => {
  assert.strictEqual(config.PRODUCT.name, "A1 Suite");
  assert.strictEqual(config.PRODUCT.slug, "armosphera-one-claude");
});

test("computeDataDir honors explicit override", () => {
  const dir = config.computeDataDir({ ARMOSPHERA_ONE_DATA_DIR: "/tmp/aoc-x" });
  assert.strictEqual(dir, "/tmp/aoc-x");
});

test("computeDataDir honors A1_STUDIO_DATA_DIR", () => {
  const dir = config.computeDataDir({ A1_STUDIO_DATA_DIR: "/tmp/a1-studio-x" });
  assert.strictEqual(dir, "/tmp/a1-studio-x");
});

test("computeDataDir resolves per-platform app-support locations", () => {
  const mac = config.computeDataDir({}, "darwin", "/Users/demo");
  assert.strictEqual(mac, "/Users/demo/Library/Application Support/ArmospheraOneClaude");
  const linux = config.computeDataDir({}, "linux", "/home/demo");
  assert.strictEqual(linux, "/home/demo/.local/share/armosphera-one-claude");
  const win = config.computeDataDir({ APPDATA: "C:\\\\Users\\\\demo\\\\AppData\\\\Roaming" }, "win32", "C:\\\\Users\\\\demo");
  assert.ok(win.endsWith("ArmospheraOneClaude"));
});

test("resolveDbPath honors ARMOSPHERA_ONE_DB", () => {
  const prev = process.env.ARMOSPHERA_ONE_DB;
  process.env.ARMOSPHERA_ONE_DB = "/tmp/aoc.db";
  try { assert.strictEqual(config.resolveDbPath(), "/tmp/aoc.db"); }
  finally { if (prev === undefined) delete process.env.ARMOSPHERA_ONE_DB; else process.env.ARMOSPHERA_ONE_DB = prev; }
});

test("resolveDbPath prioritizes A1_STUDIO_SQLITE", () => {
  const prevLegacy = process.env.ARMOSPHERA_ONE_DB;
  const prevStudio = process.env.A1_STUDIO_SQLITE;
  process.env.A1_STUDIO_SQLITE = "/tmp/a1-studio.db";
  process.env.ARMOSPHERA_ONE_DB = "/tmp/legacy.db";
  try { assert.strictEqual(config.resolveDbPath(), "/tmp/a1-studio.db"); }
  finally {
    if (prevLegacy === undefined) delete process.env.ARMOSPHERA_ONE_DB; else process.env.ARMOSPHERA_ONE_DB = prevLegacy;
    if (prevStudio === undefined) delete process.env.A1_STUDIO_SQLITE; else process.env.A1_STUDIO_SQLITE = prevStudio;
  }
});

test("resolveDataDir creates the directory", () => {
  const tmp = path.join(os.tmpdir(), `aoc-${Date.now()}`);
  const prev = process.env.ARMOSPHERA_ONE_DATA_DIR;
  process.env.ARMOSPHERA_ONE_DATA_DIR = tmp;
  try {
    const dir = config.resolveDataDir();
    assert.strictEqual(dir, tmp);
    assert.ok(fs.existsSync(tmp));
  } finally {
    if (prev === undefined) delete process.env.ARMOSPHERA_ONE_DATA_DIR; else process.env.ARMOSPHERA_ONE_DATA_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("egress is OFF by default and blocks external hosts", () => {
  const prev = process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  delete process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  try {
    assert.strictEqual(config.allowEgress(), false);
    assert.throws(() => config.assertEgressAllowed("https://example.com/hook"), /EGRESS_BLOCKED|egress blocked/);
  } finally { if (prev !== undefined) process.env.ARMOSPHERA_ONE_ALLOW_EGRESS = prev; }
});

test("loopback is always allowed even when egress is off", () => {
  const prev = process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  delete process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  try { assert.doesNotThrow(() => config.assertEgressAllowed("http://127.0.0.1:9000/hook")); }
  finally { if (prev !== undefined) process.env.ARMOSPHERA_ONE_ALLOW_EGRESS = prev; }
});

test("external host allowed only when enabled and allowlisted", () => {
  const prevAllow = process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  const prevList = process.env.ARMOSPHERA_ONE_EGRESS_ALLOWLIST;
  process.env.ARMOSPHERA_ONE_ALLOW_EGRESS = "1";
  process.env.ARMOSPHERA_ONE_EGRESS_ALLOWLIST = "hooks.partner.am";
  try {
    assert.doesNotThrow(() => config.assertEgressAllowed("https://hooks.partner.am/x"));
    assert.throws(() => config.assertEgressAllowed("https://evil.example/x"), /egress blocked/);
  } finally {
    if (prevAllow === undefined) delete process.env.ARMOSPHERA_ONE_ALLOW_EGRESS; else process.env.ARMOSPHERA_ONE_ALLOW_EGRESS = prevAllow;
    if (prevList === undefined) delete process.env.ARMOSPHERA_ONE_EGRESS_ALLOWLIST; else process.env.ARMOSPHERA_ONE_EGRESS_ALLOWLIST = prevList;
  }
});

test("safeFetch blocks before calling fetch when egress is off", async () => {
  const prev = process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  delete process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  let called = false;
  config.setFetchImpl(async () => { called = true; return { ok: true }; });
  try {
    await assert.rejects(config.safeFetch("https://example.com/x", {}), /egress blocked/);
    assert.strictEqual(called, false);
  } finally {
    config.setFetchImpl((...a) => globalThis.fetch(...a));
    if (prev !== undefined) process.env.ARMOSPHERA_ONE_ALLOW_EGRESS = prev;
  }
});

test("IPv6 loopback [::1] is allowed when egress is off", () => {
  const prev = process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  delete process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  try { assert.doesNotThrow(() => config.assertEgressAllowed("http://[::1]:9000/hook")); }
  finally { if (prev !== undefined) process.env.ARMOSPHERA_ONE_ALLOW_EGRESS = prev; }
});

test("egress ON with empty allowlist blocks external hosts (deny-until-listed)", () => {
  const prevAllow = process.env.ARMOSPHERA_ONE_ALLOW_EGRESS;
  const prevList = process.env.ARMOSPHERA_ONE_EGRESS_ALLOWLIST;
  process.env.ARMOSPHERA_ONE_ALLOW_EGRESS = "1";
  delete process.env.ARMOSPHERA_ONE_EGRESS_ALLOWLIST;
  try { assert.throws(() => config.assertEgressAllowed("https://example.com/x"), /egress blocked/); }
  finally {
    if (prevAllow === undefined) delete process.env.ARMOSPHERA_ONE_ALLOW_EGRESS; else process.env.ARMOSPHERA_ONE_ALLOW_EGRESS = prevAllow;
    if (prevList !== undefined) process.env.ARMOSPHERA_ONE_EGRESS_ALLOWLIST = prevList;
  }
});

test("public client IP resolver ignores proxy headers by default", () => {
  const ip = config.resolvePublicClientIp({
    directIp: "203.0.113.10",
    headers: { "cf-connecting-ip": "198.51.100.10", "x-forwarded-for": "198.51.100.11" }
  }, {});
  assert.strictEqual(ip, "203.0.113.10");
});

test("public client IP resolver honors configured headers only from trusted proxies", () => {
  const env = {
    ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1, ::1",
    ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "cf-connecting-ip"
  };
  assert.strictEqual(config.resolvePublicClientIp({
    directIp: "127.0.0.1",
    headers: { "cf-connecting-ip": "198.51.100.12" }
  }, env), "198.51.100.12");
  assert.strictEqual(config.resolvePublicClientIp({
    directIp: "203.0.113.12",
    headers: { "cf-connecting-ip": "198.51.100.12" }
  }, env), "203.0.113.12");
});

test("public client IP resolver handles x-forwarded-for and malformed values deterministically", () => {
  const env = {
    ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1",
    ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "x-forwarded-for"
  };
  assert.strictEqual(config.resolvePublicClientIp({
    directIp: "127.0.0.1",
    headers: { "x-forwarded-for": "198.51.100.13" }
  }, env), "198.51.100.13");
  assert.strictEqual(config.resolvePublicClientIp({
    directIp: "127.0.0.1",
    headers: { "x-forwarded-for": "198.51.100.13, 203.0.113.13" }
  }, env), "127.0.0.1");
  assert.deepStrictEqual(config.resolvePublicClientIpDetails({
    directIp: "127.0.0.1",
    headers: { "x-forwarded-for": "198.51.100.13, 203.0.113.13" }
  }, env), {
    ip: "127.0.0.1",
    source: "trusted-proxy-fallback",
    reason: "multi-value-x-forwarded-for"
  });
  assert.strictEqual(config.resolvePublicClientIp({
    directIp: "127.0.0.1",
    headers: { "x-forwarded-for": "not-an-ip" }
  }, env), "127.0.0.1");
  assert.strictEqual(config.resolvePublicClientIp({
    directIp: "127.0.0.1",
    headers: { "x-forwarded-for": "a".repeat(200) }
  }, env), "127.0.0.1");
});

test("resolveLawsDbPath honors ARMOSPHERA_ONE_LAWS_DB", () => {
  const prev = process.env.ARMOSPHERA_ONE_LAWS_DB;
  process.env.ARMOSPHERA_ONE_LAWS_DB = "/tmp/laws-x.sqlite";
  try { assert.strictEqual(config.resolveLawsDbPath(), "/tmp/laws-x.sqlite"); }
  finally { if (prev === undefined) delete process.env.ARMOSPHERA_ONE_LAWS_DB; else process.env.ARMOSPHERA_ONE_LAWS_DB = prev; }
});

test("resolveLawsDbPath defaults to laws.sqlite in the data dir", () => {
  const prevLaws = process.env.ARMOSPHERA_ONE_LAWS_DB;
  const prevDir = process.env.ARMOSPHERA_ONE_DATA_DIR;
  delete process.env.ARMOSPHERA_ONE_LAWS_DB;
  process.env.ARMOSPHERA_ONE_DATA_DIR = "/tmp/aoc-dd";
  try { assert.strictEqual(config.resolveLawsDbPath(), "/tmp/aoc-dd/laws.sqlite"); }
  finally {
    if (prevLaws !== undefined) process.env.ARMOSPHERA_ONE_LAWS_DB = prevLaws;
    if (prevDir === undefined) delete process.env.ARMOSPHERA_ONE_DATA_DIR; else process.env.ARMOSPHERA_ONE_DATA_DIR = prevDir;
  }
});

test("lawEmbed defaults to bge-m3 on loopback Ollama", () => {
  assert.strictEqual(config.lawEmbed.model, "bge-m3");
  assert.strictEqual(config.lawEmbed.baseUrl, "http://127.0.0.1:11434");
});
