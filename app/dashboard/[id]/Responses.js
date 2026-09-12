"use client";

import { useCallback, useEffect, useState } from "react";
import FormSettings from "./FormSettings.js";
import Summary from "./Summary.js";
import { signedFileUrl } from "../../../lib/uploads.js";

const PAGE_SIZE = 25;

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

// Files live in a private bucket, so there is no permanent URL to put in a
// table. The link is minted when the owner asks for it and expires on its own.
function FileCell({ path }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    const url = await signedFileUrl(path);
    setBusy(false);
    if (url) window.open(url, "_blank", "noopener");
  }

  if (!path) return null;
  return (
    <button className="btn small ghost" onClick={open} disabled={busy}>
      {busy ? "Opening…" : String(path).split("/").pop()}
    </button>
  );
}


// The last seven days of activity, for the little column chart. Built from the
// page we already have rather than another round trip.
function weekOf(responses) {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({
      i: 6 - i,
      key: d.toDateString(),
      label: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()],
      count: 0,
    });
  }
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const r of responses) {
    const k = new Date(r.submittedAt).toDateString();
    const hit = byKey.get(k);
    if (hit) hit.count += 1;
  }
  return days;
}

export default function Responses({ formId }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState("table");
  const [everything, setEverything] = useState(null); // all rows, fetched on demand
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(
        `/api/forms/${formId}/responses?page=${page}&size=${PAGE_SIZE}`,
        { cache: "no-store" }
      );
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
  }, [formId, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Every row, for the charts and for exporting. Fetched once, then reused.
  const fetchAll = useCallback(async () => {
    if (everything) return everything;
    setWorking(true);
    try {
      const res = await fetch(`/api/forms/${formId}/responses?all=1`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Could not load responses.");
      setEverything(payload);
      return payload;
    } catch (err) {
      setError(String(err.message || err));
      return null;
    } finally {
      setWorking(false);
    }
  }, [everything, formId]);

  if (error) return <div className="note bad">{error}</div>;
  if (!data) return <p className="empty">Loading…</p>;

  const { form, responses, total } = data;
  const pageCount = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const { header } = buildRows(form, responses);

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/f/${form.id}` : "";

  function statusLine() {
    if (!form.open) return "closed";
    if (form.closesAt) {
      const when = new Date(form.closesAt);
      if (when.getTime() > Date.now()) {
        return `closes ${when.toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          hour: "numeric",
          minute: "2-digit",
        })}`;
      }
      return "deadline passed";
    }
    return "";
  }

  const week = weekOf(everything?.responses || responses);
  const weekTop = Math.max(1, ...week.map((d) => d.count));
  const todayCount = week[week.length - 1]?.count || 0;

  function applySaved(updated) {
    setData((d) => (d ? { ...d, form: { ...d.form, ...updated } } : d));
  }

  async function showSummary() {
    setView("summary");
    await fetchAll();
  }

  function refresh() {
    setEverything(null);
    load();
  }

  async function downloadCsv() {
    const all = await fetchAll();
    if (!all) return;
    const built = buildRows(all.form, all.responses);
    const blob = new Blob([`﻿${toCsv(built.header, built.rows)}`], {
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
    const all = await fetchAll();
    if (!all) return;
    const built = buildRows(all.form, all.responses);
    try {
      await navigator.clipboard.writeText(toTsv(built.header, built.rows));
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      setError("Clipboard blocked by the browser — use Download CSV instead.");
    }
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 22 }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>{form.title}</h1>
          <div className="row">
            <span className={`tag ${form.open ? "good" : ""}`}>
              {form.open ? "Open" : "Closed"}
            </span>
            {statusLine() && <span className="hint" style={{ margin: 0 }}>{statusLine()}</span>}
          </div>
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button className="btn small" onClick={refresh}>Refresh</button>
          <button className="btn small" onClick={copyForSheets} disabled={total === 0 || working}>
            {copied ? "Copied — paste into Sheets" : "Copy for Sheets"}
          </button>
          <button className="btn small primary" onClick={downloadCsv} disabled={total === 0 || working}>
            Download CSV
          </button>
        </div>
      </div>

      <div className="bento">
        <div className="card">
          <div className="spread" style={{ marginBottom: 10 }}>
            <span className="label" style={{ margin: 0 }}>Responses</span>
            {todayCount > 0 && <span className="tag good">↑ {todayCount} today</span>}
          </div>
          <p className="stat-big">{total}</p>
          <div className="spark" aria-hidden="true">
            {week.map((d) => (
              <div key={d.key}>
                <i
                  style={{
                    height: `${Math.round((d.count / weekTop) * 88) + 8}px`,
                    animationDelay: `${d.i * 45}ms`,
                  }}
                  title={`${d.count} on ${d.key}`}
                />
                <small>{d.label}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <span className="label">Share link</span>
          <div className="linkbox">
            <code>{shareUrl}</code>
            <button className="btn small" onClick={() => navigator.clipboard?.writeText(shareUrl)}>
              Copy
            </button>
          </div>
          <p className="hint">
            Press <strong>Copy for Sheets</strong>, open a blank sheet, click A1 and paste.
            Every column lands in place.
          </p>
        </div>
      </div>

      <FormSettings form={form} shareUrl={shareUrl} onSaved={applySaved} />

      {total > 0 && (
        <div className="spread" style={{ marginBottom: 12 }}>
          <div className="view-tabs">
            <button
              className={`btn small${view === "summary" ? " on" : ""}`}
              onClick={showSummary}
            >
              Summary
            </button>
            <button
              className={`btn small${view === "table" ? " on" : ""}`}
              onClick={() => setView("table")}
            >
              Every answer
            </button>
          </div>
          {view === "table" && pageCount > 1 && (
            <p className="hint" style={{ margin: 0 }}>
              Page {page} of {pageCount}
            </p>
          )}
        </div>
      )}

      {view === "summary" ? (
        working && !everything ? (
          <p className="empty">Working it out…</p>
        ) : (
          <Summary form={form} responses={everything?.responses || []} />
        )
      ) : (
        <>
          <div className="card">
            {total === 0 ? (
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
                    {responses.map((r) => (
                      <tr key={r.id}>
                        <td>{stamp(r.submittedAt)}</td>
                        {form.fields.map((f) => {
                          const raw = r.answers?.[f.id];
                          if (f.type === "file") {
                            return (
                              <td key={f.id}>
                                <FileCell path={raw} />
                              </td>
                            );
                          }
                          const text = cellText(raw);
                          return (
                            <td key={f.id} className={text.length > 40 ? "wrap" : undefined}>
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {pageCount > 1 && (
            <div className="pager-row">
              <button
                className="btn small"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ← Newer page
              </button>
              <span className="hint">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <button
                className="btn small"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
              >
                Older page →
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
