import React, { useMemo, useState } from "react";

const amd = value => `${Number(value || 0).toLocaleString("hy-AM")} AMD`;
const numberInput = value => Math.max(1, Math.round(Number(value) || 1));

function locationLabel(location) {
  if (!location) return "Default";
  return `${location.code} · ${location.name}`;
}

function moveEndpoint(move) {
  if (!move) return "";
  const source = move.sourceLocationCode || "default";
  const destination = move.destinationLocationCode || "default";
  return `${source} -> ${destination}`;
}

function variantLabel(item) {
  const count = Number(item?.variantCount ?? item?.variants?.length ?? 0);
  return count === 1 ? "1 variant" : `${count} variants`;
}

function marginLabel(item) {
  return item?.marginPercent == null ? "margin n/a" : `margin ${Number(item.marginPercent).toLocaleString("hy-AM")}%`;
}

export function InventoryWorkspacePanel({ data, canMove, actionState, onCreateMove }) {
  const [catalogItemId, setCatalogItemId] = useState("");
  const [moveType, setMoveType] = useState("transfer");
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("Workspace stock move for Armenian SMB operations.");
  const [reference, setReference] = useState("A1-INV-WORKSPACE");

  const catalog = data?.catalog || {};
  const stockData = data?.stock || {};
  const movesData = data?.moves || {};
  const items = catalog.items || [];
  const stock = stockData.stock || [];
  const locations = stockData.locations || [];
  const moves = movesData.moves || [];
  const categories = catalog.categories || [];
  const priceLists = catalog.priceLists || [];
  const marginRules = catalog.marginRules || [];
  const variantCount = items.reduce((total, item) => total + Number(item.variantCount ?? item.variants?.length ?? 0), 0);
  const discountPriceListCount = priceLists.filter(list => (
    (list.items || []).some(item => Number(item.discountPercent || 0) > 0)
  )).length;
  const quantityBreakCount = priceLists.reduce((total, list) => (
    total + (list.items || []).filter(item => Number(item.minQuantity || 1) > 1).length
  ), 0);
  const categoryMarginRuleCount = marginRules.filter(rule => rule.scopeType === "category").length;
  const categoryMarginRuleLabel = categoryMarginRuleCount === 1 ? "category rule" : "category rules";
  const marginAlertCount = priceLists.reduce((total, list) => (
    total + (list.items || []).filter(item => item.marginStatus === "below_minimum").length
  ), 0);

  const stockableItems = useMemo(() => items.filter(item => item.status === "active" && item.trackStock), [items]);
  const internalLocations = useMemo(() => locations.filter(location => location.status === "active" && location.locationType === "internal"), [locations]);
  const sourceLocations = useMemo(() => locations.filter(location => location.status === "active" && ["internal", "supplier", "inventory"].includes(location.locationType)), [locations]);
  const destinationLocations = useMemo(() => locations.filter(location => location.status === "active" && ["internal", "customer", "scrap"].includes(location.locationType)), [locations]);

  const defaultItemId = catalogItemId || stockableItems[0]?.id || "";
  const mainWarehouse = internalLocations.find(location => location.code === "WH/STOCK") || internalLocations[0];
  const dispatchLocation = internalLocations.find(location => location.code === "WH/OUT") || internalLocations[1] || internalLocations[0];
  const supplierLocation = locations.find(location => location.code === "SUPPLIERS");
  const customerLocation = locations.find(location => location.code === "CUSTOMERS");
  const inventoryAdjustmentLocation = locations.find(location => location.code === "INV/ADJUST");
  const scrapLocation = locations.find(location => location.code === "SCRAP");
  const defaultSourceForType = type => {
    if (type === "receipt") return supplierLocation?.id || "";
    if (type === "adjustment") return inventoryAdjustmentLocation?.id || "";
    if (["transfer", "delivery", "scrap"].includes(type)) return mainWarehouse?.id || "";
    return "";
  };
  const defaultDestinationForType = type => {
    if (type === "delivery") return customerLocation?.id || "";
    if (type === "scrap") return scrapLocation?.id || "";
    return dispatchLocation?.id || mainWarehouse?.id || "";
  };
  const defaultSourceId = sourceLocationId || defaultSourceForType(moveType);
  const defaultDestinationId = destinationLocationId || defaultDestinationForType(moveType);
  const availableTotal = stock.reduce((total, row) => total + Number(row.availableQuantity || 0), 0);
  const stockValue = stock.reduce((total, row) => total + (Number(row.availableQuantity || 0) * Number(row.averageCost || 0)), 0);
  const busy = actionState === "inventory-move:running";
  const canSubmitMove = Boolean(defaultItemId && defaultSourceId && defaultDestinationId);

  async function submitMove(event) {
    event.preventDefault();
    if (!onCreateMove || !canSubmitMove) return;
    await onCreateMove({
      catalogItemId: defaultItemId,
      sourceLocationId: defaultSourceId || undefined,
      destinationLocationId: defaultDestinationId || undefined,
      moveType,
      quantity: numberInput(quantity),
      unitCost: Math.max(0, Math.round(Number(unitCost) || 0)),
      reason,
      reference
    });
  }

  return (
    <>
      <article className="panel inventory-overview-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">Catalog & Inventory</span>
            <h2>Product and stock spine</h2>
          </div>
          <strong className="aging-badge">{stockableItems.length} stockable</strong>
        </div>
        <div className="aging-summary">
          <div className="metric"><span>catalog items</span><strong>{items.length}</strong></div>
          <div className="metric"><span>available units</span><strong>{availableTotal.toLocaleString("hy-AM")}</strong></div>
          <div className="metric"><span>stock value</span><strong>{amd(stockValue)}</strong></div>
        </div>
        <div className="meta-row">
          <span>{categories.length} categories</span>
          <span>{variantCount} variants</span>
          <span>{priceLists.length} price lists</span>
          <span>{discountPriceListCount} discount lists</span>
          <span>{quantityBreakCount} quantity breaks</span>
          <span>{marginRules.length} margin rules</span>
          <span>{categoryMarginRuleCount} {categoryMarginRuleLabel}</span>
          <span>{marginAlertCount} margin alerts</span>
          <span>{locations.length} governed locations</span>
        </div>
      </article>

      <article className="panel inventory-stock-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">Warehouse ledger</span>
            <h2>Internal stock</h2>
          </div>
          <strong className="aging-badge">{stock.length} balances</strong>
        </div>
        <div className="rows">
          {stock.slice(0, 8).map(row => (
            <div className="row inventory-stock" key={`${row.catalogItemId}:${row.locationId}`}>
              <span>{row.catalogSku} · {row.catalogName} · {row.locationCode}</span>
              <strong>{Number(row.availableQuantity || 0).toLocaleString("hy-AM")} available</strong>
            </div>
          ))}
          {stock.length === 0 && <div className="row"><span>No internal stock balances yet</span></div>}
        </div>
      </article>

      <article className="panel inventory-catalog-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">Product master</span>
            <h2>Catalog items</h2>
          </div>
          <strong className="aging-badge">AMD</strong>
        </div>
        <div className="rows">
          {items.slice(0, 8).map(item => (
            <div className="row inventory-catalog" key={item.id}>
              <span>{item.sku} · {item.name} · {item.categoryName || item.itemType} · {item.unitOfMeasure || "unit"} · {variantLabel(item)}</span>
              <strong>{amd(item.listPrice)} · {marginLabel(item)}</strong>
            </div>
          ))}
          {items.length === 0 && <div className="row"><span>No catalog items yet</span></div>}
        </div>
      </article>

      {canMove && (
        <article className="panel inventory-move-form">
          <div className="panel-head">
            <div>
              <span className="section-label">Stock operations</span>
              <h2>Post stock move</h2>
            </div>
            <strong className="aging-badge">audited</strong>
          </div>
          <form className="inline-form" onSubmit={submitMove}>
            <label>
              Item
              <select value={defaultItemId} onChange={event => setCatalogItemId(event.target.value)} disabled={busy || stockableItems.length === 0}>
                {stockableItems.map(item => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
              </select>
            </label>
            <label>
              Type
              <select
                value={moveType}
                onChange={event => {
                  setMoveType(event.target.value);
                  setSourceLocationId("");
                  setDestinationLocationId("");
                }}
                disabled={busy}
              >
                <option value="transfer">Transfer</option>
                <option value="receipt">Receipt</option>
                <option value="delivery">Delivery</option>
                <option value="adjustment">Adjustment</option>
                <option value="scrap">Scrap</option>
              </select>
            </label>
            <label>
              Source
              <select value={defaultSourceId || ""} onChange={event => setSourceLocationId(event.target.value)} disabled={busy}>
                <option value="">Default</option>
                {sourceLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}
              </select>
            </label>
            <label>
              Destination
              <select value={defaultDestinationId || ""} onChange={event => setDestinationLocationId(event.target.value)} disabled={busy}>
                <option value="">Default</option>
                {destinationLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}
              </select>
            </label>
            <label>
              Quantity
              <input value={quantity} onChange={event => setQuantity(event.target.value)} inputMode="numeric" disabled={busy} />
            </label>
            <label>
              Unit cost
              <input value={unitCost} onChange={event => setUnitCost(event.target.value)} inputMode="numeric" placeholder="default cost" disabled={busy} />
            </label>
            <label>
              Reference
              <input value={reference} onChange={event => setReference(event.target.value)} disabled={busy} />
            </label>
            <label>
              Reason
              <input value={reason} onChange={event => setReason(event.target.value)} disabled={busy} />
            </label>
            <button className="mini-action secondary" type="submit" disabled={busy || !canSubmitMove}>
              {busy ? "Posting" : "Post move"}
            </button>
          </form>
          {actionState === "inventory-move:done" && <p className="action-status">Stock move posted and workspace refreshed.</p>}
          {actionState === "inventory-move:error" && <p className="action-status">Stock move failed. Check quantity, locations, and role permissions.</p>}
        </article>
      )}

      <article className="panel inventory-moves-panel">
        <div className="panel-head">
          <div>
            <span className="section-label">Audit trail</span>
            <h2>Recent stock moves</h2>
          </div>
          <strong className="aging-badge">{moves.length}</strong>
        </div>
        <div className="rows">
          {moves.slice(0, 8).map(move => (
            <div className="row inventory-move" key={move.id}>
              <span>{move.catalogSku} · {move.moveType} · {moveEndpoint(move)} · {move.reference || move.reason || "no reference"}</span>
              <strong>{Number(move.quantity || 0).toLocaleString("hy-AM")} units</strong>
            </div>
          ))}
          {moves.length === 0 && <div className="row"><span>No stock moves yet</span></div>}
        </div>
      </article>
    </>
  );
}
