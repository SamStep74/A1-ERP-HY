import React, { useState } from "react";

const amd = value => `${Number(value || 0).toLocaleString("hy-AM")} AMD`;

const pricingSourceLabels = {
  catalog_price_list: "price list",
  catalog_item: "catalog item",
  manual: "manual"
};

const marginStatusLabels = {
  ok: "margin ok",
  below_minimum: "below minimum"
};

function pricingSourceLabel(source) {
  return pricingSourceLabels[source] || source || "manual";
}

function marginStatusLabel(status) {
  return marginStatusLabels[status] || status || "";
}

function quoteLineTitle(line, index) {
  const sku = line.variantSku || line.catalogSku || "";
  const name = line.variantName || line.catalogName || line.description || "";
  if (sku && name) return `${sku} · ${name}`;
  return sku || name || `Line ${index + 1}`;
}

function quoteLineEvidence(line) {
  const parts = [];
  if (line.catalogPriceListCode) parts.push(line.catalogPriceListCode);
  else parts.push(pricingSourceLabel(line.pricingSource));
  if (line.pricingCustomerSegment) parts.push(line.pricingCustomerSegment);
  if (Number(line.quantity || 0) > 0 && Number(line.unitPrice || 0) > 0) {
    parts.push(`${Number(line.quantity || 0).toLocaleString("hy-AM")} x ${amd(line.unitPrice)}`);
  }
  if (Number(line.discountAmount || 0) > 0) parts.push(`${amd(line.discountAmount)} discount`);
  if (line.marginRuleCode) {
    const minimum = line.marginRuleMinimumPercent == null ? "" : ` min ${Number(line.marginRuleMinimumPercent).toLocaleString("hy-AM")}%`;
    parts.push(`${line.marginRuleCode}${minimum}`);
  }
  if (line.marginStatus) parts.push(marginStatusLabel(line.marginStatus));
  return parts.join(" · ");
}

function quotePricingEvidenceLines(quote) {
  return ((quote && quote.lines) || []).filter(line => (
    line.pricingSource ||
    line.catalogPriceListCode ||
    line.pricingCustomerSegment ||
    Number(line.discountAmount || 0) > 0 ||
    line.marginRuleCode ||
    line.marginStatus
  ));
}

export function CrmQuotesPanel({ data, actionState, onRequestApproval }) {
  const quotes = (data && data.quotes) || [];
  return (
    <article className="panel crm-quotes-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">A1 CRM</span>
          <h2>Quotes Tube</h2>
        </div>
        <strong className="aging-badge">{quotes.length} quotes</strong>
      </div>
      <div className="rows">
        {quotes.map(quote => {
          const evidenceLines = quotePricingEvidenceLines(quote);
          const visibleEvidenceLines = evidenceLines.slice(0, 3);
          const hiddenEvidenceCount = evidenceLines.length - visibleEvidenceLines.length;
          return (
            <div className="row crm-quote-row" key={quote.id}>
              <div className="crm-quote-summary">
                <span>{quote.customerName} · {quote.number || quote.title || quote.id} · {quote.status}</span>
                <strong>{amd(quote.total)}</strong>
                {quote.status === "draft" && onRequestApproval && (
                  <button
                    className="mini-action"
                    type="button"
                    disabled={actionState === `quote:approve:${quote.id}`}
                    onClick={() => onRequestApproval(quote.id)}
                  >
                    {actionState === `quote:approve:${quote.id}` ? "Requesting" : "Request release"}
                  </button>
                )}
              </div>
              {visibleEvidenceLines.length > 0 && (
                <div className="quote-pricing-evidence">
                  {visibleEvidenceLines.map((line, index) => (
                    <span
                      className={`quote-pricing-chip ${line.marginStatus === "below_minimum" ? "warning" : ""}`}
                      key={`${line.id || line.catalogItemId || line.description || "line"}-${index}`}
                    >
                      <b>{quoteLineTitle(line, index)}</b>
                      <em>{quoteLineEvidence(line)}</em>
                    </span>
                  ))}
                  {hiddenEvidenceCount > 0 && <span className="quote-pricing-more">+{hiddenEvidenceCount} lines</span>}
                </div>
              )}
            </div>
          );
        })}
        {quotes.length === 0 && <div className="row"><span>No quotes yet</span></div>}
      </div>
    </article>
  );
}

