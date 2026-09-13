"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FormFields from "../../FormFields.js";
import { validateFieldList } from "../../../lib/schema.js";
import { uploadFormFile } from "../../../lib/uploads.js";

// A half-filled form is somebody's work. Phones ring, tabs get closed, a lab
// machine logs you out — none of that should cost twenty answers. The draft
// lives only in this browser, is never sent anywhere, and is thrown away the
// moment the form is submitted.
const DRAFT_VERSION = 1;
const draftKey = (formId) => `jiffythat.draft.${formId}`;

function readDraft(formId, fields) {
  try {
    const raw = window.localStorage.getItem(draftKey(formId));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || saved.v !== DRAFT_VERSION || !saved.values) return null;

    // The teacher may have edited the form since. Keep only answers that still
    // belong to a question that exists, and still fit the kind it is now.
    const kept = {};
    let count = 0;
    for (const f of fields) {
      const value = saved.values[f.id];
      if (value === undefined) continue;
      if (f.type === "checkbox") {
        if (!Array.isArray(value)) continue;
        const picked = value.filter((v) => f.options?.includes(v));
        if (picked.length) { kept[f.id] = picked; count++; }
      } else if (typeof value === "boolean") {
        if (f.type !== "boolean") continue;
        kept[f.id] = value; count++;
      } else if (typeof value === "string" && value !== "") {
        if (f.type === "checkbox") continue;
        kept[f.id] = value; count++;
      }
    }
    return count ? { values: kept, step: Number(saved.step) || 0, at: saved.at } : null;
  } catch {
    return null; // private window, storage full, storage blocked — never fatal
  }
}

function writeDraft(formId, values, step) {
  try {
    window.localStorage.setItem(
      draftKey(formId),
      JSON.stringify({ v: DRAFT_VERSION, values, step, at: Date.now() })
    );
  } catch {
    /* out of space or blocked — the form still works, it just won't remember */
  }
}

function clearDraft(formId) {
  try {
    window.localStorage.removeItem(draftKey(formId));
  } catch {
    /* nothing to do */
  }
}

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
  const [restored, setRestored] = useState(false);

  // Sending is guarded by a ref, not by `busy`. A double-click can land two
  // clicks before React has re-rendered the disabled button, and that would
  // register the same student twice.
  const sending = useRef(false);

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

  // Somebody starting a twenty-question form ten minutes before it shuts
  // deserves to be told now, not after they have typed the whole thing.
  const closingSoon = useMemo(() => {
    if (!form.closesAt) return false;
    const left = new Date(form.closesAt).getTime() - Date.now();
    return left > 0 && left < 45 * 60 * 1000;
  }, [form.closesAt]);

  const lastStep = step >= pages.length - 1;
  // Roughly eight seconds a question, rounded up. People deserve to know.
  const minutes = Math.max(1, Math.round((form.fields.length * 8) / 60));
  const current = pages[step] || [];

  // Bring back whatever they had typed last time. Done in an effect rather
  // than in useState so the server and the browser render the same first pass.
  useEffect(() => {
    const draft = readDraft(form.id, form.fields);
    if (!draft) return;
    setValues((v) => ({ ...v, ...draft.values }));
    setStep(Math.min(draft.step, Math.max(0, pages.length - 1)));
    setRestored(true);
  }, [form.id, form.fields, pages.length]);

  // Keep the draft current, but not on every keystroke.
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => writeDraft(form.id, values, step), 400);
    return () => clearTimeout(t);
  }, [form.id, values, step, done]);

  function startOver() {
    clearDraft(form.id);
    const blank = {};
    for (const f of form.fields) blank[f.id] = f.type === "checkbox" ? [] : "";
    setValues(blank);
    setErrors({});
    setStep(0);
    setRestored(false);
  }

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

    if (sending.current) return; // a second click while the first is in flight
    sending.current = true;

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

      // Only now is it safe to forget what they typed.
      clearDraft(form.id);
      setDone(true);
    } catch (err) {
      // The form may have closed while they were filling it in, or the network
      // may have dropped. Either way their answers stay on screen and in the
      // draft — nothing they wrote is thrown away because the send failed.
      setFailure(String(err.message || err));
    } finally {
      sending.current = false;
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
    <form className="form-card" onSubmit={submit} noValidate>
      <header className="form-band">
        {form.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="form-logo" src={form.logoUrl} alt="" />
        )}

        <h1>{form.title}</h1>
        {form.description && <p className="lede">{form.description}</p>}

        <div className="form-chips">
          {deadlineLine(form.closesAt) && (
            <span className="deadline">Closes {deadlineLine(form.closesAt)}</span>
          )}
          <span className="tag">{minutes} minute{minutes === 1 ? "" : "s"}</span>
        </div>
      </header>

      {pages.length > 1 && (
        <div className="steps" aria-label={`Step ${step + 1} of ${pages.length}`}>
          <div className="steps-bar">
            <span style={{ width: `${((step + 1) / pages.length) * 100}%` }} />
          </div>
          <p className="steps-label">Step {step + 1} of {pages.length}</p>
        </div>
      )}

      <div className="form-body">
        {restored && !failure && (
          <div className="note info draft-note">
            <span>We kept what you had already typed.</span>
            <button className="btn small ghost" type="button" onClick={startOver}>
              Start fresh
            </button>
          </div>
        )}

        {closingSoon && (
          <div className="note warn">
            This form closes {deadlineLine(form.closesAt)} — finish before then or
            your answers will not be accepted.
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
      </div>

      <footer className="form-actions">
        <p className="hint">
          Questions marked <span className="req" aria-hidden="true">*</span> are required
        </p>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          {step > 0 && (
            <button className="btn" type="button" onClick={back} disabled={busy}>
              Back
            </button>
          )}
          <button className="btn primary big" type="submit" disabled={busy}>
            {busy ? <><span className="spin" /> Sending…</> : lastStep ? form.submitLabel : "Continue →"}
          </button>
        </div>
      </footer>
    </form>
  );
}
