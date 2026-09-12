"use client";

import { useEffect, useRef, useState } from "react";

const SWATCHES = [
  ["", "Default"],
  ["#5b4bf0", "Violet"],
  ["#0d7a52", "Green"],
  ["#c02a22", "Red"],
  ["#0b6bcb", "Blue"],
  ["#b45309", "Amber"],
  ["#be185d", "Pink"],
  ["#3f3f46", "Slate"],
];

// <input type="datetime-local"> wants "2026-09-20T17:00" in the viewer's own
// time zone, but the database hands back UTC. This converts one to the other.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function FormSettings({ form, shareUrl, onSaved }) {
  const [open, setOpen] = useState(form.open);
  const [closesAt, setClosesAt] = useState(toLocalInput(form.closesAt));
  const [maxResponses, setMaxResponses] = useState(
    form.maxResponses == null ? "" : String(form.maxResponses)
  );
  const [thankYou, setThankYou] = useState(form.thankYou || "");
  const [accent, setAccent] = useState(form.accent || "");

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef(null);
  const [qrReady, setQrReady] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!shareUrl || !canvasRef.current) return;
    import("qrcode")
      .then((QR) => {
        if (!alive || !canvasRef.current) return;
        return QR.toCanvas(canvasRef.current, shareUrl, {
          width: 200,
          margin: 1,
          color: { dark: "#16151d", light: "#ffffff" },
        });
      })
      .then(() => alive && setQrReady(true))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shareUrl]);

  function downloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${form.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/forms/${form.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          open,
          closesAt,
          maxResponses,
          thankYou,
          accent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save that.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
      onSaved?.(data.form);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  const limitHit =
    form.maxResponses != null && (form.responseCount ?? 0) >= form.maxResponses;

  return (
    <div className="settings-grid">
      <div className="card">
        <h2 className="card-title">When it closes</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Leave both empty and the form stays open until you close it yourself.
        </p>

        {error && <div className="note bad">{error}</div>}

        <div className="field">
          <label className="label" htmlFor="closesAt">Stop accepting answers on</label>
          <input
            id="closesAt"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
          <p className="hint">
            Date and time, in your own time zone. After this moment nobody can submit.
          </p>
        </div>

        <div className="field">
          <label className="label" htmlFor="maxResponses">Or stop after this many answers</label>
          <input
            id="maxResponses"
            type="number"
            min="1"
            max="100000"
            placeholder="No limit"
            value={maxResponses}
            onChange={(e) => setMaxResponses(e.target.value)}
          />
          {limitHit && <p className="hint">The limit has already been reached.</p>}
        </div>

        <label className="check">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          <span>Accepting answers right now</span>
        </label>

        <button className="btn primary" onClick={save} disabled={busy} style={{ marginTop: 18 }}>
          {busy ? <><span className="spin" /> Saving…</> : saved ? "Saved" : "Save settings"}
        </button>
      </div>

      <div className="card">
        <h2 className="card-title">How it looks and ends</h2>

        <div className="field">
          <label className="label" htmlFor="thankYou">Message after someone submits</label>
          <textarea
            id="thankYou"
            rows={3}
            maxLength={300}
            placeholder="Thanks — your response has been recorded."
            value={thankYou}
            onChange={(e) => setThankYou(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label">Colour of the form</label>
          <div className="swatches">
            {SWATCHES.map(([value, name]) => (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={accent === value}
                className={`swatch${accent === value ? " on" : ""}${value ? "" : " none"}`}
                style={value ? { background: value } : undefined}
                onClick={() => setAccent(value)}
              />
            ))}
          </div>
          <p className="hint">Changes the buttons and highlights on the page people fill in.</p>
        </div>

        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? <><span className="spin" /> Saving…</> : saved ? "Saved" : "Save settings"}
        </button>
      </div>

      <div className="card qr-card">
        <h2 className="card-title">QR code</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Put this on a poster or a slide. Phones open the form straight away.
        </p>
        <canvas ref={canvasRef} className="qr" />
        <button className="btn small" onClick={downloadQr} disabled={!qrReady}>
          Download PNG
        </button>
      </div>
    </div>
  );
}
