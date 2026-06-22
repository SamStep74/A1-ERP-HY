"use strict";

function normalizePrice(price) {
  return {
    vendorId: price.vendorId || price.vendor_id || "",
    vendorPriceId: price.id || price.vendorPriceId || price.vendor_price_id || "",
    itemId: price.itemId || price.catalogItemId || price.item_id || price.catalog_item_id || "",
    unitCost: Number(price.unitCost ?? price.unit_cost ?? 0),
    minQuantity: Number(price.minQuantity ?? price.min_quantity ?? 1),
    currency: price.currency || "AMD",
    status: price.status || "active",
    validFrom: price.validFrom || price.valid_from || "",
    validTo: price.validTo || price.valid_to || "",
    createdAt: price.createdAt || price.created_at || ""
  };
}

function isCurrentPrice(price, asOfDate) {
  if (price.status !== "active") return false;
  if (!asOfDate) return true;
  if (price.validFrom && price.validFrom > asOfDate) return false;
  if (price.validTo && price.validTo < asOfDate) return false;
  return true;
}

function pickBestVendor(prices, itemId, quantity, options = {}) {
  const requestedQuantity = Number(quantity || 0);
  const itemPrices = (Array.isArray(prices) ? prices : [])
    .map(normalizePrice)
    .filter(price => price.itemId === itemId && price.vendorId && Number.isSafeInteger(price.unitCost) && price.unitCost > 0);
  const activePrices = itemPrices.filter(price => isCurrentPrice(price, options.asOfDate || ""));
  const eligible = activePrices.filter(price => price.minQuantity <= requestedQuantity);
  const candidates = eligible.length > 0 ? eligible : activePrices;
  if (candidates.length === 0) return null;

  const best = [...candidates].sort((left, right) => {
    if (eligible.length > 0 && left.unitCost !== right.unitCost) return left.unitCost - right.unitCost;
    if (eligible.length === 0 && left.minQuantity !== right.minQuantity) return left.minQuantity - right.minQuantity;
    const leftDate = left.validFrom || left.createdAt;
    const rightDate = right.validFrom || right.createdAt;
    return String(rightDate).localeCompare(String(leftDate))
      || right.minQuantity - left.minQuantity
      || left.unitCost - right.unitCost
      || left.vendorId.localeCompare(right.vendorId);
  })[0];

  return {
    vendorId: best.vendorId,
    vendorPriceId: best.vendorPriceId,
    unitCost: best.unitCost,
    currency: best.currency,
    minQuantity: best.minQuantity
  };
}

function normalizeSuggestion(suggestion) {
  return {
    vendorId: suggestion.vendorId || suggestion.suggestedVendorId || suggestion.vendor_id || suggestion.suggested_vendor_id || "",
    quantity: Number(suggestion.quantity ?? suggestion.suggestedQuantity ?? suggestion.suggested_quantity ?? 0),
    unitCost: Number(suggestion.unitCost ?? suggestion.suggestedUnitCost ?? suggestion.suggested_unit_cost ?? 0),
    note: suggestion.note || ""
  };
}

function normalizeShortage(shortage) {
  return {
    itemId: shortage.itemId || shortage.catalogItemId || shortage.item_id || shortage.catalog_item_id || "",
    shortageQty: Number(shortage.shortageQty ?? shortage.shortage_qty ?? shortage.quantity ?? 0)
  };
}

function suggestionToPoBody(suggestion, shortage) {
  const normalizedSuggestion = normalizeSuggestion(suggestion || {});
  const normalizedShortage = normalizeShortage(shortage || {});
  return {
    vendorId: normalizedSuggestion.vendorId,
    note: normalizedSuggestion.note,
    lines: [{
      catalogItemId: normalizedShortage.itemId,
      quantity: normalizedSuggestion.quantity || normalizedShortage.shortageQty,
      unitCost: normalizedSuggestion.unitCost
    }]
  };
}

module.exports = { pickBestVendor, suggestionToPoBody };
