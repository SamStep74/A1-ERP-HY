"use strict";

// Russian ruble (RUB) money helpers. Minor unit = копейка (kopeck) = 1/100 ruble,
// so amounts carry 2 decimals (unlike AMD's whole-dram model). Pure, dependency-free.

const KOPECKS_PER_RUBLE = 100;

function toNumber(value) {
  return typeof value === "number" ? value : Number(value);
}

// Round to whole kopecks (2 decimals), arithmetic half-up. The Number.EPSILON nudge
// avoids binary-float underflow (e.g. 0.155 * 100 = 15.4999…).
function roundRub(value) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Round to whole rubles — tax bases round to full rubles (НК РФ ст. 52: e.g. НДФЛ).
function roundToWholeRubles(value) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

// Format as Russian currency: "1 234,56 ₽" (space-grouped thousands, comma decimal).
// Pass { symbol: false } to omit the ₽ sign.
function formatRub(value, opts = {}) {
  const symbol = opts.symbol !== false;
  const r = roundRub(value);
  const neg = r < 0;
  const [int, frac] = Math.abs(r).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (neg ? "-" : "") + grouped + "," + frac + (symbol ? " ₽" : "");
}

// Strict, locale-tolerant parser. Accepts "1 234,56 ₽", "1234.56", grouped or plain.
// Returns { ok, amount, error } — fails loud rather than coercing junk to a number.
function parseRub(value) {
  if (value == null || String(value).trim() === "") {
    return { ok: false, amount: null, error: "пустое значение" };
  }
  let s = String(value).trim().replace(/₽/g, "").replace(/\s/g, "");
  s = s.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, amount: null, error: "некорректное число" };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, amount: null, error: "некорректное число" };
  return { ok: true, amount: roundRub(n), error: null };
}

module.exports = { KOPECKS_PER_RUBLE, roundRub, roundToWholeRubles, formatRub, parseRub };