export function CrmDealsBoard({ data }) {
  const deals = (data && data.deals) || [];
  if (deals.length === 0) return null;
  const byStage = {};
  for (const deal of deals) { (byStage[deal.stage] = byStage[deal.stage] || []).push(deal); }
  return (
    <article className="panel crm-deals-board-panel">
      <div className="panel-head">
        <div><span className="section-label">A1 CRM</span><h2>Deals · Tube</h2></div>
        <strong className="aging-badge">{deals.length} deals</strong>
      </div>
      {Object.entries(byStage).map(([stage, list]) => (
        <div className="rows" key={stage}>
          <div className="row"><span className="section-label">{stage}</span><strong>{amd(list.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0))}</strong></div>
          {list.map(deal => (
            <div className="row" key={deal.id}><span>{deal.customerName} · {deal.title}</span><strong>{amd(deal.value)}</strong></div>
          ))}
        </div>
      ))}
    </article>
  );
}

export function CrmQuoteForm({ deals, onCreate, actionState }) {
  const list = deals || [];
  const [dealId, setDealId] = useState("");
  const [title, setTitle] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const busy = actionState === "quote:create";
  if (list.length === 0) return null;
  const selectedDeal = list.find(deal => deal.id === dealId);
  function submit() {
    if (!selectedDeal) return;
    const qty = Math.max(1, Math.round(Number(quantity) || 1));
    const price = Math.round(Number(unitPrice) || 0);
    const finalTitle = (title || selectedDeal.title || "").trim();
    if (price <= 0 || finalTitle.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return;
    onCreate({
      customerId: selectedDeal.customerId,
      dealId,
      title: finalTitle,
      validUntil,
      lines: [{ description: (description || finalTitle), quantity: qty, unitPrice: price, total: qty * price }]
    });
    setDealId(""); setTitle(""); setValidUntil(""); setDescription(""); setQuantity("1"); setUnitPrice("");
  }
  return (
    <article className="panel crm-quote-form-panel">
      <div className="panel-head"><div><span className="section-label">A1 CRM</span><h2>New quote</h2></div></div>
      <div className="inline-form">
        <select value={dealId} onChange={event => { const id = event.target.value; setDealId(id); const deal = list.find(item => item.id === id); if (deal && !title) setTitle(deal.title || ""); }}>
          <option value="">— Ընտրել գործարք —</option>
          {list.map(deal => <option key={deal.id} value={deal.id}>{deal.customerName} · {deal.title}</option>)}
        </select>
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Վերնագիր" />
        <input value={validUntil} onChange={event => setValidUntil(event.target.value)} placeholder="Վավեր մինչև (YYYY-MM-DD)" />
        <input value={description} onChange={event => setDescription(event.target.value)} placeholder="Տող՝ նկարագրություն" />
        <input value={quantity} onChange={event => setQuantity(event.target.value)} inputMode="numeric" placeholder="Քանակ" />
        <input value={unitPrice} onChange={event => setUnitPrice(event.target.value)} inputMode="numeric" placeholder="Միավորի գին (AMD)" />
        <button className="mini-action" type="button" disabled={busy} onClick={submit}>{busy ? "Creating" : "Create quote"}</button>
      </div>
    </article>
  );
}

export function CrmActivityPanel({ data }) {
  const all = (data && data.activities) || [];
  const activities = all.slice(0, 12);
  return (
    <article className="panel crm-activity-panel">
      <div className="panel-head">
        <div><span className="section-label">A1 CRM</span><h2>Activity timeline</h2></div>
        <strong className="aging-badge">{all.length}</strong>
      </div>
      <div className="rows">
        {activities.map(activity => (
          <div className="row" key={activity.id}>
            <span>{(activity.occurredAt || "").slice(0, 10)} · {activity.kind} · {activity.customerName || activity.dealTitle || ""}</span>
            <strong>{activity.title}</strong>
          </div>
        ))}
        {activities.length === 0 && <div className="row"><span>No activity yet</span></div>}
      </div>
    </article>
  );
}
