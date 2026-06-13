import React, { useState } from "react";

const PROJECT_STATUSES = ["planning", "active", "on-hold", "completed", "cancelled"];

function hours(minutes) {
  const h = Math.floor((minutes || 0) / 60);
  const m = (minutes || 0) % 60;
  return m ? `${h}ժ ${m}ր` : `${h}ժ`;
}

export function ProjectCreateForm({ customers, onCreate, actionState }) {
  const list = customers || [];
  const [name, setName] = useState("");
  const [status, setStatus] = useState("planning");
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const busy = actionState === "project:create";
  function submit() {
    if (name.trim().length < 3) return;
    onCreate({ name: name.trim(), status, customerId: customerId || undefined, dueDate: dueDate || undefined });
    setName(""); setCustomerId(""); setDueDate("");
  }
  return (
    <article className="panel project-create-panel">
      <div className="panel-head"><div><span className="section-label">A1 Projects</span><h2>New project</h2></div></div>
      <div className="inline-form">
        <input value={name} onChange={event => setName(event.target.value)} placeholder="Անվանում (name)" />
        <select value={status} onChange={event => setStatus(event.target.value)}>
          {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={customerId} onChange={event => setCustomerId(event.target.value)}>
          <option value="">— Հաճախորդ (ըստ ցանկության) —</option>
          {list.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </select>
        <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} />
        <button className="mini-action" type="button" disabled={busy} onClick={submit}>{busy ? "Saving" : "Create project"}</button>
      </div>
    </article>
  );
}

export function ProjectsBoardPanel({ data, canWrite, canBill, onAddTask, onToggleTask, onUpdateStatus, onLogTime, onBillTime, onLoadDetail, actionState }) {
  const projects = (data && data.projects) || [];
  const [taskTitle, setTaskTitle] = useState({});
  const [timeMin, setTimeMin] = useState({});
  const [billRate, setBillRate] = useState({});
  // Lazy per-project detail tree (tasks + milestones), fetched on first expand and cached.
  const [detail, setDetail] = useState({}); // { [projectId]: { loading, project, error } }
  async function toggleDetail(projectId) {
    const current = detail[projectId];
    if (current && !current.error) { // collapse if already open
      setDetail(prev => { const next = { ...prev }; delete next[projectId]; return next; });
      return;
    }
    if (!onLoadDetail) return;
    setDetail(prev => ({ ...prev, [projectId]: { loading: true } }));
    try {
      const project = await onLoadDetail(projectId);
      setDetail(prev => ({ ...prev, [projectId]: { project } }));
    } catch {
      setDetail(prev => ({ ...prev, [projectId]: { error: true } }));
    }
  }
  return (
    <article className="panel projects-board-panel">
      <div className="panel-head">
        <div><span className="section-label">A1 Projects</span><h2>Projects</h2></div>
        <strong className="aging-badge">{projects.filter(p => p.status === "active").length} active</strong>
      </div>
      <div className="rows">
        {projects.map(project => {
          const busy = actionState === `project:act:${project.id}`;
          return (
            <div className="row" key={project.id} style={{ flexDirection: "column", alignItems: "stretch", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <span>{project.name} · <strong>{project.status}</strong></span>
                <span>
                  {project.taskDone}/{project.taskTotal} tasks · {project.milestoneReached}/{project.milestoneTotal} milestones · {hours(project.totalMinutes)}
                </span>
              </div>
              {canWrite && (
                <div className="inline-form" style={{ gap: "6px", flexWrap: "wrap" }}>
                  <select value="" disabled={busy} onChange={event => { if (event.target.value) onUpdateStatus(project.id, event.target.value); }}>
                    <option value="">Set status…</option>
                    {PROJECT_STATUSES.filter(s => s !== project.status).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    value={taskTitle[project.id] || ""}
                    onChange={event => setTaskTitle({ ...taskTitle, [project.id]: event.target.value })}
                    placeholder="Նոր առաջադրանք"
                  />
                  <button className="mini-action" type="button" disabled={busy || !(taskTitle[project.id] || "").trim()} onClick={() => { onAddTask(project.id, (taskTitle[project.id] || "").trim()); setTaskTitle({ ...taskTitle, [project.id]: "" }); }}>Add task</button>
                  <input
                    value={timeMin[project.id] || ""}
                    onChange={event => setTimeMin({ ...timeMin, [project.id]: event.target.value })}
                    inputMode="numeric"
                    placeholder="Րոպեներ"
                    style={{ width: "90px" }}
                  />
                  <button className="mini-action" type="button" disabled={busy || !(Number(timeMin[project.id]) > 0)} onClick={() => { onLogTime(project.id, Math.round(Number(timeMin[project.id]))); setTimeMin({ ...timeMin, [project.id]: "" }); }}>Log time</button>
                </div>
              )}
              {canBill && project.customerId && project.totalMinutes > 0 && (
                <div className="inline-form" style={{ gap: "6px" }}>
                  <input
                    value={billRate[project.id] || ""}
                    onChange={event => setBillRate({ ...billRate, [project.id]: event.target.value })}
                    inputMode="numeric"
                    placeholder="Ժամի դրույք (AMD)"
                    style={{ width: "140px" }}
                  />
                  <button className="mini-action" type="button" disabled={busy || !(Number(billRate[project.id]) > 0)} onClick={() => { onBillTime(project.id, Math.round(Number(billRate[project.id]))); setBillRate({ ...billRate, [project.id]: "" }); }}>Bill time → invoice</button>
                </div>
              )}
              {onLoadDetail && (
                <div className="inline-form" style={{ gap: "6px" }}>
                  <button className="mini-action" type="button" onClick={() => toggleDetail(project.id)}>
                    {detail[project.id] ? (detail[project.id].loading ? "Loading…" : "Hide detail") : "View detail"}
                  </button>
                </div>
              )}
              {detail[project.id] && detail[project.id].project && (
                <div className="project-detail" style={{ fontSize: "0.85em", opacity: 0.9, paddingLeft: "8px", borderLeft: "2px solid var(--line)" }}>
                  <div style={{ fontWeight: 600, margin: "4px 0 2px" }}>Tasks · Առաջադրանքներ</div>
                  {(detail[project.id].project.tasks || []).map(t => (
                    <div key={t.id}>· {t.title} — <strong>{t.status}</strong>{t.dueDate ? ` (due ${t.dueDate.slice(0, 10)})` : ""}</div>
                  ))}
                  {(detail[project.id].project.tasks || []).length === 0 && <div>· No tasks</div>}
                  <div style={{ fontWeight: 600, margin: "6px 0 2px" }}>Milestones · Հանգրվաններ</div>
                  {(detail[project.id].project.milestones || []).map(m => (
                    <div key={m.id}>· {m.title} — {m.reached ? "✓ reached" : "pending"}{m.dueDate ? ` (${m.dueDate.slice(0, 10)})` : ""}</div>
                  ))}
                  {(detail[project.id].project.milestones || []).length === 0 && <div>· No milestones</div>}
                  <div style={{ margin: "6px 0 2px", opacity: 0.8 }}>Logged time: {hours(detail[project.id].project.totalMinutes)} · {detail[project.id].project.timeEntryCount} entries</div>
                </div>
              )}
              {detail[project.id] && detail[project.id].error && (
                <div style={{ fontSize: "0.85em", color: "var(--ruby)" }}>Could not load detail</div>
              )}
            </div>
          );
        })}
        {projects.length === 0 && <div className="row"><span>No projects yet</span></div>}
      </div>
    </article>
  );
}
