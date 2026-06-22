"use strict";

function matchReceipt(orderedQty, receivedQty, tolerance = 0.01) {
  const ordered = Number(orderedQty || 0);
  const received = Number(receivedQty || 0);
  const variance = received - ordered;
  const allowed = Math.max(0, Number(tolerance || 0));
  const status = Math.abs(variance) <= allowed
    ? "matched"
    : variance < 0
      ? "under_received"
      : "over_received";
  return { variance, status };
}

function matchPrice(orderedUnitCost, billedUnitCost, tolerance = 0.01) {
  const ordered = Number(orderedUnitCost || 0);
  const billed = Number(billedUnitCost || 0);
  const variancePct = ordered > 0 ? (billed - ordered) / ordered : 0;
  const allowed = Math.max(0, Number(tolerance || 0));
  const status = Math.abs(variancePct) <= allowed
    ? "matched"
    : variancePct > 0
      ? "price_increase"
      : "price_decrease";
  return { variancePct, status };
}

module.exports = { matchReceipt, matchPrice };
