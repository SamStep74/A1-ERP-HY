"use strict";
// The public quote endpoints (GET /api/public/quotes/:token and POST .../accept) are
// unauthenticated and both resolve an attacker-supplied token via getPublicQuote — a
// token-enumeration surface. They must be per-IP rate limited so a single client cannot
// brute-force tokens or hammer the accept path.
const test = require("node:test");
const assert = require("node:assert");
const { buildApp } = require("../server/app");

// A seeded quote in "sent" status with a known public token (server/db.js).
const SEEDED_TOKEN = "public-quote-ani-inbox-token";

test("public quotes: GET is per-IP rate limited (429 after the burst); other IPs unaffected", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const url = `/api/public/quotes/${SEEDED_TOKEN}`;
    const attacker = "203.0.113.50";

    let ok = 0;
    let limited = 0;
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({ method: "GET", url, remoteAddress: attacker });
      if (res.statusCode === 200) ok += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(ok > 0, "some reads succeed before the limit");
    assert.ok(ok <= 35, `GET burst should be bounded (~30/min), got ${ok}`);
    assert.ok(limited > 0, "excess reads from one IP must be 429");

    // A different IP is not penalized by the attacker's flood.
    const other = await app.inject({ method: "GET", url, remoteAddress: "198.51.100.9" });
    assert.strictEqual(other.statusCode, 200, "a fresh IP can still read the quote");
  } finally { await app.close(); }
});

test("public quotes: token enumeration via GET is throttled even for unknown tokens (429)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const attacker = "203.0.113.51";
    let notFound = 0;
    let limited = 0;
    // Brute-force DIFFERENT tokens from one IP — per-token keying would never trip; per-IP must.
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({ method: "GET", url: `/api/public/quotes/guess-${i}`, remoteAddress: attacker });
      if (res.statusCode === 404) notFound += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(notFound > 0, "early guesses return 404");
    assert.ok(limited > 0, "sustained enumeration from one IP must be throttled with 429");
  } finally { await app.close(); }
});

test("public quotes: loopback token enumeration via GET is throttled by default", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    let notFound = 0;
    let limited = 0;
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({ method: "GET", url: `/api/public/quotes/loopback-guess-${i}`, remoteAddress: "127.0.0.1" });
      if (res.statusCode === 404) notFound += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected loopback GET status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(notFound > 0, "early loopback guesses return 404");
    assert.ok(limited > 0, "loopback tunnel quote enumeration must be throttled with 429");
  } finally { await app.close(); }
});

test("public quotes: untrusted forwarded headers cannot rotate around GET throttling", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    let notFound = 0;
    let limited = 0;
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({
        method: "GET",
        url: `/api/public/quotes/spoof-${i}`,
        remoteAddress: "203.0.113.54",
        headers: { "x-forwarded-for": `198.51.100.${i + 1}` }
      });
      if (res.statusCode === 404) notFound += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected untrusted-forwarded status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(notFound > 0, "early spoofed quote guesses return 404");
    assert.ok(limited > 0, "rotating untrusted forwarded headers must not bypass quote GET throttling");
  } finally { await app.close(); }
});

test("public quotes: malformed trusted-proxy x-forwarded-for still throttles GET enumeration", async () => {
  const app = buildApp({
    dbPath: ":memory:",
    env: {
      ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1",
      ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "x-forwarded-for"
    }
  });
  try {
    await app.ready();
    let notFound = 0;
    let limited = 0;
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({
        method: "GET",
        url: `/api/public/quotes/xff-spoof-${i}`,
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": `198.51.100.${i + 1}, 127.0.0.1` }
      });
      if (res.statusCode === 404) notFound += 1;
      else if (res.statusCode === 429) limited += 1;
      else assert.fail(`unexpected malformed-XFF quote status ${res.statusCode} on attempt ${i}`);
    }
    assert.ok(notFound > 0, "early malformed-XFF quote guesses return 404");
    assert.ok(limited > 0, "malformed trusted-proxy XFF must not bypass quote GET throttling");
  } finally { await app.close(); }
});

test("public quotes: POST accept is per-IP rate limited (429 after the burst)", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const url = `/api/public/quotes/${SEEDED_TOKEN}/accept`;
    const attacker = "203.0.113.52";
    const payload = { signerName: "Brute Forcer", signerEmail: "brute@example.com" };

    let handled = 0; // 200 (accepted/idempotent) or 4xx from acceptance logic
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({ method: "POST", url, payload, remoteAddress: attacker });
      if (res.statusCode === 429) limited += 1;
      else handled += 1;
    }
    assert.ok(handled > 0, "some accepts are processed before the limit");
    assert.ok(handled <= 15, `accept burst should be bounded (~10/min), got ${handled}`);
    assert.ok(limited > 0, "excess accept attempts from one IP must be 429");
  } finally { await app.close(); }
});

test("public quotes: loopback accept attempts are throttled by default", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const url = `/api/public/quotes/${SEEDED_TOKEN}/accept`;
    const payload = { signerName: "Loopback Buyer", signerEmail: "loopback-buyer@example.com" };

    let handled = 0;
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({ method: "POST", url, payload, remoteAddress: "127.0.0.1" });
      if (res.statusCode === 429) limited += 1;
      else handled += 1;
    }
    assert.ok(handled > 0, "some loopback accepts are processed before the limit");
    assert.ok(handled <= 15, `loopback accept burst should be bounded, got ${handled}`);
    assert.ok(limited > 0, "loopback tunnel quote accepts must be throttled with 429");
  } finally { await app.close(); }
});

