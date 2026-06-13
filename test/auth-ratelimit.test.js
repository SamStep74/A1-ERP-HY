"use strict";
// The auth endpoints (POST /api/login and /api/login/mfa) are unauthenticated and the
// primary credential / MFA brute-force surface. They must be throttled:
//   - login: per-IP (stops single-IP password spraying) AND per-email (stops a
//     distributed attack hammering one account from many IPs).
//   - login/mfa: a strict per-challenge cap so a 6-digit TOTP (1e6 combos) can never
//     be brute-forced — once a challenge's attempts are spent it's dead.
// Loopback is exempt (local-first product); these tests use external IPs.
const assert = require("node:assert");
const crypto = require("node:crypto");
const test = require("node:test");
const { buildApp } = require("../server/app");
const { DEFAULT_EMAIL, DEFAULT_PASSWORD } = require("../server/db");

function totpCode(secretBase32, nowMs = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(secretBase32 || "").replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) { const v = alphabet.indexOf(char); if (v < 0) continue; bits += v.toString(2).padStart(5, "0"); }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Math.floor(nowMs / 30000);
  const cb = Buffer.alloc(8); cb.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", Buffer.from(bytes)).update(cb).digest();
  const off = digest[digest.length - 1] & 0x0f;
  const bin = ((digest[off] & 0x7f) << 24) | ((digest[off + 1] & 0xff) << 16) | ((digest[off + 2] & 0xff) << 8) | (digest[off + 3] & 0xff);
  return String(bin % 1000000).padStart(6, "0");
}

test("auth: login is per-IP rate limited (429) from one external IP", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const ip = "203.0.113.80";
    let unauthorized = 0, limited = 0;
    // Isolate the per-IP axis: a DISTINCT (non-existent) email each attempt so the per-email
    // limiter never accumulates and no password hash is computed — only the per-IP cap can trip.
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: `spray-${i}@nowhere.test`, password: "wrong" }, remoteAddress: ip });
      if (res.statusCode === 401) unauthorized += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected ${res.statusCode} at ${i}`);
    }
    assert.ok(unauthorized > 0, "some attempts processed (401) before the limit");
    assert.ok(unauthorized <= 12, `per-IP burst bounded (~10/min), got ${unauthorized}`);
    assert.ok(limited > 0, "excess login attempts from one IP must be 429");

    // A different IP is not blocked by the first IP's flood (fresh email keeps it per-IP only).
    const other = await app.inject({ method: "POST", url: "/api/login", payload: { email: "spray-fresh@nowhere.test", password: "wrong" }, remoteAddress: "198.51.100.80" });
    assert.strictEqual(other.statusCode, 401, "a fresh IP can still attempt login");
  } finally { await app.close(); }
});

test("auth: trusted proxy client IP is used for loopback login throttling", async () => {
  const localApp = buildApp({ dbPath: ":memory:" });
  try {
    await localApp.ready();
    for (let i = 0; i < 15; i++) {
      const res = await localApp.inject({
        method: "POST",
        url: "/api/login",
        payload: { email: `local-${i}@nowhere.test`, password: "wrong" },
        remoteAddress: "127.0.0.1",
        headers: { "cf-connecting-ip": "203.0.113.82" }
      });
      assert.strictEqual(res.statusCode, 401, "plain local loopback remains exempt when proxy trust is not configured");
    }
  } finally { await localApp.close(); }

  const proxiedApp = buildApp({
    dbPath: ":memory:",
    env: {
      ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1",
      ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "cf-connecting-ip"
    }
  });
  try {
    await proxiedApp.ready();
    let unauthorized = 0;
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await proxiedApp.inject({
        method: "POST",
        url: "/api/login",
        payload: { email: `proxied-${i}@nowhere.test`, password: "wrong" },
        remoteAddress: "127.0.0.1",
        headers: { "cf-connecting-ip": "203.0.113.82" }
      });
      if (res.statusCode === 401) unauthorized += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected trusted-proxy login status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(unauthorized > 0, "some proxied login attempts are processed before the limit");
    assert.ok(limited > 0, "trusted-proxy loopback login attempts are throttled by public client IP");
  } finally { await proxiedApp.close(); }
});

test("auth: malformed trusted-proxy x-forwarded-for still falls into a non-exempt login bucket", async () => {
  const app = buildApp({
    dbPath: ":memory:",
    env: {
      ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1",
      ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "x-forwarded-for"
    }
  });
  try {
    await app.ready();
    let unauthorized = 0;
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/login",
        payload: { email: `xff-spoof-${i}@nowhere.test`, password: "wrong" },
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": `198.51.100.${i + 1}, 127.0.0.1` }
      });
      if (res.statusCode === 401) unauthorized += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected trusted-proxy XFF login status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(unauthorized > 0, "some malformed-XFF login attempts are processed before the limit");
    assert.ok(limited > 0, "malformed trusted-proxy XFF must not re-enter the loopback throttle exemption");
  } finally { await app.close(); }
});

test("auth: login is per-email rate limited (429) even across rotating IPs", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    // A fixed victim email (non-existent → no password hashing); the attack rotates IPs.
    const victim = "victim@nowhere.test";
    let unauthorized = 0, limited = 0;
    // Distributed attack: a NEW IP every request, all targeting one account.
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: "POST", url: "/api/login", payload: { email: victim, password: "wrong" }, remoteAddress: `10.0.${i}.${i + 1}` });
      if (res.statusCode === 401) unauthorized += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected ${res.statusCode} at ${i}`);
    }
    assert.ok(unauthorized > 0, "some attempts processed before the per-email limit");
    assert.ok(unauthorized <= 7, `per-email burst bounded (~5/min), got ${unauthorized}`);
    assert.ok(limited > 0, "rotating-IP attack on one account must still hit 429");

    // A DIFFERENT account from one of those IPs is unaffected (limit is per-email).
    const otherAccount = await app.inject({ method: "POST", url: "/api/login", payload: { email: "other-victim@nowhere.test", password: "wrong" }, remoteAddress: "10.0.99.99" });
    assert.strictEqual(otherAccount.statusCode, 401, "a different account is not collateral-limited");
  } finally { await app.close(); }
});

