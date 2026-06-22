"use strict";

function normalizeBid(bid) {
  return {
    id: bid.id || "",
    vendorId: bid.vendorId || bid.vendor_id || "",
    total: Number(bid.total || 0),
    subtotal: Number(bid.subtotal || 0),
    leadTimeDays: Number(bid.leadTimeDays ?? bid.lead_time_days ?? maxLineLeadTime(bid.lines || [])),
    bidDate: bid.bidDate || bid.bid_date || "",
    lines: Array.isArray(bid.lines) ? bid.lines : []
  };
}

function maxLineLeadTime(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((max, line) => Math.max(max, Number(line.leadTimeDays ?? line.lead_time_days ?? 0)), 0);
}

function rankRfqBids(bids = []) {
  return (Array.isArray(bids) ? bids : [])
    .map(bid => ({ original: bid, normalized: normalizeBid(bid) }))
    .sort((left, right) => left.normalized.total - right.normalized.total
      || left.normalized.leadTimeDays - right.normalized.leadTimeDays
      || String(left.normalized.bidDate).localeCompare(String(right.normalized.bidDate))
      || left.normalized.vendorId.localeCompare(right.normalized.vendorId))
    .map(entry => entry.original);
}

function compareRfqBids(leftBid, rightBid) {
  const left = normalizeBid(leftBid);
  const right = normalizeBid(rightBid);
  return left.total - right.total
      || left.leadTimeDays - right.leadTimeDays
      || String(left.bidDate).localeCompare(String(right.bidDate))
      || left.vendorId.localeCompare(right.vendorId);
}

function buildAwardPurchaseOrderBody(rfq, bid, options = {}) {
  const orderDate = options.orderDate || new Date().toISOString().slice(0, 10);
  const expectedDate = options.expectedDate || orderDate;
  const rfqNumber = rfq.rfqNumber || rfq.rfq_number || rfq.id || "";
  return {
    vendorId: bid.vendorId || bid.vendor_id,
    orderNumber: options.orderNumber || `RFQ-${rfqNumber}-AWARD`.toUpperCase().slice(0, 40),
    orderDate,
    expectedDate,
    note: options.note || `Awarded from RFQ ${rfqNumber}`,
    lines: (bid.lines || []).map(line => ({
      catalogItemId: line.catalogItemId || line.catalog_item_id,
      description: line.description || "",
      quantity: Number(line.quantity || 0),
      unitCost: Number(line.unitCost ?? line.unit_cost ?? 0)
    }))
  };
}

module.exports = { buildAwardPurchaseOrderBody, compareRfqBids, rankRfqBids };
