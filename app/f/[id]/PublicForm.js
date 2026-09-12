"use client";

import { useMemo, useRef, useState } from "react";
import FormFields from "../../FormFields.js";
import { validateFieldList } from "../../../lib/schema.js";
import { uploadFormFile } from "../../../lib/uploads.js";

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
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState({});

  // Bot traps. `trap` is a box no person can see; `openedAt` catches a script
  // that fills and fires in well under the time a human needs to read.
  const [trap, setTrap] = useState("");
  const openedAt = useRef(Date.now());

  const pages = useMemo(() => {
    const byPage = new Map();
    for (const f of form.fields) {
      const p = f.page || 1;
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p).push(f);
    }
    return [...byPage.keys()].sort((a, b) => a - b).map((p) => byPage.get(p));
  }, [form.fields]);

  const lastStep = step >= pages.length - 1;
  const current = pages[step] || [];

  function change(id, value) {
    setValues((v) => ({ ...v, [id]: value }));
    setErrors((e) => (e[id] ? { ...e, [id]: undefined } : e));
  }

  // Files go straight to storage as soon as they are picked, and what gets
  // saved with the answer is the path they landed at.
  async function handleFile(id, file) {
    if (!file) {
      setUploading((u) => ({ ...u, [id]: undefined }));
      change(id, "");
      return;
    }
    setUploading((u) => ({ ...u, [id]: "busy" }));
    setErrors((e) => ({ ...e, [id]: undefined }));
    try {
      const path = await uploadFormFile(form.id, file);
      change(id, path);
      setUploading((u) => ({ ...u, [id]: "done" }));
    } catch (err) {
      setUploading((u) => ({ ...u, [id]: undefined }));
      setErrors((e) => ({ ...e, [id]: String(err.message || err) }));
    }
  }

  function focusFirstBad(bad) {
    const field = current.find((f) => bad[f.id]);
    if (field) document.getElementById(field.id)?.focus();
  }

  // Check only the page in front of the person. Nothing is sent yet.
  function next() {
    const { errors: bad, ok } = validateFieldList(current, values, form.id);
    if (!ok) {
      setErrors(bad);
      focusFirstBad(bad);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, pages.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event) {
    event.preventDefault();

    if (!lastStep) {
      next();
      return;
    }

    const { errors: bad, ok } = validateFieldList(current, values, form.id);
    if (!ok) {
      setErrors(bad);
      focusFirstBad(bad);
      return;
    }

    if (Object.values(uploading).includes("busy")) {
      setFailure("Hang on — a file is still uploading.");
      return;
    }

    setBusy(true);
    setFailure("");
    setErrors({});
    try {
      const res = await fetch(`/api/forms/${form.id}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: values,
          website: trap,
          elapsedMs: Date.now() - openedAt.current,
        }),
      });
      const data = await res.json();
      if (res.status === 422 && data.errors) {
        setErrors(data.errors);
        // An error might belong to a page the person has already walked past.
        const badPage = pages.findIndex((p) => p.some((f) => data.errors[f.id]));
        if (badPage >= 0 && badPage !== step) setStep(badPage);
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
        <div className="tick" aria-hidden="true">✓</div>
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

      {pages.length > 1 && (
        <div className="steps" aria-label={`Step ${step + 1} of ${pages.length}`}>
          <div className="steps-bar">
            <span style={{ width: `${((step + 1) / pages.length) * 100}%` }} />
          </div>
          <p className="steps-label">Step {step + 1} of {pages.length}</p>
        </div>
      )}

      {failure && <div className="note bad">{failure}</div>}
      {Object.keys(errors).length > 0 && (
        <div className="note bad">Some answers need a look — see below.</div>
      )}

      <FormFields
        fields={current}
        values={values}
        errors={errors}
        onChange={change}
        onFile={handleFile}
        uploading={uploading}
      />

      {/* Hidden from people, irresistible to scripts. */}
      <div className="trap" aria-hidden="true">
        <label htmlFor="website">Leave this empty</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
        />
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        {step > 0 && (
          <button className="btn" type="button" onClick={back} disabled={busy}>
            Back
          </button>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? <><span className="spin" /> Sending…</> : lastStep ? form.submitLabel : "Next"}
        </button>
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        Fields marked <span className="req" aria-hidden="true">*</span> are required.
      </p>
    </form>
  );
}
