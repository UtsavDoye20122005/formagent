"use client";

import { useEffect, useRef, useState } from "react";
import { uploadLogo } from "../../../lib/uploads.js";
import { supabaseBrowser } from "../../../lib/supabase/browser.js";
import { localToInstant, instantToLocalInput } from "../../../lib/schema.js";

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

export default function FormSettings({ form, shareUrl, onSaved }) {
  const [open, setOpen] = useState(form.open);
  const [closesAt, setClosesAt] = useState(instantToLocalInput(form.closesAt));
  const [thankYou, setThankYou] = useState(form.thankYou || "");
  const [accent, setAccent] = useState(form.accent || "");
  const [logoUrl, setLogoUrl] = useState(form.logoUrl || "");
  const [logoBusy, setLogoBusy] = useState(false);

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

  async function pickLogo(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoBusy(true);
    setError("");
    try {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) throw new Error("Sign in again to upload a logo.");
      setLogoUrl(await uploadLogo(userId, file));
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLogoBusy(false);
      event.target.value = "";
    }
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
          // The picker gives a bare wall-clock time. Pin it to this browser's
          // zone before sending, or the server reads it as UTC.
          closesAt: closesAt ? localToInstant(closesAt) : "",
          thankYou,
          accent,
          logoUrl,
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

  return (
    <div className="settings-grid">
      <div className="card">
        <h2 className="card-title">When it closes</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Leave this empty and the form stays open until you close it yourself.
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
          <label className="label" htmlFor="logo">Logo at the top of the form</label>
          {logoUrl && (
            <div className="logo-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="logo-preview" />
              <button
                className="btn small ghost"
                type="button"
                onClick={() => setLogoUrl("")}
                disabled={logoBusy}
              >
                Remove
              </button>
            </div>
          )}
          <input
            id="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={logoBusy}
            onChange={pickLogo}
          />
          <p className="hint">
            {logoBusy ? "Uploading…" : "PNG, JPG, WEBP or SVG, up to 2 MB. Press Save after."}
          </p>
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
