"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const locale = require("../server/locale");

// S1 of the kopeck migration (docs/RU_KOPECK_MIGRATION_RFC.md): the money-scale facade.
// Pure addition — no caller changes yet. AMD must be a literal no-op (subunit 0 → factor 1).

test("AM money scale: subunit 0, toMinor/fromMinor are identity", () => {
  const m = locale.profileFor("am").money;
  assert.equal(m.subunit, 0);
  assert.equal(m.toMinor(1000), 1000);
  assert.equal(m.fromMinor(1000), 1000);
  assert.equal(m.toMinor(1234.7), 1235); // roundAmd → whole dram
  assert.equal(m.roundToWholeMajor(1234.7), 1235);
  for (const v of [0, 1, 50, 1000000]) assert.equal(m.fromMinor(m.toMinor(v)), v);
});

test("RU money scale: subunit 2, integer kopecks, exact round-trip", () => {
  const m = locale.profileFor("ru").money;
  assert.equal(m.subunit, 2);
  assert.equal(m.toMinor(123.45), 12345);
  assert.equal(m.fromMinor(12345), 123.45);
  assert.equal(m.toMinor(1000), 100000);
  assert.equal(m.fromMinor(100000), 1000);
  // EPSILON-safe at binary-float traps
  assert.equal(m.toMinor(0.1 + 0.2), 30); // 0.30000000000000004 → 30 kopecks
  assert.equal(m.toMinor(123.455), 12346); // half-up via roundRub
  assert.equal(m.toMinor(10.075), 1008); // binary underflow must not drop the half-kopeck
  for (const v of [0, 0.01, 50.5, 123.45, 999999.99]) assert.equal(m.fromMinor(m.toMinor(v)), v);
});

test("RU tax base rounds to whole rubles (НК РФ ст. 52), distinct from storage", () => {
  const m = locale.profileFor("ru").money;
  assert.equal(m.roundToWholeMajor(123.45), 123);
  assert.equal(m.roundToWholeMajor(123.5), 124);
});

test("active().money exposes the scale for the env locale", () => {
  const prev = process.env.A1_LOCALE;
  try {
    process.env.A1_LOCALE = "ru";
    assert.equal(locale.active().money.subunit, 2);
    process.env.A1_LOCALE = "am";
    assert.equal(locale.active().money.subunit, 0);
  } finally {
    if (prev === undefined) delete process.env.A1_LOCALE;
    else process.env.A1_LOCALE = prev;
  }
});
