import React, { useEffect, useState } from "react";

// Onboarding / AI provider setup for the Armenian legal & accounting copilot.
// OpenRouter is the single cloud provider; its model catalog is fetched LIVE so
// the dropdowns always reflect up-to-date selections. Open Notebook is an opt-in
// source that sits beside the local RAG. Secrets are write-only from the UI:
// blank fields mean "leave unchanged"; the server never returns raw keys.

const MODEL_FIELDS = [
  ["default", "Հիմնական մոդել (բոլոր գործառույթները ժառանգում են)"],
  ["copilot", "Copilot պատասխաններ"],
  ["transform", "Փաստաթղթի ամփոփում / ձեւափոխում"],
  ["finance", "Ֆինանսներ (override)"],
  ["crm", "CRM (override)"],
  ["docs", "Փաստաթղթեր (override)"]
];

export function AiOnboardingPanel({ api }) {
  const [models, setModels] = useState([]);
  const [menu, setMenu] = useState({ online: false, source: "", egressAllowed: false });
  const [form, setForm] = useState(null);
  const [meta, setMeta] = useState({ openrouterApiKeySet: false, openNotebookApiKeySet: false });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [s, m] = await Promise.all([api("/api/ai/settings"), api("/api/ai/models")]);
      setMenu({ online: m.online, source: m.source, egressAllowed: m.egressAllowed });
      setModels(m.models || []);
      setMeta({ openrouterApiKeySet: s.settings.openrouterApiKeySet, openNotebookApiKeySet: s.settings.openNotebook.apiKeySet });
      setForm({
        openrouterApiKey: "",
        models: { ...s.settings.models },
        openNotebook: { enabled: s.settings.openNotebook.enabled, baseUrl: s.settings.openNotebook.baseUrl || "", apiKey: "" }
      });
    } catch (err) {
      setStatus((err && err.message) || "Չհաջողվեց բեռնել AI կարգավորումները");
    }
  }
  useEffect(() => { refresh(); }, []);

  async function save() {
    if (!form || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const patch = {
        models: form.models,
        openNotebook: { enabled: form.openNotebook.enabled, baseUrl: form.openNotebook.baseUrl.trim() }
      };
      if (form.openrouterApiKey.trim()) patch.openrouterApiKey = form.openrouterApiKey.trim();
      if (form.openNotebook.apiKey.trim()) patch.openNotebook.apiKey = form.openNotebook.apiKey.trim();
      const res = await api("/api/ai/settings", { method: "PUT", body: patch });
      setMeta({ openrouterApiKeySet: res.settings.openrouterApiKeySet, openNotebookApiKeySet: res.settings.openNotebook.apiKeySet });
      setForm(f => ({ ...f, openrouterApiKey: "", openNotebook: { ...f.openNotebook, apiKey: "" } }));
      setStatus("Պահպանված է ✓");
    } catch (err) {
      setStatus((err && err.message) || "Պահպանումը ձախողվեց");
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <article className="panel ai-onboarding-panel">
        <div className="panel-head"><h2>AI մատակարար եւ մոդելներ</h2></div>
        <p className="action-status">{status || "Բեռնում…"}</p>
      </article>
    );
  }

  const setModel = (key, value) => setForm(f => ({ ...f, models: { ...f.models, [key]: value } }));
  const knownIds = new Set(models.map(m => m.id));

  return (
    <article className="panel ai-onboarding-panel">
      <div className="panel-head">
        <div>
          <span className="section-label">Onboarding · AI</span>
          <h2>AI մատակարար եւ մոդելներ</h2>
        </div>
        <strong className="aging-badge">OpenRouter</strong>
      </div>

      <div className="field">
        <label>
          OpenRouter API բանալի {meta.openrouterApiKeySet && <em className="source-ready">պահպանված է</em>}
        </label>
        <input
          type="password"
          autoComplete="off"
          placeholder={meta.openrouterApiKeySet ? "•••••••• (թողեք դատարկ՝ չփոխելու համար)" : "sk-or-..."}
          value={form.openrouterApiKey}
          onChange={e => setForm(f => ({ ...f, openrouterApiKey: e.target.value }))}
        />
        <small>
          {menu.online
            ? "Մոդելների ցանկը ուղիղ եթերում է OpenRouter-ից"
            : `Ցանկը offline է — ${menu.egressAllowed ? "ժամանակավոր անհասանելի" : "միացրեք openrouter.ai egress-ը թարմացման համար"} (ցուցադրվում է պահեստային ցանկը)`}
        </small>
      </div>

      <div className="ai-model-grid">
        {MODEL_FIELDS.map(([key, label]) => (
          <label key={key} className="field">
            <span>{label}</span>
            <select value={form.models[key] || ""} onChange={e => setModel(key, e.target.value)}>
              <option value="">{key === "default" ? "— ընտրեք մոդել —" : "— ինչպես հիմնականը —"}</option>
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              {form.models[key] && !knownIds.has(form.models[key]) && (
                <option value={form.models[key]}>{form.models[key]}</option>
              )}
            </select>
          </label>
        ))}
      </div>

      <div className="ai-open-notebook">
        <label className="ai-toggle">
          <input
            type="checkbox"
            checked={form.openNotebook.enabled}
            onChange={e => setForm(f => ({ ...f, openNotebook: { ...f.openNotebook, enabled: e.target.checked } }))}
          />
          <span>Open Notebook աղբյուր — ընտրովի, տեղական RAG-ի կողքին</span>
        </label>
        {form.openNotebook.enabled && (
          <div className="inline-form">
            <input
              placeholder="https://notebook.example.am"
              value={form.openNotebook.baseUrl}
              onChange={e => setForm(f => ({ ...f, openNotebook: { ...f.openNotebook, baseUrl: e.target.value } }))}
            />
            <input
              type="password"
              autoComplete="off"
              placeholder={meta.openNotebookApiKeySet ? "•••••••• (չփոխել)" : "API բանալի (ընտրովի)"}
              value={form.openNotebook.apiKey}
              onChange={e => setForm(f => ({ ...f, openNotebook: { ...f.openNotebook, apiKey: e.target.value } }))}
            />
          </div>
        )}
      </div>

      <div className="inline-form">
        <button className="mini-action" type="button" disabled={busy} onClick={save}>
          {busy ? "Պահպանում…" : "Պահպանել"}
        </button>
        {status && <span className="action-status">{status}</span>}
      </div>
    </article>
  );
}
