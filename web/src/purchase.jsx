import React, { useMemo, useState } from "react";

const amd = value => `${Number(value || 0).toLocaleString("hy-AM")} AMD`;
const integerInput = value => Math.max(1, Math.round(Number(value) || 1));

function today() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Yerevan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now).reduce((memo, part) => {
    memo[part.type] = part.value;
    return memo;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function statusLabel(status) {
  if (status === "rfq") return "RFQ";
  if (status === "confirmed") return "Confirmed";
  if (status === "partial") return "Partial";
  if (status === "received") return "Received";
  if (status === "billed") return "Billed";
  return status || "draft";
}

function actionBusy(actionState, prefix, orderId = "") {
  return actionState === `${prefix}:running${orderId ? `:${orderId}` : ""}`;
}

function explicitPurchaseUnitCost(value) {
  const explicit = Math.round(Number(value));
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return 0;
}

function bestVendorPrice(vendor, catalogItemId, quantity, orderDate) {
  const prices = (vendor?.prices || []).filter(price =>
    price.status === "active"
    && price.catalogItemId === catalogItemId
    && Number(price.minQuantity || 1) <= quantity
    && (!price.validFrom || price.validFrom <= orderDate)
    && (!price.validTo || price.validTo >= orderDate)
  );
  prices.sort((a, b) =>
    Number(b.minQuantity || 1) - Number(a.minQuantity || 1)
    || String(b.validFrom || "").localeCompare(String(a.validFrom || ""))
    || Number(a.unitCost || 0) - Number(b.unitCost || 0)
  );
  return prices[0];
}

export function PurchaseWorkspacePanel({
  data,
  canWrite,
  canBill,
  actionState,
  onCreateOrder,
  onConfirmOrder,
  onReceiveOrder,
  onReturnOrder,
  onBillOrder
}) {
  const orders = data?.orders?.orders || [];
  const catalogItems = data?.catalog?.items || [];
  const vendors = data?.vendors?.vendors || [];
  const analytics = data?.analytics || {};
  const purchaseSummary = analytics.summary || {};
  const vendorPerformance = analytics.vendorPerformance || [];
  const receiptBacklog = analytics.receiptBacklog || [];
  const priceCoverage = analytics.priceCoverage || {};
  const priceCoveragePercent = Number(priceCoverage.coveragePercent ?? purchaseSummary.vendorPriceCoveragePercent ?? 0);
  const stockableItems = useMemo(
    () => catalogItems.filter(item => item.status === "active" && item.trackStock),
    [catalogItems]
  );
  const [vendorId, setVendorId] = useState("");
  const [supplier, setSupplier] = useState("Yerevan Hardware Supply");
  const [supplierTaxId, setSupplierTaxId] = useState("01234568");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [expectedDate, setExpectedDate] = useState(today());
  const [catalogItemId, setCatalogItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("Purchase request for Armenian SMB stock replenishment.");
  const [receiptQuantities, setReceiptQuantities] = useState({});
  const [returnQuantities, setReturnQuantities] = useState({});

  const selectedItem = stockableItems.find(item => item.id === (catalogItemId || stockableItems[0]?.id));
  const defaultItemId = selectedItem?.id || "";
  const selectedVendor = vendors.find(vendor => vendor.id === vendorId);
  const selectedVendorPrice = bestVendorPrice(selectedVendor, defaultItemId, integerInput(quantity), orderDate);
  const rfqCount = orders.filter(order => order.status === "rfq").length;
  const confirmedCount = orders.filter(order => order.status === "confirmed").length;
  const partialCount = orders.filter(order => order.status === "partial").length;
  const receivedCount = orders.filter(order => order.status === "received").length;
  const billedCount = orders.filter(order => order.status === "billed").length;
  const openValue = orders
    .filter(order => order.status !== "billed")
    .reduce((total, order) => total + Number(order.total || 0), 0);
  const createBusy = actionState === "purchase-create:running";

  async function submitOrder(event) {
    event.preventDefault();
    if (!onCreateOrder || !defaultItemId) return;
    const line = {
      catalogItemId: defaultItemId,
      quantity: integerInput(quantity),
      description: selectedItem?.name || "Purchase line"
    };
    const explicitCost = explicitPurchaseUnitCost(unitCost);
    if (explicitCost) line.unitCost = explicitCost;
    await onCreateOrder({
      vendorId,
      orderNumber,
      supplier: supplier || selectedVendor?.name || "",
      supplierTaxId: supplierTaxId || selectedVendor?.taxId || "",
      orderDate,
      expectedDate,
      note,
      lines: [line]
    });
  }

  function changeVendor(event) {
    const nextVendorId = event.target.value;
    setVendorId(nextVendorId);
    const vendor = vendors.find(item => item.id === nextVendorId);
    if (vendor) {
      setSupplier(vendor.name);
      setSupplierTaxId(vendor.taxId || "");
    }
  }

  function nextReceivableLine(order) {
    return (order.lines || []).find(line => Number(line.remainingQuantity || 0) > 0);
  }

  function nextReturnableLine(order) {
    if (order.status !== "partial" && order.status !== "received") return null;
    return (order.lines || []).find(line => Number(line.returnableQuantity || line.receivedQuantity || 0) > 0);
  }

  function receiptQuantityFor(order, line) {
    const key = `${order.id}:${line.id}`;
    const fallback = Number(line.remainingQuantity || 1);
    return Math.min(fallback, integerInput(receiptQuantities[key] || fallback));
  }

  function returnQuantityFor(order, line) {
    const key = `${order.id}:${line.id}`;
    const fallback = Number(line.returnableQuantity || line.receivedQuantity || 1);
    return Math.min(fallback, integerInput(returnQuantities[key] || fallback));
  }

  function changeReceiptQuantity(order, line, value) {
    const key = `${order.id}:${line.id}`;
    setReceiptQuantities(current => ({ ...current, [key]: value }));
  }

  function changeReturnQuantity(order, line, value) {
    const key = `${order.id}:${line.id}`;
    setReturnQuantities(current => ({ ...current, [key]: value }));
  }

  return (
    <>
      <article className="panel purchase-overview-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">Purchase</span>
            <h2>RFQ to receipt to AP bill</h2>
          </div>
          <strong className="aging-badge">{orders.length} orders</strong>
        </div>
        <div className="aging-summary purchase-summary">
          <div className="metric"><span>RFQs</span><strong>{rfqCount}</strong></div>
          <div className="metric"><span>confirmed</span><strong>{confirmedCount}</strong></div>
          <div className="metric"><span>partial</span><strong>{partialCount}</strong></div>
          <div className="metric"><span>received</span><strong>{receivedCount}</strong></div>
          <div className="metric"><span>billed</span><strong>{billedCount}</strong></div>
        </div>
        <div className="meta-row">
          <span>{amd(openValue)} open procurement</span>
          <span>{stockableItems.length} stock-tracked catalog items</span>
          <span>{vendors.length} vendors</span>
        </div>
      </article>

      <article className="panel purchase-analytics-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">Procurement analytics</span>
            <h2>Vendor 360</h2>
          </div>
          <strong className="aging-badge">{Number(purchaseSummary.receiptProgressPercent || 0)}% received</strong>
        </div>
        <div className="aging-summary purchase-analytics-summary">
          <div className="metric"><span>price coverage</span><strong>{priceCoveragePercent}%</strong></div>
          <div className="metric"><span>remaining qty</span><strong>{Number(purchaseSummary.remainingQuantity || 0)}</strong></div>
          <div className="metric"><span>returned qty</span><strong>{Number(purchaseSummary.returnedQuantity || 0)}</strong></div>
          <div className="metric"><span>active prices</span><strong>{Number(priceCoverage.activePriceCount || 0)}</strong></div>
          <div className="metric"><span>covered items</span><strong>{Number(priceCoverage.coveredStockableItemCount || 0)}/{Number(priceCoverage.stockableCatalogItemCount || 0)}</strong></div>
        </div>
        <div className="purchase-analytics-grid">
          <div className="rows purchase-vendor-list">
            {vendorPerformance.slice(0, 4).map(vendor => (
              <div className="row purchase-vendor" key={vendor.vendorId || vendor.supplier}>
                <span>{vendor.supplier} · {vendor.orderCount} orders · {vendor.receiptProgressPercent}% received</span>
                <strong>{amd(vendor.totalValue)}</strong>
              </div>
            ))}
            {vendorPerformance.length === 0 && <div className="row"><span>No vendor performance yet</span></div>}
          </div>
          <div className="rows purchase-backlog-list">
            {receiptBacklog.slice(0, 4).map(item => (
              <div className="row purchase-backlog" key={item.orderId}>
                <span>{item.orderNumber} · {item.supplier} · {statusLabel(item.status)} · remaining {item.remainingQuantity}</span>
                <strong>{item.expectedDate}</strong>
              </div>
            ))}
            {receiptBacklog.length === 0 && <div className="row"><span>No receipt backlog</span></div>}
          </div>
        </div>
      </article>

      <article className="panel purchase-orders-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">Procurement ledger</span>
            <h2>Purchase orders</h2>
          </div>
          <strong className="aging-badge">AMD</strong>
        </div>
        <div className="rows purchase-order-list">
          {orders.slice(0, 8).map(order => {
            const busyConfirm = actionBusy(actionState, "purchase-confirm", order.id);
            const busyReceive = actionBusy(actionState, "purchase-receive", order.id);
            const busyReturn = actionBusy(actionState, "purchase-return", order.id);
            const busyBill = actionBusy(actionState, "purchase-bill", order.id);
            const receivableLine = nextReceivableLine(order);
            const returnableLine = nextReturnableLine(order);
            return (
              <div className={`row purchase-order ${order.status}`} key={order.id}>
                <span>
                  {order.orderNumber} · {order.supplier} · {statusLabel(order.status)} · {order.lines?.[0]?.catalogSku || "no lines"}
                  {Number(order.orderedQuantity || 0) > 0 && ` · received ${Number(order.receivedQuantity || 0)}/${Number(order.orderedQuantity || 0)}`}
                  {Number(order.returnedQuantity || 0) > 0 && ` · returned ${Number(order.returnedQuantity || 0)}`}
                </span>
                <strong>{amd(order.total)}</strong>
                <div className="row-actions">
                  {canWrite && order.status === "rfq" && (
                    <button className="mini-action secondary" type="button" onClick={() => onConfirmOrder?.(order)} disabled={busyConfirm}>
                      {busyConfirm ? "Confirming" : "Confirm"}
                    </button>
                  )}
                  {canWrite && (order.status === "confirmed" || order.status === "partial") && receivableLine && (
                    <>
                      <input
                        className="mini-quantity"
                        aria-label={`Receive quantity for ${order.orderNumber}`}
                        inputMode="numeric"
                        value={receiptQuantities[`${order.id}:${receivableLine.id}`] ?? String(receivableLine.remainingQuantity || 1)}
                        onChange={event => changeReceiptQuantity(order, receivableLine, event.target.value)}
                        disabled={busyReceive}
                      />
                      <button
                        className="mini-action secondary"
                        type="button"
                        onClick={() => onReceiveOrder?.(order, { lineId: receivableLine.id, quantity: receiptQuantityFor(order, receivableLine) })}
                        disabled={busyReceive}
                      >
                        {busyReceive ? "Receiving" : "Receive"}
                      </button>
                    </>
                  )}
                  {canWrite && returnableLine && (
                    <>
                      <input
                        className="mini-quantity"
                        aria-label={`Return quantity for ${order.orderNumber}`}
                        inputMode="numeric"
                        value={returnQuantities[`${order.id}:${returnableLine.id}`] ?? String(returnableLine.returnableQuantity || returnableLine.receivedQuantity || 1)}
                        onChange={event => changeReturnQuantity(order, returnableLine, event.target.value)}
                        disabled={busyReturn}
                      />
                      <button
                        className="mini-action secondary"
                        type="button"
                        onClick={() => onReturnOrder?.(order, { lineId: returnableLine.id, quantity: returnQuantityFor(order, returnableLine) })}
                        disabled={busyReturn}
                      >
                        {busyReturn ? "Returning" : "Return"}
                      </button>
                    </>
                  )}
                  {canBill && order.status === "received" && (
                    <button className="mini-action" type="button" onClick={() => onBillOrder?.(order)} disabled={busyBill}>
                      {busyBill ? "Billing" : "Bill"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {orders.length === 0 && <div className="row"><span>No purchase orders yet</span></div>}
        </div>
      </article>

      {canWrite && (
        <article className="panel purchase-order-form">
          <div className="panel-head">
            <div>
              <span className="section-label">Procurement intake</span>
              <h2>Create RFQ</h2>
            </div>
            <strong className="aging-badge">audited</strong>
          </div>
          <form className="inline-form" onSubmit={submitOrder}>
            <label>
              Vendor
              <select value={vendorId} onChange={changeVendor} disabled={createBusy}>
                <option value="">Manual supplier</option>
                {vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.taxId || "no ՀՎՀՀ"}</option>)}
              </select>
            </label>
            <label>
              Supplier
              <input value={supplier} onChange={event => setSupplier(event.target.value)} placeholder={selectedVendor?.name || ""} disabled={createBusy} />
            </label>
            <label>
              ՀՎՀՀ
              <input value={supplierTaxId} onChange={event => setSupplierTaxId(event.target.value)} inputMode="numeric" placeholder={selectedVendor?.taxId || ""} disabled={createBusy} />
            </label>
            <label>
              PO number
              <input value={orderNumber} onChange={event => setOrderNumber(event.target.value)} placeholder="auto" disabled={createBusy} />
            </label>
            <label>
              Order date
              <input value={orderDate} onChange={event => setOrderDate(event.target.value)} type="date" disabled={createBusy} />
            </label>
            <label>
              Expected date
              <input value={expectedDate} onChange={event => setExpectedDate(event.target.value)} type="date" disabled={createBusy} />
            </label>
            <label>
              Item
              <select value={defaultItemId} onChange={event => setCatalogItemId(event.target.value)} disabled={createBusy || stockableItems.length === 0}>
                {stockableItems.map(item => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
              </select>
            </label>
            <label>
              Quantity
              <input value={quantity} onChange={event => setQuantity(event.target.value)} inputMode="numeric" disabled={createBusy} />
            </label>
            <label>
              Unit cost
              <input value={unitCost} onChange={event => setUnitCost(event.target.value)} inputMode="numeric" placeholder={selectedVendorPrice ? String(selectedVendorPrice.unitCost) : selectedItem ? String(selectedItem.standardCost || "") : "catalog cost"} disabled={createBusy} />
            </label>
            <label>
              Note
              <input value={note} onChange={event => setNote(event.target.value)} disabled={createBusy} />
            </label>
            <button className="mini-action secondary" type="submit" disabled={createBusy || !defaultItemId}>
              {createBusy ? "Creating" : "Create RFQ"}
            </button>
          </form>
          {actionState === "purchase-create:done" && <p className="action-status">RFQ created and Purchase workspace refreshed.</p>}
          {actionState === "purchase-create:error" && <p className="action-status">RFQ creation failed. Check supplier, ՀՎՀՀ, item, and role permissions.</p>}
        </article>
      )}
    </>
  );
}
