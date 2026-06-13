import React, { useState } from "react";

const DOC_TYPES = ["agreement", "nda", "contract", "offer", "policy", "other"];

// Variables the server auto-fills at generation time — never shown as manual inputs.
const AUTO_FILLED_VARS = ["orgName", "customerName", "date"];

function TemplateGenerator({ templates, customers, onGenerate, actionState }) {
  const list = templates || [];
  const [templateId, setTemplateId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [vars, setVars] = useState({});
  const busy = actionState === "doc:create";
  const selected = list.find(t => t.id === templateId) || null;
  const manualVars = selected ? (selected.variables || []).filter(v => !AUTO_FILLED_VARS.includes(v)) : [];
  function pick(id) { setTemplateId(id); setVars({}); }
  function generate() {
    if (!selected) return;
    const variables = {};
    for (const v of manualVars) if ((vars[v] || "").trim()) variables[v] = vars[v].trim();
    onGenerate(selected.id, { customerId: customerId || undefined, variables });
    setTemplateId(""); setCustomerId(""); setVars({});
  }
  if (list.length === 0) return null;
  return (
    <div className="docs-template-generator" style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid var(--line)" }}>
      <div className="inline-form">
        <select value={templateId} onChange={event => pick(event.target.value)}>
          <option value="">— Ձևանմուշից (from template) —</option>
          {list.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {selected && (
          <select value={customerId} onChange={event => setCustomerId(event.target.value)}>
            <option value="">— Հաճախորդ (ըստ ցանկության) —</option>
            {(customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {selected && manualVars.map(v => (
          <input key={v} value={vars[v] || ""} onChange={event => setVars({ ...vars, [v]: event.target.value })} placeholder={v} />
        ))}
        {selected && (
          <button className="mini-action" type="button" disabled={busy} onClick={generate}>{busy ? "Generating" : "Generate draft"}</button>
        )}
      </div>
      {selected && manualVars.length > 0 && (
        <div className="muted" style={{ fontSize: "0.78em", opacity: 0.7, marginTop: "4px" }}>
          Unfilled fields become [FILL: …] markers in the draft; org, customer &amp; date auto-fill.
        </div>
      )}
    </div>
  );
}

export function DocsCreateForm({ customers, templates, onCreate, onGenerate, actionState }) {
  const list = customers || [];
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("agreement");
  const [customerId, setCustomerId] = useState("");
  const [body, setBody] = useState("");
  const busy = actionState === "doc:create";
  function submit() {
    if (title.trim().length < 3) return;
    onCreate({ title: title.trim(), docType, customerId: customerId || undefined, body: body.trim() });
    setTitle(""); setBody(""); setCustomerId("");
  }
  return (
    <article className="panel docs-create-panel">
      <div className="panel-head"><div><span className="section-label">A1 Docs &amp; Sign</span><h2>New document</h2></div></div>
      {onGenerate && <TemplateGenerator templates={templates} customers={list} onGenerate={onGenerate} actionState={actionState} />}
      <div className="inline-form">
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Վերնագիր (title)" />
        <select value={docType} onChange={event => setDocType(event.target.value)}>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={customerId} onChange={event => setCustomerId(event.target.value)}>
          <option value="">— Հաճախորդ (ըստ ցանկության) —</option>
          {list.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <input value={body} onChange={event => setBody(event.target.value)} placeholder="Բովանդակություն" />
        <button className="mini-action" type="button" disabled={busy} onClick={submit}>{busy ? "Saving" : "Create document"}</button>
      </div>
    </article>
  );
}

export function DocsRegistryPanel({ data, canWrite, onAddSigner, onSend, onSign, onVoid, actionState }) {
  const documents = (data && data.documents) || [];
  const [signerName, setSignerName] = useState({});
  const [showEvidence, setShowEvidence] = useState({}); // { [docId]: true } — toggle signature audit trail
  const openCount = documents.filter(doc => doc.status === "out-for-signature").length;
  const shortHash = h => (h && h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-8)}` : (h || "—"));
  function statusClass(status) {
    if (status === "signed") return "aging-badge ok";
    if (status === "voided") return "aging-badge muted";
    if (status === "out-for-signature") return "aging-badge warn";
    return "aging-badge";
  }
  return (
    <article className="panel docs-registry-panel">
      <div className="panel-head">
        <div><span className="section-label">A1 Docs &amp; Sign</span><h2>Documents</h2></div>
        <strong className="aging-badge">{openCount} out for signature</strong>
      </div>
      <div className="rows">
        {documents.map(doc => {
          const signers = doc.signers || [];
          const signedCount = signers.filter(s => s.status === "signed").length;
          const busyDoc = actionState === `doc:act:${doc.id}`;
          return (
            <div className="row" key={doc.id} style={{ flexDirection: "column", alignItems: "stretch", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                <span>{doc.title} · {doc.docType} · <strong>{doc.status}</strong>{signers.length ? ` · ${signedCount}/${signers.length} signed` : ""}{doc.sealedAt ? " · sealed ✓" : ""}</span>
                <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <a className="mini-action secondary" href={`/api/docs/documents/${encodeURIComponent(doc.id)}/export`} target="_blank" rel="noreferrer" title="Open a printable certificate (Save as PDF)">Export / print</a>
                  <span className={statusClass(doc.status)}>{doc.status}</span>
                </span>
              </div>
              {signers.length > 0 && (
                <div style={{ fontSize: "0.85em", opacity: 0.85 }}>
                  {signers.map(s => (
                    <span key={s.id} style={{ marginRight: "10px" }}>
                      {s.signerName}: {s.status}
                      {doc.status === "out-for-signature" && s.status !== "signed" && onSign && (
                        <button className="mini-action" type="button" disabled={busyDoc} style={{ marginLeft: "4px" }} onClick={() => onSign(doc.id, s.id)}>Sign</button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {signers.some(s => s.status === "signed") && (
                <div className="inline-form" style={{ gap: "6px" }}>
                  <button className="mini-action" type="button" onClick={() => setShowEvidence(prev => ({ ...prev, [doc.id]: !prev[doc.id] }))}>
                    {showEvidence[doc.id] ? "Hide signature evidence" : "Signature evidence"}
                  </button>
                </div>
              )}
              {showEvidence[doc.id] && (
                <div className="docs-signature-evidence" style={{ fontSize: "0.8em", opacity: 0.9, paddingLeft: "8px", borderLeft: "2px solid var(--line)" }}>
                  {signers.filter(s => s.status === "signed").map(s => (
                    <div key={s.id}>· {s.signerName} — signed {(s.signedAt || "").replace("T", " ").slice(0, 16)} · SHA-256 {shortHash(s.checksum)}</div>
                  ))}
                  {doc.sealedAt
                    ? <div style={{ marginTop: "4px", fontWeight: 600 }}>Sealed ✓ {doc.sealedAt.replace("T", " ").slice(0, 16)}{doc.sealedChecksum ? ` · doc SHA-256 ${shortHash(doc.sealedChecksum)}` : ""}</div>
                    : <div style={{ marginTop: "4px", opacity: 0.7 }}>Not yet sealed — awaiting all signatures</div>}
                </div>
              )}
              {canWrite && doc.status === "draft" && (
                <div className="inline-form" style={{ gap: "6px" }}>
                  <input
                    value={signerName[doc.id] || ""}
                    onChange={event => setSignerName({ ...signerName, [doc.id]: event.target.value })}
                    placeholder="Ստորագրողի անուն"
                  />
                  <button className="mini-action" type="button" disabled={busyDoc || !(signerName[doc.id] || "").trim()} onClick={() => { onAddSigner(doc.id, (signerName[doc.id] || "").trim()); setSignerName({ ...signerName, [doc.id]: "" }); }}>Add signer</button>
                  <button className="mini-action" type="button" disabled={busyDoc || signers.length === 0} onClick={() => onSend(doc.id)}>Send for signature</button>
                  <button className="mini-action" type="button" disabled={busyDoc} onClick={() => onVoid(doc.id)}>Void</button>
                </div>
              )}
              {canWrite && doc.status === "out-for-signature" && onVoid && (
                <div className="inline-form"><button className="mini-action" type="button" disabled={busyDoc} onClick={() => onVoid(doc.id)}>Void</button></div>
              )}
            </div>
          );
        })}
        {documents.length === 0 && <div className="row"><span>No documents yet</span></div>}
      </div>
    </article>
  );
}
