"use strict";

function buildVendor360(vendor, pos = [], receipts = [], bills = [], suggestions = [], options = {}) {
  const orders = Array.isArray(pos) ? pos : [];
  const openReceipts = Array.isArray(receipts) ? receipts : [];
  const vendorBills = options.includeFinancials === false ? [] : Array.isArray(bills) ? bills : [];
  const reorderSuggestions = Array.isArray(suggestions) ? suggestions : [];
  const orderSummary = options.orderSummary || {};
  const openBills = vendorBills.filter(bill => ["open", "partial"].includes(bill.status) && Number(bill.outstanding ?? bill.total ?? 0) > 0);
  const spendYtd = vendorBills
    .filter(bill => bill.isYtd !== false)
    .reduce((total, bill) => total + Number(bill.total || 0), 0);
  const derivedLastPoDate = orders.reduce((latest, order) => {
    const date = order.orderDate || "";
    return date > latest ? date : latest;
  }, "");
  return {
    vendor,
    summary: {
      orderCount: Number(orderSummary.orderCount ?? orders.length),
      openPoCount: Number(orderSummary.openPoCount ?? orders.filter(order => order.status !== "billed" && order.status !== "cancelled").length),
      openReceiptCount: Number(orderSummary.openReceiptCount ?? openReceipts.length),
      openBillCount: openBills.length,
      openReorderSuggestionCount: reorderSuggestions.filter(suggestion => suggestion.status === "pending").length,
      totalSpendYtd: spendYtd,
      lastPoDate: orderSummary.lastPoDate || derivedLastPoDate,
      activePriceCount: (vendor.prices || []).filter(price => price.status === "active").length
    },
    visibility: {
      recentOrders: options.includeRecentOrders !== false,
      openReceipts: options.includeOpenReceipts !== false,
      financials: options.includeFinancials !== false
    },
    recentOrders: options.includeRecentOrders === false ? [] : orders.slice(0, 10),
    openReceipts: options.includeOpenReceipts === false ? [] : openReceipts,
    openBills: options.includeFinancials === false ? [] : openBills,
    openReorderSuggestions: reorderSuggestions.filter(suggestion => suggestion.status === "pending")
  };
}

module.exports = { buildVendor360 };
