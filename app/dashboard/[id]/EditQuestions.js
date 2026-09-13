"use client";

import { useState } from "react";
import { mergeFields } from "../../../lib/schema.js";

// Fixing a typo after the link has gone out. Collapsed by default, because most
// visits to this page are to read answers, not to change the form.

const TYPES = [
  ["text", "Short text"],
  ["textarea", "Long text"],
  ["email", "Email"],
  ["tel", "Phone"],
  ["number", "Number"],
  ["url", "Link"],
  ["date", "Date"],
  ["time", "Time"],
  ["select", "Dropdown"],
  ["radio", "Pick one"],
  ["checkbox", "Pick many"],
  ["boolean", "Yes / no"],
  ["rating", "Rating"],
  ["file", "File upload"],
];

const DRIVE_HELP =
  "Upload it to Google Drive, then paste the link here. Set sharing to " +
  "“anyone with the link can view” or nobody will be able to open it.";

export default function EditQuestions({ form, responseCount, onSaved }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(() => JSON.parse(JSON.stringify(form.fields || [])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Counted straight from the rows, not from the cached counter on the form,
  // so the editor can never think a form is empty when it is not.
  const count = Number.isFinite(responseCount) ? responseCount : (form.responseCount || 0);
  const live = count > 0;

  function patch(i, change) {
    setFields((list) => list.map((f, n) => (n === i ? { ...f, ...change } : f)));
    setError("");
    setSaved(false);
  }

  function move(i, delta) {
    const to = i + delta;
    if (to < 0 || to >= fields.length) return;
    const next = [...fields];
    [next[i], next[to]] = [next[to], next[i]];
    setFields(next);
    setError("");
  }

  function remove(i) {
    setFields((list) => list.filter((_, n) => n !== i));
    setError("");
  }

  function add() {
    setFields((list) => [
      ...list,
      { label: "New question", type: "text", required: false, options: [], help: "", placeholder: "" },
    ]);
  }

  function reset() {
    setFields(JSON.parse(JSON.stringify(form.fields || [])));
    setError("");
    setSaved(false);
  }

  // Turn a file upload into a Drive link. Only offered before anyone has
  // answered, because it changes the kind of question.
  function toDriveLink(i) {
    patch(i, { type: "url", help: DRIVE_HELP, placeholder: "https://drive.google.com/..." });
  }

  async function save() {
    // Check with the same rules the server uses, so the reason comes back
    // instantly instead of after a round trip.
    const { error: refusal } = mergeFields(form.fields, fields, live);
    if (refusal) {
      setError(refusal);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/forms/${form.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the questions.");
      setFields(JSON.parse(JSON.stringify(data.form.fields)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
      onSaved?.(data.form);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="card edit-shut">
        <div className="spread">
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>Questions</h2>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              {form.fields.length} question{form.fields.length === 1 ? "" : "s"}
              {live && " · answers have already come in"}
            </p>
          </div>
          <button className="btn small" onClick={() => setOpen(true)}>Edit questions</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: 12 }}>
        <h2 className="card-title" style={{ margin: 0 }}>Questions</h2>
        <button className="btn small ghost" onClick={() => { reset(); setOpen(false); }}>Close</button>
      </div>

      {live && (
        <div className="note info" style={{ marginBottom: 14 }}>
          {count} answer{count === 1 ? " has" : "s have"} already come in.
          You can fix wording, change what is required, reorder, and add questions or options.
          Deleting a question, changing its kind, or removing an option would throw away
          what people wrote, so those are held back.
        </div>
      )}

      {error && <div className="note bad">{error}</div>}

      {fields.map((f, i) => {
        const isOld = Boolean(f.id) && form.fields.some((o) => o.id === f.id);
        const locked = live && isOld;
        return (
          <div className="preview-field editing" key={f.id || `new-${i}`}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="text"
                value={f.label}
                aria-label={`Wording for question ${i + 1}`}
                onChange={(e) => patch(i, { label: e.target.value })}
                style={{ fontWeight: 560 }}
              />

              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                <select
                  value={f.type}
                  disabled={locked}
                  title={locked ? "This cannot change once answers have come in" : undefined}
                  onChange={(e) => patch(i, { type: e.target.value })}
                  style={{ width: "auto", padding: "5px 9px", fontSize: 13 }}
                  aria-label={`Kind of question ${i + 1}`}
                >
                  {TYPES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>

                <label className="tag" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(f.required)}
                    onChange={(e) => patch(i, { required: e.target.checked })}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  Required
                </label>

                {i > 0 && (
                  <button
                    type="button"
                    className={`tag pager${f.breakBefore ? " on" : ""}`}
                    onClick={() => patch(i, { breakBefore: !f.breakBefore })}
                    title="Start a new page at this question"
                  >
                    {f.breakBefore ? "Starts a page" : "Break page here"}
                  </button>
                )}

                {f.type === "file" && !locked && (
                  <button type="button" className="tag pager" onClick={() => toDriveLink(i)}>
                    Ask for a Drive link instead
                  </button>
                )}
              </div>

              <input
                type="text"
                className="q-sub"
                value={f.help || ""}
                placeholder="Help text under the question (optional)"
                aria-label={`Help text for question ${i + 1}`}
                onChange={(e) => patch(i, { help: e.target.value })}
              />

              {["select", "radio", "checkbox"].includes(f.type) && (
                <>
                  <input
                    type="text"
                    className="q-sub"
                    value={(f.options || []).join(", ")}
                    placeholder="Options, separated by commas"
                    aria-label={`Options for question ${i + 1}`}
                    onChange={(e) =>
                      patch(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                    }
                  />
                  {locked && (
                    <p className="hint" style={{ marginTop: 6 }}>
                      You can add options. Removing one somebody already chose is held back.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
              <button className="btn ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button className="btn ghost small" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Move down">↓</button>
              <button
                className="btn ghost small"
                onClick={() => remove(i)}
                disabled={locked}
                title={locked ? "This has answers under it and cannot be removed" : undefined}
                aria-label={`Remove ${f.label}`}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn small" onClick={add}>+ Add a question</button>
        <button className="btn small ghost" onClick={reset} disabled={busy}>Undo my changes</button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? <><span className="spin" /> Saving…</> : saved ? "Saved" : "Save questions"}
        </button>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Anyone who already has the link sees the change straight away. Answers
        already collected stay exactly as they are.
      </p>
    </div>
  );
}
