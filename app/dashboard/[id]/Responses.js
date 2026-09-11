"use client";

import { useCallback, useEffect, useState } from "react";

function cellText(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Yes";
  if (value === false) return "No";
  return value == null ? "" : String(value);
}

function stamp(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildRows(form, responses) {
  const header = ["Submitted at", ...form.fields.map((f) => f.label)];
  const rows = responses.map((r) => [
    stamp(r.submittedAt),
    ...form.fields.map((f) => cellText(r.answers?.[f.id])),
  ]);
  return { header, rows };
}

function toCsv(header, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

function toTsv(header, rows) {
  const clean = (v) => String(v ?? "").replace(/[\t\n\r]+/g, " ");
  return [header, ...rows].map((r) => r.map(clean).join("\t")).join("\n");
}

export default function Responses({ formId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/forms/${formId}/responses`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Could not load responses.");
      setData(payload);
    } catch (err) {
      setError(String(err.message || err));
    }
  }, [formId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="note bad">{error}</div>;
  if (!data) return <p className="empty">Loading…</p>;

  const { form, responses } = data;
  const { header, rows } = buildRows(form, responses);

  function downloadCsv() {
    const blob = new Blob([`﻿${toCsv(header, rows)}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyForSheets() {
    try {
      await navigator.clipboard.writeText(toTsv(header, rows));
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      setError("Clipboard blocked by the browser — use Download CSV instead.");
    }
  }

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/f/${form.id}` : "";

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{form.title}</h1>
          <p className="hint" style={{ margin: 0 }}>
            {responses.length} response{responses.length === 1 ? "" : "s"}
            {!form.open && " · form is closed"}
          </p>
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button className="btn small" onClick={load}>Refresh</button>
          <button className="btn small" onClick={copyForSheets} disabled={rows.length === 0}>
            {copied ? "Copied — paste into Sheets" : "Copy for Google Sheets"}
          </button>
          <button className="btn small primary" onClick={downloadCsv} disabled={rows.length === 0}>
            Download CSV
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <label className="label">Share link</label>
        <div className="linkbox">
          <code>{shareUrl}</code>
          <button className="btn small" onClick={() => navigator.clipboard?.writeText(shareUrl)}>
            Copy
          </button>
        </div>
        <p className="hint">
          To get these answers into Google Sheets: press <strong>Copy for Google Sheets</strong>,
          open a blank sheet, click cell A1 and paste. Every column lands in place.
        </p>
      </div>

      <div className="card">
        {responses.length === 0 ? (
          <div className="empty">
            <p style={{ margin: 0 }}>No responses yet. Share the link above.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {header.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className={c.length > 40 ? "wrap" : undefined}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
