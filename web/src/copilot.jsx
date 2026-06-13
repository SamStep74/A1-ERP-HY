import React, { useMemo, useState } from "react";
import { formatSourceDate, getSourceLink } from "./copilot-source.js";

const INTENTS = [
  ["vat", "ԱԱՀ / SRC", "finance", "Կարո՞ղ ենք պատրաստել 2026-05 ԱԱՀ/SRC ներքին ուղեցույց այս հաճախորդի համար:"],
  ["payroll", "Աշխատավարձ", "finance", "Նախադիտիր աշխատավարձի պահումները առանց գրանցում կատարելու:"],
  ["personal-data", "Անձնական տվյալներ", "crm", "Ինչպե՞ս պատրաստել անձնական տվյալների հարցումը առանց ավտոմատ ջնջման:"],
  ["esign", "Է-ստորագրություն", "docs", "Ստուգիր էլեկտրոնային ստորագրության ապացույցի շղթան այս փաստաթղթի համար:"],
  ["month-close", "Ամսվա փակում", "finance", "Նախադիտիր ամսվա փակման ռիսկերը առանց ժամանակաշրջանը փակելու:"]
];

const REVIEW_ROLE_LABELS = {
  Accountant: "Հաշվապահ",
  Lawyer: "Իրավաբան",
  Owner: "Սեփականատեր",
  Admin: "Ադմին",
  Auditor: "Աուդիտոր"
};

const money = value => `${Number(value || 0).toLocaleString("hy-AM")} AMD`;

