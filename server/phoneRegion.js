"use strict";
// phoneRegion — Wave 6 deliverable: resolve a phone number to an arm_regions row.
//
// Wires armeniaPhone (NSN normalization) into the new arm_regions table (Wave 6
// ref-data). Lives OUTSIDE the vendored kernel so the prefix table can be iterated
// without re-vendoring. The prefix map below encodes the well-known 2-digit area
// codes for the 11 Armenian administrative divisions:
//
//   10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 60, 61, 62 → AM-ER  (Yerevan city)
//   23, 27                                                       → AM-AR  (Ararat)
//   24                                                            → AM-LO  (Lori)
//   25                                                            → AM-KT  (Kotayk)
//   26                                                            → AM-GR  (Gegharkunik)
//   28                                                            → AM-SU  (Syunik)
//   29                                                            → AM-VD  (Vayots Dzor)
//   31, 32, 33                                                    → AM-AG  (Aragatsotn)
//
//   9X                                                            → mobile (no region)
//
// We intentionally do NOT hardcode operator-level 3-digit prefixes (those change
// without notice); this is the STABLE geographic mapping Wave 6 needs to attach
// a region to a customer's landline. The table is best-effort: regionForPhone
// returns null on any miss (invalid NSN, mobile, or unmapped 2-digit prefix) so
// callers can gracefully show "unknown" in the UI.

const armeniaPhone = require("./armeniaPhone");
const armeniaRegions = require("./armeniaRegions");

// First-2-digits-of-NSN → ISO 3166-2:AM code. 2-digit resolution is the stable
// geographic anchor (operator-level 3-digit ranges are intentionally out of scope).
const NSN2_TO_REGION = Object.freeze({
  // Yerevan city (the 10–19 range; +374 60/61/62 are GSM-corporate fall-throughs we
  // still map to AM-ER because they terminate in Yerevan exchanges)
  "10": "AM-ER", "11": "AM-ER", "12": "AM-ER", "13": "AM-ER", "14": "AM-ER",
  "15": "AM-ER", "16": "AM-ER", "17": "AM-ER", "18": "AM-ER", "19": "AM-ER",
  "60": "AM-ER", "61": "AM-ER", "62": "AM-ER",
  // Marzes
  "23": "AM-AR", "24": "AM-LO", "25": "AM-KT", "26": "AM-GR", "27": "AM-AR",
  "28": "AM-SU", "29": "AM-VD",
  "31": "AM-AG", "32": "AM-AG", "33": "AM-AG",
});

/**
 * Resolve a phone number (any input shape armeniaPhone.normalizeNsn accepts) to the
 * matching arm_regions row. Returns null on any failure (invalid NSN, mobile,
 * unmapped prefix, etc.) so callers can surface "unknown" without throwing.
 *
 * @param {string} phone Any input shape: E.164 (+374...), 00-prefix, domestic 0..., bare NSN.
 * @returns {{ code:string, name_hy:string, name_ru:string|null, name_en:string } | null}
 *   The matching arm_regions row, or null if no match.
 */
function regionForPhone(phone) {
  if (typeof phone !== "string" && typeof phone !== "number") return null;
  const nsn = armeniaPhone.normalizeNsn(phone);
  if (!nsn) return null;
  // Mobile numbers (9X) and Yerevan (10-19) are distinguishable from the first
  // 2 digits alone. Marzes in 23..29 and 31..33 are too. 3-digit refinement is
  // intentionally NOT done here (operator-level prefixes change); see module header.
  const code = NSN2_TO_REGION[nsn.slice(0, 2)];
  if (!code) return null;
  const region = armeniaRegions.regionByCode(code);
  if (!region) return null;
  return {
    code: region.code,
    name_hy: region.hy,
    name_ru: null, // armeriaRegions (vendored) ships hy/en only; ru is on the DB row
    name_en: region.en,
  };
}

/**
 * Convenience wrapper that returns just the ISO code, or null.
 * @param {string} phone
 * @returns {string|null}
 */
function regionCodeForPhone(phone) {
  const row = regionForPhone(phone);
  return row ? row.code : null;
}

module.exports = {
  regionForPhone,
  regionCodeForPhone,
  NSN2_TO_REGION,
};
