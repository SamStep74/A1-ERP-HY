import React from "react";

const pct = value => (typeof value === "number" ? `${Math.round(value * 10000) / 100}%` : "—");

export function ProductionReadinessPanel({ data }) {
  const readiness = data && data.readiness;
  if (!readiness) return null;
  const gates = readiness.gates || [];
  const blockers = readiness.blockers || [];
  return (
    <article className="panel production-readiness-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Production readiness</span>
          <h2>Մասնագիտական վերանայման gate</h2>
        </div>
        <strong className={`aging-badge ${readiness.status === "ready" ? "ok" : "risk"}`}>
          {readiness.status === "ready" ? "Ready" : "Blocked"}
        </strong>
      </div>
      <div className="aging-summary">
        <div className="metric"><span>բոլոր gate-երը</span><strong>{readiness.summary?.total || gates.length}</strong></div>
        <div className="metric"><span>անցած</span><strong>{readiness.summary?.passed || 0}</strong></div>
        <div className="metric"><span>արգելափակող</span><strong>{readiness.summary?.blocked || blockers.length}</strong></div>
      </div>
      {blockers.length > 0 && (
        <p className="action-status">
          Արտադրական օգտագործումը արգելափակված է մինչեւ հաշվապահի/իրավաբանի վերանայումը:
        </p>
      )}
      <div className="rows">
        {gates.map(gate => (
          <div className="row" key={gate.key}>
            <span>
              <strong>{gate.label}</strong> · {gate.ownerRole} · {gate.effectiveDate || "առանց ամսաթվի"}
              {typeof gate.rate === "number" ? ` · ${pct(gate.rate)}` : ""}
              <em>{gate.nextAction}</em>
            </span>
            <strong>{gate.pass ? "pass" : "review"}</strong>
          </div>
        ))}
      </div>
      <div className="meta-row">
        <span>as of {readiness.asOf}</span>
        <span>{readiness.reviewRequired ? "review required" : "production-ready"}</span>
      </div>
    </article>
  );
}