export function CopilotPanel({ customers, docs, people, appIds = [], onAsk, actionState }) {
  const assignedApps = useMemo(() => new Set(appIds), [appIds]);
  const allowedIntents = useMemo(() => INTENTS.filter(([, , requiredApp]) => assignedApps.has(requiredApp)), [assignedApps]);
  const fallbackIntent = allowedIntents[0] || INTENTS[0];
  const [intent, setIntent] = useState(fallbackIntent[0]);
  const [question, setQuestion] = useState(fallbackIntent[3]);
  const [customerId, setCustomerId] = useState("cust-nare");
  const [periodKey, setPeriodKey] = useState("2026-05");
  const [employeeId, setEmployeeId] = useState("");
  const [gross, setGross] = useState("600000");
  const [documentId, setDocumentId] = useState("doc-anahit-nda");
  const [result, setResult] = useState(null);
  const [localError, setLocalError] = useState("");
  const busy = actionState === "copilot:ask";
  const employees = (people && people.employees) || [];
  const documents = (docs && docs.documents) || [];
  const customerOptions = useMemo(() => customers || [], [customers]);
  React.useEffect(() => {
    if (allowedIntents.some(([key]) => key === intent)) return;
    setIntent(fallbackIntent[0]);
    setQuestion(fallbackIntent[3]);
  }, [allowedIntents, fallbackIntent, intent]);

  async function ask() {
    if (question.trim().length < 8 || !onAsk) return;
    setLocalError("");
    const payload = {
      intent,
      question: question.trim(),
      customerId: customerId || undefined,
      periodKey: periodKey || undefined,
      employeeId: employeeId || undefined,
      gross: gross ? Number(gross) : undefined,
      documentId: documentId || undefined
    };
    try {
      setResult(await onAsk(payload));
    } catch (err) {
      setLocalError((err && err.message) || "Copilot հարցումը ձախողվեց");
    }
  }

  return (
    <article className="panel copilot-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">A1 Copilot</span>
          <h2>Իրավական եւ հաշվապահական Copilot</h2>
        </div>
        <strong className="aging-badge">OpenRouter · hy</strong>
      </div>

      <div className="copilot-controls">
        <div className="segmented">
          {allowedIntents.map(([key, label, , defaultQuestion]) => (
            <button
              key={key}
              type="button"
              className={intent === key ? "active" : ""}
              onClick={() => {
                setIntent(key);
                setQuestion(defaultQuestion);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea value={question} onChange={event => setQuestion(event.target.value)} rows={3} />
        <div className="inline-form">
          <select value={customerId} onChange={event => setCustomerId(event.target.value)}>
            <option value="">Առանց հաճախորդի</option>
            {customerOptions.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          {(intent === "vat" || intent === "month-close") && (
            <input value={periodKey} onChange={event => setPeriodKey(event.target.value)} placeholder="YYYY-MM" />
          )}
          {intent === "payroll" && (
            <>
              <select value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
                <option value="">Ձեռքով համախառն</option>
                {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
              </select>
              <input value={gross} onChange={event => setGross(event.target.value)} inputMode="numeric" placeholder="Համախառն AMD" />
            </>
          )}
          {intent === "esign" && (
            <select value={documentId} onChange={event => setDocumentId(event.target.value)}>
              <option value="">Ընտրել փաստաթուղթ</option>
              {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
            </select>
          )}
          <button className="mini-action" type="button" disabled={busy} onClick={ask}>{busy ? "Հարցնում է" : "Հարցնել"}</button>
        </div>
      </div>

      {localError && <p className="action-status">{localError}</p>}
      {result && <CopilotResult result={result} />}
    </article>
  );
}

function CopilotResult({ result }) {
  const citations = result.citations || [];
  const calculations = result.calculations || [];
  const actions = result.proposedActions || [];
  const supplementalSources = result.supplementalSources || [];
  const modelPolicy = result.modelPolicy || {};
  return (
    <div className="copilot-result">
      <p>{result.answer}</p>
      <div className="meta-row">
        <span>{result.intent}</span>
        <span>{result.riskLevel}</span>
        <span>{modelPolicy.model || "auto"} · {modelPolicy.language || "hy-AM"}</span>
        <span>{result.confidence}% վստահություն</span>
        <span>{result.reviewRequired ? "վերանայում պարտադիր է" : "վերանայումը ընտրովի է"}</span>
      </div>
      {calculations.length > 0 && (
        <div className="copilot-block">
          <h3>Հաշվարկներ</h3>
          {calculations.map(calc => (
            <div className="row" key={calc.kind}>
              <span>{calc.label}</span>
              <strong>{formatCalculation(calc)}</strong>
            </div>
          ))}
        </div>
      )}
      {citations.length > 0 && (
        <div className="copilot-block">
          <h3>Աղբյուրներ</h3>
          {citations.map(source => (
            <div className="row" key={source.id}>
              <span>
                {source.title} · {source.status}
                <em className={source.professionalReviewReady ? "source-ready" : "source-blocked"}>{formatSourceReview(source)}</em>
                <SourceLink source={source} />
              </span>
              <strong>{formatSourceDate(source)}</strong>
            </div>
          ))}
        </div>
      )}
      {supplementalSources.length > 0 && (
        <div className="copilot-block copilot-supplemental">
          <h3>Լրացուցիչ աղբյուրներ · ոչ պաշտոնական</h3>
          <p className="supplemental-note">Open Notebook-ից (ընտրովի). Սրանք պաշտոնական իրավական մեջբերումներ չեն եւ չեն փոխարինում մասնագիտորեն վերանայված աղբյուրները:</p>
          {supplementalSources.map((source, index) => (
            <div className="row supplemental-row" key={source.sourceUrl || `${source.title}-${index}`}>
              <span>
                <strong className="supplemental-title">{source.title}</strong>
                {source.excerpt ? <em className="supplemental-excerpt">{source.excerpt}</em> : null}
                <SupplementalLink url={source.sourceUrl} />
              </span>
            </div>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div className="copilot-block">
          <h3>Առաջարկվող քայլեր</h3>
          {actions.map(action => (
            <div className="row" key={action.key}>
              <span>{action.label}{action.disabledReason ? ` · ${action.disabledReason}` : ""}</span>
              <strong>{action.method} {action.path || "արգելափակված"}</strong>
            </div>
          ))}
        </div>
      )}
      {(result.guardrails || []).map(item => <p className="action-status" key={item}>{item}</p>)}
    </div>
  );
}

function SourceLink({ source }) {
  const link = getSourceLink(source);
  if (!link) return null;
  return (
    <a className="source-link" href={link.href} target="_blank" rel="noopener noreferrer">
      <span>Բացել աղբյուրը</span>
      <small>{link.host}</small>
    </a>
  );
}

// Open Notebook rows carry a plain sourceUrl string (not the citation shape).
// Only render http(s) links, and never auto-open — same posture as SourceLink.
function SupplementalLink({ url }) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
  let host = url;
  try { host = new URL(url).host; } catch { /* keep raw url as label */ }
  return (
    <a className="source-link" href={url} target="_blank" rel="noopener noreferrer">
      <span>Բացել Open Notebook աղբյուրը</span>
      <small>{host}</small>
    </a>
  );
}

function formatSourceReview(source) {
  const latest = source.latestReview || {};
  const role = REVIEW_ROLE_LABELS[latest.reviewedByRole] || latest.reviewedByRole || "չնշված դեր";
  const reviewer = latest.reviewedByName ? ` · ${latest.reviewedByName}` : "";
  if (source.professionalReviewReady) return `Մասնագիտական վերանայում՝ ${role}${reviewer}`;
  if (latest.reviewedByRole) return `Մասնագիտական վերանայումը բաց է · վերջին վերանայումը՝ ${role}${reviewer}`;
  return "Մասնագիտական վերանայում չկա";
}

function formatCalculation(calc) {
  const outputs = calc.outputs || {};
  if (calc.kind === "vat-report") return money(outputs.netVatPayable);
  if (calc.kind === "payroll-preview") return money(outputs.net);
  if (calc.kind === "trial-balance") return outputs.balanced ? "հավասարակշռված" : "ստուգել";
  return Object.keys(outputs).length ? JSON.stringify(outputs) : "-";
}