test("public quotes: untrusted forwarded headers cannot rotate around accept throttling", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const url = `/api/public/quotes/${SEEDED_TOKEN}/accept`;
    const payload = { signerName: "Spoof Buyer", signerEmail: "spoof-buyer@example.com" };
    let handled = 0;
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({
        method: "POST",
        url,
        payload,
        remoteAddress: "203.0.113.55",
        headers: { "x-forwarded-for": `198.51.100.${i + 1}` }
      });
      if (res.statusCode === 429) limited += 1;
      else handled += 1;
    }
    assert.ok(handled > 0, "some spoofed-header accepts are processed before the limit");
    assert.ok(limited > 0, "rotating untrusted forwarded headers must not bypass quote accept throttling");
  } finally { await app.close(); }
});

test("public quotes: trusted proxy client IPs do not share one loopback accept bucket", async () => {
  const app = buildApp({
    dbPath: ":memory:",
    env: {
      ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1",
      ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "cf-connecting-ip"
    }
  });
  try {
    await app.ready();
    const url = `/api/public/quotes/${SEEDED_TOKEN}/accept`;
    const payload = { signerName: "Proxy Buyer", signerEmail: "proxy-buyer@example.com" };

    let handled = 0;
    let limited = 0;
    for (let i = 0; i < 25; i++) {
      const res = await app.inject({
        method: "POST",
        url,
        payload,
        remoteAddress: "127.0.0.1",
        headers: { "cf-connecting-ip": "198.51.100.1" }
      });
      if (res.statusCode === 429) limited += 1;
      else handled += 1;
    }
    assert.ok(handled > 0, "some proxied accepts are processed before the limit");
    assert.ok(limited > 0, "one proxied public quote accept client is still throttled");

    for (let i = 0; i < 20; i++) {
      const res = await app.inject({
        method: "POST",
        url,
        payload,
        remoteAddress: "127.0.0.1",
        headers: { "cf-connecting-ip": `198.51.100.${i + 2}` }
      });
      assert.notStrictEqual(res.statusCode, 429, `proxied client ${i} should not inherit a global loopback accept bucket`);
    }
  } finally { await app.close(); }
});

test("public quotes: acceptance evidence records the direct client IP", async () => {
  const app = buildApp({ dbPath: ":memory:" });
  try {
    await app.ready();
    const ip = "198.51.100.33";
    const res = await app.inject({
      method: "POST",
      url: `/api/public/quotes/${SEEDED_TOKEN}/accept`,
      payload: { signerName: "Direct Buyer", signerEmail: "buyer@example.com" },
      remoteAddress: ip
    });
    assert.strictEqual(res.statusCode, 200, res.body);
    const row = app.db.prepare("SELECT ip_address AS ipAddress FROM quote_acceptances WHERE quote_id = ?").get(res.json().quote.id);
    assert.strictEqual(row.ipAddress, ip);
  } finally { await app.close(); }
});

test("public quotes: acceptance evidence uses trusted proxy client IP only when configured", async () => {
  const untrusted = buildApp({ dbPath: ":memory:" });
  try {
    await untrusted.ready();
    const res = await untrusted.inject({
      method: "POST",
      url: `/api/public/quotes/${SEEDED_TOKEN}/accept`,
      payload: { signerName: "Spoof Evidence", signerEmail: "spoof-evidence@example.com" },
      remoteAddress: "203.0.113.56",
      headers: { "cf-connecting-ip": "198.51.100.56" }
    });
    assert.strictEqual(res.statusCode, 200, res.body);
    const row = untrusted.db.prepare("SELECT ip_address AS ipAddress FROM quote_acceptances WHERE quote_id = ?").get(res.json().quote.id);
    assert.strictEqual(row.ipAddress, "203.0.113.56", "untrusted forwarded evidence is ignored");
  } finally { await untrusted.close(); }

  const trusted = buildApp({
    dbPath: ":memory:",
    env: {
      ARMOSPHERA_ONE_PUBLIC_TRUSTED_PROXY_IPS: "127.0.0.1",
      ARMOSPHERA_ONE_PUBLIC_CLIENT_IP_HEADER: "cf-connecting-ip"
    }
  });
  try {
    await trusted.ready();
    const res = await trusted.inject({
      method: "POST",
      url: `/api/public/quotes/${SEEDED_TOKEN}/accept`,
      payload: { signerName: "Trusted Evidence", signerEmail: "trusted-evidence@example.com" },
      remoteAddress: "127.0.0.1",
      headers: { "cf-connecting-ip": "198.51.100.57" }
    });
    assert.strictEqual(res.statusCode, 200, res.body);
    const row = trusted.db.prepare("SELECT ip_address AS ipAddress FROM quote_acceptances WHERE quote_id = ?").get(res.json().quote.id);
    assert.strictEqual(row.ipAddress, "198.51.100.57", "trusted proxy evidence records the configured public client IP");
  } finally { await trusted.close(); }
});
