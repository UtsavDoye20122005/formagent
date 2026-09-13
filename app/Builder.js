"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FormFields from "./FormFields.js";

const WAVE = [0, 130, 260, 90, 200, 40, 310, 160, 70, 240, 110, 20];

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

function prettyDeadline(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  });
}

// Turns the "starts a new page" flags into real page numbers. The first field
// can never start a page — it is already on page one.
function renumber(fields) {
  let page = 1;
  return fields.map((f, i) => {
    const breakBefore = i > 0 && Boolean(f.breakBefore);
    if (breakBefore) page += 1;
    return { ...f, breakBefore, page };
  });
}

export default function Builder({ workspaces: initialWorkspaces = [], loadError = "", voiceApi = false }) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [workspaceId, setWorkspaceId] = useState("");
  const [newSection, setNewSection] = useState("");
  const [addingSection, setAddingSection] = useState(false);

  const [instructions, setInstructions] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [published, setPublished] = useState(null);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState({});

  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef("");
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    if (voiceApi) {
      // Recording + Whisper is available; the browser's own recogniser is only
      // needed as a fallback, so don't wire it up at all.
      setVoiceSupported(
        typeof window !== "undefined" &&
          Boolean(navigator.mediaDevices?.getUserMedia) &&
          typeof window.MediaRecorder !== "undefined"
      );
      return;
    }
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return;
    setVoiceSupported(true);
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      if (finalText) baseTextRef.current = `${baseTextRef.current}${finalText} `;
      setInstructions((baseTextRef.current + interim).replace(/\s+/g, " ").trimStart());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {}
    };
  }, [voiceApi]);

  // --- recording, then Whisper on the server ------------------------------

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1200) return;

        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "speech.webm");
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (res.status === 401) {
            window.location.href = "/login";
            return;
          }
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not transcribe that.");
          const text = String(data.text || "").trim();
          if (text) {
            setInstructions((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
          } else {
            // Better to say so than to paste in a "Thank you." nobody said.
            setError("Didn't catch anything that time — try again, a bit closer to the mic.");
          }
        } catch (err) {
          setError(String(err.message || err));
        } finally {
          setTranscribing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch {
      setError("Could not use the microphone. Check the browser has permission.");
      setListening(false);
    }
  }

  function toggleMic() {
    if (voiceApi) {
      if (listening) {
        try {
          recorderRef.current?.stop();
        } catch {}
        setListening(false);
      } else {
        startRecording();
      }
      return;
    }

    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
      return;
    }
    baseTextRef.current = instructions ? `${instructions.trim()} ` : "";
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  async function generate() {
    if (listening) toggleMic();
    setBusy(true);
    setError("");
    setNotice("");
    setPublished(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setForm(data.form);
      setNotice(data.notice || "");
      setPreview({});
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          form,
          workspaceId: workspaceId || null,
          closesAt: form.closesAt || "",
        }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not publish.");
      setPublished(`${window.location.origin}/f/${data.id}`);
      setCopied(false);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function addSection() {
    const name = newSection.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add that section.");
      setWorkspaces((w) => [...w, data.workspace]);
      setWorkspaceId(data.workspace.id);
      setNewSection("");
      setAddingSection(false);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  function patchField(index, patch) {
    setForm((f) => {
      const fields = f.fields.map((fl, i) => (i === index ? { ...fl, ...patch } : fl));
      return { ...f, fields };
    });
  }

  function moveField(index, delta) {
    setForm((f) => {
      const fields = [...f.fields];
      const target = index + delta;
      if (target < 0 || target >= fields.length) return f;
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...f, fields: renumber(fields) };
    });
  }

  function removeField(index) {
    setForm((f) => ({ ...f, fields: renumber(f.fields.filter((_, i) => i !== index)) }));
  }

  // A page break lives on the field it sits above. Toggling one re-derives
  // every page number so they stay 1, 2, 3… with no gaps.
  function togglePageBreak(index) {
    setForm((f) => {
      const fields = f.fields.map((field, i) =>
        i === index ? { ...field, breakBefore: !field.breakBefore } : field
      );
      return { ...f, fields: renumber(fields) };
    });
  }

  const pageCount = useMemo(
    () => (form ? Math.max(1, ...form.fields.map((f) => f.page || 1)) : 1),
    [form]
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(published);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  }

  return (
    <>
      <h1>Describe a form. Share the link.</h1>
      <p className="lede">
        Speak or type what you need to collect. JiffyThat writes the questions, gives you a
        link anyone can open, and keeps every answer in one place.
      </p>

      {loadError && <div className="note bad">{loadError}</div>}

      <div className={`compose${listening ? " listening" : ""}`}>
        <label className="label" htmlFor="instructions" style={{ position: "absolute", left: -9999 }}>
          What should this form collect?
        </label>
        <textarea
          id="instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Registration for our AI workshop — name, college email, phone, year of study, and which track they want: Beginner, Intermediate or Advanced."
        />

        <div className="compose-bar">
          {voiceSupported && (
            <button
              className={`btn mic${listening ? " on" : ""}`}
              onClick={toggleMic}
              disabled={busy || transcribing}
              aria-pressed={listening}
            >
              <span className="bead" aria-hidden="true">
                {transcribing ? <span className="spin" /> : listening ? "\u25A0" : "\u25CF"}
              </span>
              {transcribing ? "Writing it down…" : listening ? "Stop" : "Speak"}
              {listening && (
                <span className="wave small" aria-hidden="true">
                  {WAVE.map((d, i) => (
                    <i key={i} style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
              )}
            </button>
          )}

          {instructions && (
            <button className="btn ghost small" onClick={() => setInstructions("")}>
              Clear
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button
            className="btn primary"
            onClick={generate}
            disabled={busy || instructions.trim().length < 3}
          >
            {busy ? <><span className="spin" /> Working…</> : "Build the form →"}
          </button>
        </div>



      </div>

      {listening && (
        <p className="hint" style={{ marginTop: 12 }}>
          {voiceApi
            ? "Recording — say it however you like, then press Stop."
            : "Listening… speak naturally, then press Stop."}
        </p>
      )}
      {!voiceSupported && (
        <p className="hint" style={{ marginTop: 12 }}>
          Voice needs a browser with microphone support. Typing works everywhere.
        </p>
      )}

      {error && <div className="note bad" style={{ marginTop: 18 }}>{error}</div>}

      {form && (
        <>
          <div className="card">
            <h2 style={{ marginBottom: 16 }}>Check it over</h2>

            {notice && <div className="note info">{notice}</div>}

            <div className="field">
              <label className="label" htmlFor="f-title">Form title</label>
              <input
                id="f-title"
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="f-desc">Description shown to people (optional)</label>
              <input
                id="f-desc"
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {form.closesAt && (
              <div className="note info deadline-note">
                <span>
                  Heard a deadline — this form will stop accepting answers on{" "}
                  <strong>{prettyDeadline(form.closesAt)}</strong>.
                </span>
                <button
                  className="btn small ghost"
                  type="button"
                  onClick={() => setForm({ ...form, closesAt: "" })}
                >
                  Remove
                </button>
              </div>
            )}

            <h2 style={{ marginTop: 22, marginBottom: 10 }}>
              Questions <span className="tag">{form.fields.length}</span>
              {pageCount > 1 && <span className="tag">{pageCount} pages</span>}
            </h2>

            {form.fields.map((f, i) => (
              <div className="preview-field" key={`${f.id}-${i}`}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    value={f.label}
                    onChange={(e) => patchField(i, { label: e.target.value })}
                    style={{ fontWeight: 560 }}
                  />
                  <div className="row" style={{ marginTop: 8, gap: 8 }}>
                    <select
                      value={f.type}
                      onChange={(e) => patchField(i, { type: e.target.value })}
                      style={{ width: "auto", padding: "5px 9px", fontSize: 13 }}
                      aria-label={`Type for ${f.label}`}
                    >
                      {TYPES.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <label className="tag" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => patchField(i, { required: e.target.checked })}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      Required
                    </label>
                    {i > 0 && (
                      <button
                        type="button"
                        className={`tag pager${f.breakBefore ? " on" : ""}`}
                        onClick={() => togglePageBreak(i)}
                        title="Start a new page at this question"
                      >
                        {f.breakBefore ? "Starts page " + (f.page || 1) : "Break page here"}
                      </button>
                    )}
                  </div>
                  {f.options?.length > 0 && (
                    <p className="meta">Options: {f.options.join(" · ")}</p>
                  )}
                </div>
                <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  <button className="btn ghost small" onClick={() => moveField(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="btn ghost small" onClick={() => moveField(i, 1)} disabled={i === form.fields.length - 1} aria-label="Move down">↓</button>
                  <button className="btn ghost small" onClick={() => removeField(i)} aria-label={`Remove ${f.label}`}>✕</button>
                </div>
              </div>
            ))}

            <div className="publish-bar">
              <div className="section-pick">
                <label className="label" htmlFor="workspace">Save into</label>
                {addingSection ? (
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <input
                      type="text"
                      value={newSection}
                      autoFocus
                      placeholder="e.g. College"
                      maxLength={60}
                      onChange={(e) => setNewSection(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addSection(); }
                        if (e.key === "Escape") { setAddingSection(false); setNewSection(""); }
                      }}
                    />
                    <button className="btn small primary" onClick={addSection} disabled={busy || !newSection.trim()}>
                      Add
                    </button>
                    <button
                      className="btn small ghost"
                      onClick={() => { setAddingSection(false); setNewSection(""); }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <select
                      id="workspace"
                      value={workspaceId}
                      onChange={(e) => setWorkspaceId(e.target.value)}
                    >
                      <option value="">Unfiled</option>
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                    <button className="btn small" onClick={() => setAddingSection(true)} type="button">
                      + New section
                    </button>
                  </div>
                )}
              </div>

              <div className="row" style={{ flexWrap: "nowrap" }}>
                <button className="btn" onClick={generate} disabled={busy}>Rebuild</button>
                <button className="btn primary" onClick={publish} disabled={busy || form.fields.length === 0}>
                  {busy ? <><span className="spin" /> Publishing…</> : "Publish & get link"}
                </button>
              </div>
            </div>
          </div>

          {published && (
            <div className="card">
              <div className="note good" style={{ marginBottom: 14 }}>
                Your form is live. Anyone with this link can fill it in — no account needed.
              </div>
              <div className="linkbox">
                <code>{published}</code>
                <button className="btn small primary" onClick={copyLink}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <a className="btn small" href={published} target="_blank" rel="noreferrer">Open the form</a>
                <a className="btn small" href="/dashboard">See responses</a>
              </div>
            </div>
          )}

          <div className="card">
            <h2 style={{ marginBottom: 14 }}>Preview</h2>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
              <h2 style={{ fontSize: 22 }}>{form.title}</h2>
              {form.description && <p className="lede" style={{ marginBottom: 20 }}>{form.description}</p>}
              <FormFields
                fields={form.fields}
                values={preview}
                onChange={(id, v) => setPreview((p) => ({ ...p, [id]: v }))}
              />
              <button className="btn primary" style={{ marginTop: 8 }} disabled>
                {form.submitLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
