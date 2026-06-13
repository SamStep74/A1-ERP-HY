"use strict";

// Russian business / individual identifier validation.
// Checksum algorithms per ФНС / established public specifications:
//   ИНН (10/12), КПП (structure), ОГРН (mod 11), ОГРНИП (mod 13), СНИЛС (mod 101).
// Pure, dependency-free.

function asString(value) {
  return String(value == null ? "" : value).trim();
}

function onlyDigits(s) {
  return /^\d+$/.test(s);
}

// ИНН — Идентификационный номер налогоплательщика.
// 10 digits = юридическое лицо (legal entity), 12 digits = физлицо / ИП (individual).
function isValidInn(value) {
  const s = asString(value);
  if (!onlyDigits(s)) return false;
  const d = s.split("").map(Number);
  if (d.length === 10) {
    const k = [2, 4, 10, 3, 5, 9, 4, 6, 8];
    const c = (k.reduce((a, w, i) => a + w * d[i], 0) % 11) % 10;
    return c === d[9];
  }
  if (d.length === 12) {
    const k1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const k2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const c1 = (k1.reduce((a, w, i) => a + w * d[i], 0) % 11) % 10;
    const c2 = (k2.reduce((a, w, i) => a + w * d[i], 0) % 11) % 10;
    return c1 === d[10] && c2 === d[11];
  }
  return false;
}

function validateInn(value) {
  const s = asString(value);
  if (!s) return { ok: false, normalized: null, kind: null, error: "ИНН пуст" };
  if (!onlyDigits(s)) return { ok: false, normalized: null, kind: null, error: "ИНН должен содержать только цифры" };
  if (s.length !== 10 && s.length !== 12) {
    return { ok: false, normalized: null, kind: null, error: "ИНН должен содержать 10 или 12 цифр" };
  }
  if (!isValidInn(s)) return { ok: false, normalized: null, kind: null, error: "неверная контрольная сумма ИНН" };
  return { ok: true, normalized: s, kind: s.length === 10 ? "legal" : "individual", error: null };
}

// КПП — Код причины постановки на учёт. 9 chars: NNNN (tax office) + PP (reason code,
// digits or A–Z) + XXX (serial). No checksum.
function isValidKpp(value) {
  return /^\d{4}[0-9A-Z]{2}\d{3}$/.test(asString(value));
}

// Modulo of a digit-string prefix via Horner's method — precision-safe for any length
// (avoids float rounding on the 12/14-digit prefixes ОГРН/ОГРНИП operate on).
function modOfPrefix(s, len, mod) {
  let rem = 0;
  for (let i = 0; i < len; i++) rem = (rem * 10 + (s.charCodeAt(i) - 48)) % mod;
  return rem;
}

// ОГРН — Основной государственный регистрационный номер (legal entity). 13 digits.
// Control = last digit of (first 12 digits mod 11), == 13th digit.
function isValidOgrn(value) {
  const s = asString(value);
  if (!/^\d{13}$/.test(s)) return false;
  return modOfPrefix(s, 12, 11) % 10 === Number(s[12]);
}

// ОГРНИП — ОГРН индивидуального предпринимателя (sole trader). 15 digits.
// Control = last digit of (first 14 digits mod 13), == 15th digit.
function isValidOgrnip(value) {
  const s = asString(value);
  if (!/^\d{15}$/.test(s)) return false;
  return modOfPrefix(s, 14, 13) % 10 === Number(s[14]);
}

// СНИЛС — Страховой номер индивидуального лицевого счёта. 11 digits (separators allowed).
// Checksum over the first 9 digits with descending weights 9..1, mod 101 (100/101 → 00).
function isValidSnils(value) {
  const s = asString(value).replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(s)) return false;
  const body = s.slice(0, 9).split("").map(Number);
  const check = Number(s.slice(9));
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += body[i] * (9 - i);
  let c = sum % 101;
  if (c === 100) c = 0;
  return c === check;
}

module.exports = { validateInn, isValidInn, isValidKpp, isValidOgrn, isValidOgrnip, isValidSnils };
