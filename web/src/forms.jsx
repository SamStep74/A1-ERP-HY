import React, { useState } from "react";

export function FormCreateForm({ onCreate, actionState }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const busy = actionState === "form:create";
  function submit() {
    if (title.trim().length < 3) return;
    // Default lead-capture field set; can be edited server-side later.
    onCreate({
      title: title.trim(),
      description: description.trim(),
      status: "draft",
      fields: [
        { key: "companyName", label: "Ընկերություն", type: "text", required: true },
        { key: "contactName", label: "Կոնտակտային անձ", type: "text", required: true },
        { key: "email", label: "Էլ. փոստ", type: "email", required: true },
        { key: "phone", label: "Հեռախոս", type: "tel", required: true },
        { key: "interest", label: "Հետաքրքրությունը", type: "textarea", required: true }
      ]
    });
    setTitle(""); setDescription("");
  }
  return (
    <article className="panel form-create-panel">
      <div className="panel-head"><div><span className="section-label">A1 Forms</span><h2>New lead form</h2></div></div>
      <div className="inline-form">
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Ձևի վերնագիր" />
        <input value={description} onChange={event => setDescription(event.target.value)} placeholder="Նկարագրություն" />
        <button className="mini-action" type="button" disabled={busy} onClick={submit}>{busy ? "Saving" : "Create form"}</button>
      </div>
    </article>
  );
}

export function FormsRegistryPanel({ data, canWrite, onPublishToggle, actionState }) {
  const forms = (data && data.forms) || [];
  const publishedCount = forms.filter(f => f.status === "published").length;
  return (
    <article className="panel forms-registry-panel">
      <div className="panel-head">
        <div><span className="section-label">A1 Forms</span><h2>Lead forms</h2></div>
        <strong className="aging-badge">{publishedCount} published</strong>
      </div>
      <div className="rows">
        {forms.map(form => {
          const busy = actionState === `form:act:${form.id}`;
          const publicPath = form.status === "published" ? `/api/forms/${form.id}/submit` : null;
          return (
            <div className="row" key={form.id}>
              <span>
                {form.title} · <strong>{form.status}</strong> · {form.submissionCount} submissions
                {publicPath && <span style={{ opacity: 0.7 }}> · POST {publicPath}</span>}
              </span>
              {canWrite && onPublishToggle && (
                <button className="mini-action" type="button" disabled={busy} onClick={() => onPublishToggle(form.id, form.status === "published" ? "draft" : "published")}>
                  {busy ? "…" : form.status === "published" ? "Unpublish" : "Publish"}
                </button>
              )}
            </div>
          );
        })}
        {forms.length === 0 && <div className="row"><span>No forms yet</span></div>}
      </div>
    </article>
  );
}
