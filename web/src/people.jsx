import React, { useState } from "react";

const amd = value => `${Number(value || 0).toLocaleString("hy-AM")} AMD`;

export function PeopleEmployeeForm({ onCreate, actionState }) {
  const [fullName, setFullName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [grossSalary, setGrossSalary] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [email, setEmail] = useState("");
  const busy = actionState === "employee:create";
  function submit() {
    if (fullName.trim().length < 2) return;
    if (taxId && !/^\d{8}$/.test(taxId.trim())) return;
    onCreate({
      fullName: fullName.trim(),
      taxId: taxId.trim(),
      position: position.trim(),
      department: department.trim(),
      grossSalary: Math.max(0, Math.round(Number(grossSalary) || 0)),
      hireDate,
      email: email.trim()
    });
    setFullName(""); setTaxId(""); setPosition(""); setDepartment(""); setGrossSalary(""); setHireDate(""); setEmail("");
  }
  return (
    <article className="panel people-employee-form-panel">
      <div className="panel-head"><div><span className="section-label">A1 People</span><h2>New employee</h2></div></div>
      <div className="inline-form">
        <input value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Անուն Ազգանուն" />
        <input value={taxId} onChange={event => setTaxId(event.target.value)} inputMode="numeric" placeholder="ՀՎՀՀ (8 նիշ)" />
        <input value={position} onChange={event => setPosition(event.target.value)} placeholder="Պաշտոն" />
        <input value={department} onChange={event => setDepartment(event.target.value)} placeholder="Բաժին" />
        <input value={grossSalary} onChange={event => setGrossSalary(event.target.value)} inputMode="numeric" placeholder="Աշխատավարձ (AMD)" />
        <input type="date" value={hireDate} onChange={event => setHireDate(event.target.value)} />
        <input value={email} onChange={event => setEmail(event.target.value)} placeholder="Էլ. փոստ" />
        <button className="mini-action" type="button" disabled={busy} onClick={submit}>{busy ? "Saving" : "Add employee"}</button>
      </div>
    </article>
  );
}

const EMPLOYMENT_STATUSES = ["active", "on-leave", "terminated"];

function EmployeeEditor({ employee, onUpdate, actionState }) {
  const [status, setStatus] = useState(employee.employmentStatus);
  const [grossSalary, setGrossSalary] = useState(String(employee.grossSalary || 0));
  const [position, setPosition] = useState(employee.position || "");
  const busy = actionState === `employee:update:${employee.id}`;
  function save() {
    const patch = {
      employmentStatus: status,
      grossSalary: Math.max(0, Math.round(Number(grossSalary) || 0)),
      position: position.trim()
    };
    onUpdate(employee.id, patch);
  }
  return (
    <div className="inline-form employee-editor">
      <select value={status} onChange={event => setStatus(event.target.value)}>
        {EMPLOYMENT_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      <input value={grossSalary} onChange={event => setGrossSalary(event.target.value)} inputMode="numeric" placeholder="Աշխատավարձ (AMD)" />
      <input value={position} onChange={event => setPosition(event.target.value)} placeholder="Պաշտոն" />
      <button className="mini-action" type="button" disabled={busy} onClick={save}>{busy ? "Saving" : "Save"}</button>
    </div>
  );
}

function PayrollHistory({ employeeId, onLoadHistory }) {
  const [runs, setRuns] = useState(null); // null = not loaded, [] = loaded-empty
  const [error, setError] = useState("");
  React.useEffect(() => {
    let alive = true;
    onLoadHistory(employeeId)
      .then(list => { if (alive) setRuns(list || []); })
      .catch(e => { if (alive) setError(e.message || "Failed to load history"); });
    return () => { alive = false; };
  }, [employeeId]);
  if (error) return <div className="payroll-history" style={{ fontSize: "0.8em", color: "var(--danger, #b00)" }}>{error}</div>;
  if (runs === null) return <div className="payroll-history" style={{ fontSize: "0.8em", opacity: 0.7 }}>Loading payroll history…</div>;
  if (runs.length === 0) return <div className="payroll-history" style={{ fontSize: "0.8em", opacity: 0.7 }}>No payroll runs yet</div>;
  return (
    <div className="payroll-history" style={{ fontSize: "0.8em", opacity: 0.9, paddingLeft: "8px", borderLeft: "2px solid var(--line)" }}>
      {runs.map(run => (
        <div key={run.id}>· {run.periodKey || run.runDate} — gross {amd(run.gross)} · deductions {amd(run.totalDeductions)} · <strong>net {amd(run.net)}</strong></div>
      ))}
    </div>
  );
}

export function PeopleRegistryPanel({ data, onRunPayroll, onUpdate, onLoadHistory, actionState }) {
  const employees = (data && data.employees) || [];
  const activeCount = employees.filter(employee => employee.employmentStatus === "active").length;
  const [editingId, setEditingId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  return (
    <article className="panel people-registry-panel">
      <div className="panel-head">
        <div><span className="section-label">A1 People</span><h2>Employees</h2></div>
        <strong className="aging-badge">{activeCount} active</strong>
      </div>
      <div className="rows">
        {employees.map(employee => (
          <div className="row" key={employee.id}>
            <span>{employee.fullName} · {employee.position || "—"} · {employee.department || "—"} · <strong>{employee.employmentStatus}</strong> · {amd(employee.grossSalary)}</span>
            <span className="row-actions">
              {onUpdate && (
                <button
                  className="mini-action"
                  type="button"
                  onClick={() => setEditingId(editingId === employee.id ? null : employee.id)}
                >
                  {editingId === employee.id ? "Close" : "Edit"}
                </button>
              )}
              {employee.employmentStatus !== "terminated" && onRunPayroll && (
                <button
                  className="mini-action"
                  type="button"
                  disabled={actionState === `payroll:${employee.id}`}
                  onClick={() => onRunPayroll(employee.id)}
                >
                  {actionState === `payroll:${employee.id}` ? "Running" : "Run payroll"}
                </button>
              )}
              {onLoadHistory && (
                <button
                  className="mini-action"
                  type="button"
                  onClick={() => setHistoryId(historyId === employee.id ? null : employee.id)}
                >
                  {historyId === employee.id ? "Hide history" : "Payroll history"}
                </button>
              )}
            </span>
            {onUpdate && editingId === employee.id && (
              <EmployeeEditor employee={employee} onUpdate={onUpdate} actionState={actionState} />
            )}
            {onLoadHistory && historyId === employee.id && (
              <PayrollHistory key={`${employee.id}:${actionState}`} employeeId={employee.id} onLoadHistory={onLoadHistory} />
            )}
          </div>
        ))}
        {employees.length === 0 && <div className="row"><span>No employees yet</span></div>}
      </div>
    </article>
  );
}
