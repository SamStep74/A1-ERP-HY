import React, { useState } from "react";

const STATUS_TABS = ["all", "open", "in-progress", "waiting-customer", "escalated", "resolved", "closed"];
const MOVE_TO = ["open", "in-progress", "waiting-customer", "resolved", "closed"];
const CHANNELS = ["WhatsApp", "Telegram", "Email", "Phone", "Manual"];

export function CreateTicketForm({ customers, onCreate, actionState }) {
  const list = customers || [];
  const [customerId, setCustomerId] = useState("");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState("medium");
  const [channel, setChannel] = useState("Manual");
  const busy = actionState === "ticket:create";
  if (list.length === 0) return null;
  function submit() {
    if (!customerId || subject.trim().length < 4) return;
    onCreate({ customerId, subject: subject.trim(), priority, channel });
    setSubject("");
    setCustomerId("");
  }
  return (
    <article className="panel desk-create-ticket-panel">
      <div className="panel-head"><div><span className="section-label">A1 Desk</span><h2>New ticket</h2></div></div>
      <div className="inline-form">
        <select value={customerId} onChange={event => setCustomerId(event.target.value)}>
          <option value="">— Ընտրել հաճախորդ —</option>
          {list.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Թեմա (subject)" />
        <select value={priority} onChange={event => setPriority(event.target.value)}>
          {["low", "medium", "high"].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={channel} onChange={event => setChannel(event.target.value)}>
          {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
        </select>
        <button className="mini-action" type="button" disabled={busy} onClick={submit}>{busy ? "Creating" : "Create ticket"}</button>
      </div>
    </article>
  );
}

export function DeskTicketList({ data, onUpdate, actionState }) {
  const cases = (data && data.cases) || [];
  const agents = (data && data.agents) || [];
  const [filter, setFilter] = useState("all");
  const visible = filter === "all" ? cases : cases.filter(item => item.status === filter);
  return (
    <article className="panel desk-ticket-list-panel">
      <div className="panel-head">
        <div><span className="section-label">A1 Desk</span><h2>Tickets</h2></div>
        <strong className="aging-badge">{cases.length}</strong>
      </div>
      <div className="inline-form">
        {STATUS_TABS.map(tab => (
          <button key={tab} type="button" className={`mini-action${filter === tab ? " active" : ""}`} onClick={() => setFilter(tab)}>{tab}</button>
        ))}
      </div>
      <div className="rows">
        {visible.map(item => (
          <div className="row" key={item.id}>
            <span>{item.caseNumber} · {item.customerName} · {item.subject} · <strong>{item.status}</strong> · {item.priority} · SLA {item.slaStatus} · {item.ownerName || "—"}</span>
            <select value="" disabled={actionState === `ticket:update:${item.id}`} onChange={event => { if (event.target.value) onUpdate(item.id, { status: event.target.value }); }}>
              <option value="">Move to…</option>
              {MOVE_TO.filter(s => s !== item.status).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value="" disabled={actionState === `ticket:update:${item.id}`} onChange={event => { if (event.target.value) onUpdate(item.id, { ownerUserId: event.target.value }); }}>
              <option value="">Assign…</option>
              {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>
        ))}
        {visible.length === 0 && <div className="row"><span>No tickets</span></div>}
      </div>
    </article>
  );
}
