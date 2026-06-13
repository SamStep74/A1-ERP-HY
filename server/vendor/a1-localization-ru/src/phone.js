"use strict";

// Russian telephone-number helpers.
// Код страны (country code) +7. Национальный значащий номер (NSN) = 10 цифр:
//   3-значный код зоны/оператора (DEF/ABC) + 7 цифр абонентского номера.
// Внутрисетевой префикс выхода на МГ/МН (domestic trunk prefix) = 8.
// We validate the STABLE invariant — a 10-digit NSN whose first digit is 3–9
// (geographic codes start 3–8, mobiles start 9) — rather than hard-coding the
// ever-changing list of operator prefixes. Pure, dependency-free.

const COUNTRY_CODE = "7";
const NSN_LENGTH = 10;

// Russian NSNs never start with 0/1/2; 9XX is mobile, 3XX–8XX geographic.
const NSN_PATTERN = /^[3-9]\d{9}$/;

function asString(value) {
  return String(value == null ? "" : value);
}

// Strip everything but digits, then peel the country/trunk prefix:
//   11 digits "8…"  → drop the leading 8 (domestic trunk form)
//   11 digits "7…"  → drop the leading 7 (E.164 / +7 form)
//   10 digits       → already an NSN
// Returns the 10-digit NSN only when it matches the invariant, else "".
function normalizeNsn(value) {
  const digits = asString(value).replace(/\D/g, "");
  let nsn = "";
  if (digits.length === 11 && digits[0] === "8") {
    nsn = digits.slice(1);
  } else if (digits.length === 11 && digits[0] === "7") {
    nsn = digits.slice(1);
  } else if (digits.length === NSN_LENGTH) {
    nsn = digits;
  }
  return NSN_PATTERN.test(nsn) ? nsn : "";
}

function isValidRussianPhone(value) {
  return normalizeNsn(value) !== "";
}

// E.164: "+7" + 10-digit NSN, or null when invalid.
function e164(value) {
  const nsn = normalizeNsn(value);
  return nsn ? "+" + COUNTRY_CODE + nsn : null;
}

// National display format "+7 (XXX) XXX-XX-XX" (3-3-2-2), or null when invalid.
function formatPhone(value) {
  const nsn = normalizeNsn(value);
  if (!nsn) return null;
  const area = nsn.slice(0, 3);
  const block = nsn.slice(3, 6);
  const pair1 = nsn.slice(6, 8);
  const pair2 = nsn.slice(8, 10);
  return "+" + COUNTRY_CODE + " (" + area + ") " + block + "-" + pair1 + "-" + pair2;
}

module.exports = { COUNTRY_CODE, NSN_LENGTH, normalizeNsn, isValidRussianPhone, e164, formatPhone };