test("auth: MFA challenge has a strict attempt cap so a TOTP cannot be brute-forced (429)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    // Enroll + activate TOTP for the owner (loopback exempt, so setup isn't throttled).
    const ownerCookie = (await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD } })).headers["set-cookie"];
    const enrollment = (await app.inject({ method: "POST", url: "/api/security/mfa/enroll", headers: { cookie: ownerCookie }, payload: { label: "Auth" } })).json();
    await app.inject({ method: "POST", url: "/api/security/mfa/verify-enrollment", headers: { cookie: ownerCookie }, payload: { factorId: enrollment.factor.id, code: totpCode(enrollment.setup.manualSetupKey) } });

    // Password step now returns an MFA challenge.
    const pwd = await app.inject({ method: "POST", url: "/api/login", payload: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD }, remoteAddress: "203.0.113.81" });
    assert.strictEqual(pwd.json().mfaRequired, true);
    const challengeId = pwd.json().challengeId;

    // Hammer wrong codes at this ONE challenge from rotating IPs — must be capped at 429
    // well before 1e6 guesses, regardless of source IP.
    let unauthorized = 0, limited = 0;
    for (let i = 0; i < 15; i++) {
      const res = await app.inject({ method: "POST", url: "/api/login/mfa", payload: { challengeId, code: "000000" }, remoteAddress: `172.16.${i}.${i + 2}` });
      if (res.statusCode === 401) unauthorized += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected ${res.statusCode} at ${i}`);
    }
    assert.ok(unauthorized > 0, "a few wrong codes are processed (401)");
    assert.ok(unauthorized <= 6, `per-challenge cap is strict (~5), got ${unauthorized}`);
    assert.ok(limited > 0, "the challenge locks out (429) before the TOTP space can be searched");
  } finally { await app.close(); }
});
