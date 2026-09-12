"use client";

import { useState } from "react";
import FormFields from "../../FormFields.js";

function deadlineLine(iso) {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return "";
  return when.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PublicForm({ form }) {
  const [values, setValues] = useState(() => {
    const init = {};
    for (const f of form.fields) {
      if (f.type === "checkbox") init[f.id] = [];
      else if (f.type === "boolean") init[f.id] = false;
      else init[f.id] = "";
    }
    return init;
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState("");

  function change(id, value) {
    setValues((v) => ({ ...v, [id]: value }));
    setErrors((e) => (e[id] ? { ...e, [id]: undefined } : e));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFailure("");
    setErrors({});
    try {
      const res = await fetch(`/api/forms/${form.id}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers: values }),
      });
      const data = await res.json();
      if (res.status === 422 && data.errors) {
        setErrors(data.errors);
        const firstBad = form.fields.find((f) => data.errors[f.id]);
        if (firstBad) document.getElementById(firstBad.id)?.focus();
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not send your response.");
      setDone(true);
    } catch (err) {
      setFailure(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card" style={{ marginTop: 40, textAlign: "center" }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: "var(--good-soft)",
            color: "var(--good)",
            display: "grid",
            placeItems: "center",
            margin: "0 auto 14px",
            fontSize: 24,
          }}
          aria-hidden="true"
        >
          ✓
        </div>
        <h1 style={{ fontSize: 21 }}>{form.title}</h1>
        <p className="lede" style={{ margin: "0 auto" }}>{form.thankYou}</p>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginTop: 32 }} noValidate>
      {form.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="form-logo" src={form.logoUrl} alt="" />
      )}

      <h1 style={{ fontSize: 24 }}>{form.title}</h1>
      {form.description && <p className="lede" style={{ marginBottom: 24 }}>{form.description}</p>}
      {!form.description && <div style={{ height: 12 }} />}

      {deadlineLine(form.closesAt) && (
        <p className="deadline">Closes {deadlineLine(form.closesAt)}</p>
      )}

      {failure && <div className="note bad">{failure}</div>}
      {Object.keys(errors).length > 0 && (
        <div className="note bad">Some answers need a look — see below.</div>
      )}

      <FormFields fields={form.fields} values={values} errors={errors} onChange={change} />

      <button className="btn primary" type="submit" disabled={busy} style={{ marginTop: 10 }}>
        {busy ? <><span className="spin" /> Sending…</> : form.submitLabel}
      </button>
      <p className="hint" style={{ marginTop: 12 }}>
        Fields marked <span className="req" aria-hidden="true">*</span> are required.
      </p>
    </form>
  );
}
