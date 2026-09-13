"use client";

import { useCallback, useEffect, useState } from "react";
import FormSettings from "./FormSettings.js";
import Summary from "./Summary.js";
import { signedFileUrl } from "../../../lib/uploads.js";
import OneResponse from "./OneResponse.js";

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

// Excel and Google Sheets run a cell that begins with = + - or @ as a formula
// the moment the file is opened. A student who types =1+1 as their name is
// harmless; one who types a formula that calls out to a web address is not.
// A leading apostrophe tells both programs "this is text", and it does not
// show up in the cell.
function defuse(v) {
  const s = String(v ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function toCsv(header, rows) {
  const esc = (v) => {
    const s = defuse(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

function toTsv(header, rows) {
  const clean = (v) => defuse(v).replace(/[\t\n\r]+/g, " ");
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


// Search looks at every answer plus the timestamp, so "aarav", "2nd year" and
// "13 Sep" all find the same row. Plain substring matching — anything cleverer
// would surprise people.
function filterRows(form, rows, query) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    if (stamp(r.submittedAt).toLowerCase().includes(q)) return true;
    return form.fields.some((f) => cellText(r.answers?.[f.id]).toLowerCase().includes(q));
  });
}

function sortRows(form, rows, sort) {
  if (!sort) return rows;
  const field = sort.key === "__when" ? null : form.fields.find((f) => f.id === sort.key);
  const dir = sort.dir === "desc" ? -1 : 1;

  return [...rows].sort((a, b) => {
    if (!field) return (new Date(a.submittedAt) - new Date(b.submittedAt)) * dir;

    const av = a.answers?.[field.id];
    const bv = b.answers?.[field.id];

    // Numbers and ratings sort as numbers, or 7 lands between 69 and 8.
    if (field.type === "number" || field.type === "rating") {
      // Number(null) and Number("") are both 0, which would rank someone who
      // skipped the question below someone who genuinely scored 1.
      const num = (v) =>
        v === null || v === undefined || String(v).trim() === "" ? NaN : Number(v);
      const an = num(av), bn = num(bv);
      const aok = Number.isFinite(an), bok = Number.isFinite(bn);
      if (aok && bok) return (an - bn) * dir;
      if (aok !== bok) return aok ? -1 : 1; // blanks stay at the bottom either way
      return 0;
    }

    // Blanks always sit at the bottom, whichever way the column is pointing.
    const at = cellText(av), bt = cellText(bv);
    if (!at && !bt) return 0;
    if (!at) return 1;
    if (!bt) return -1;
    return at.localeCompare(bt, undefined, { numeric: true, sensitivity: "base" }) * dir;
  });
}

export default function Responses({ formId }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState("table");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(null); // { key, dir }
  const [cursor, setCursor] = useState(0); // which one the individual view is on
  const [busy, setBusy] = useState("");
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

  // Searching and sorting look across every response, not just the page you can
  // see, so the moment either is switched on we quietly pull the rest in.
  const wantsAll = Boolean(query.trim()) || Boolean(sort) || view === "one";
  useEffect(() => {
    if (wantsAll) fetchAll();
  }, [wantsAll, fetchAll]);

  if (error) return <div className="note bad">{error}</div>;
  if (!data) return <p className="empty">Loading…</p>;

  const { form, total } = data;

  // Searching, sorting and stepping through one at a time all need every row,
  // not the page in front of you. The paged fetch stays the default so a form
  // with thousands of answers still opens instantly.
  const needsAll = wantsAll;
  const awaitingAll = needsAll && !everything;
  const allRows = everything?.responses || null;
  const source = needsAll && allRows ? allRows : data.responses;

  const filtered = filterRows(form, source, query);
  const sorted = sortRows(form, filtered, sort);

  // Client-side paging once we hold everything; server paging otherwise.
  const pageCount = needsAll && allRows
    ? Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
    : Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const responses = needsAll && allRows
    ? sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : sorted;
  const shownTotal = needsAll && allRows ? sorted.length : total;

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

  async function removeResponses(payload, label) {
    setBusy(label);
    setError("");
    try {
      const res = await fetch(`/api/forms/${formId}/responses`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Could not delete that.");
      setEverything(null);
      await load();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy("");
    }
  }

  function deleteOne(id) {
    if (!window.confirm("Delete this response? This cannot be undone.")) return;
    // Stay roughly where you were rather than jumping back to the first one.
    setCursor((c) => Math.max(0, c - 1));
    removeResponses({ ids: [id] }, "one");
  }

  function deleteEverything() {
    const typed = window.prompt(
      `This deletes all ${total} responses to "${form.title}" and cannot be undone.\n\nType DELETE to confirm.`
    );
    if (typed !== "DELETE") return;
    removeResponses({ all: true }, "all");
  }

  function toggleSort(key) {
    setPage(1);
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null; // third click clears it
    });
  }

  async function showOne() {
    setView("one");
    setCursor(0);
    await fetchAll();
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
            <button className={`btn small${view === "summary" ? " on" : ""}`} onClick={showSummary}>
              Summary
            </button>
            <button className={`btn small${view === "table" ? " on" : ""}`} onClick={() => setView("table")}>
              Every answer
            </button>
            <button className={`btn small${view === "one" ? " on" : ""}`} onClick={showOne}>
              One at a time
            </button>
          </div>

          {view === "table" && (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input
                type="search"
                value={query}
                placeholder="Search every answer…"
                aria-label="Search responses"
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                style={{ width: 240 }}
              />
              <button
                className="btn small danger"
                onClick={deleteEverything}
                disabled={busy === "all"}
              >
                {busy === "all" ? "Deleting…" : "Delete all"}
              </button>
            </div>
          )}
        </div>
      )}

      {view === "one" ? (
        awaitingAll ? (
          <p className="empty">Loading every response…</p>
        ) : (
          <OneResponse
            form={form}
            responses={sorted}
            index={Math.min(cursor, Math.max(0, sorted.length - 1))}
            onIndex={(i) => setCursor(Math.max(0, Math.min(i, sorted.length - 1)))}
            onDelete={deleteOne}
            FileCell={FileCell}
          />
        )
      ) : view === "summary" ? (
        !everything ? (
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
            ) : awaitingAll ? (
              <p className="empty">Searching every response…</p>
            ) : responses.length === 0 ? (
              <div className="empty">
                <p style={{ margin: 0 }}>Nothing matches “{query}”.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[{ key: "__when", label: "Submitted at" },
                        ...form.fields.map((f) => ({ key: f.id, label: f.label }))
                      ].map((col) => {
                        const on = sort?.key === col.key;
                        return (
                          <th key={col.key}>
                            <button
                              className={`th-sort${on ? " on" : ""}`}
                              onClick={() => toggleSort(col.key)}
                              title="Sort by this column"
                            >
                              {col.label}
                              <span aria-hidden="true">
                                {on ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                              </span>
                            </button>
                          </th>
                        );
                      })}
                      <th><span className="sr-only">Delete</span></th>
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
                          const long = text.length > 40;
                          return (
                            <td key={f.id} className={long ? "wrap" : undefined} title={long ? text : undefined}>
                              {long ? <span className="clamp">{text}</span> : text}
                            </td>
                          );
                        })}
                        <td>
                          <button
                            className="btn small ghost row-del"
                            onClick={() => deleteOne(r.id)}
                            title="Delete this response"
                            aria-label="Delete this response"
                          >
                            ✕
                          </button>
                        </td>
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
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, shownTotal)} of {shownTotal}
                {query.trim() && <> matching “{query}”</>}
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
