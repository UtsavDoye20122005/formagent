"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const ALL = "__all__";
const UNFILED = "__unfiled__";

function when(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function call(url, options = {}) {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Please sign in.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function Dashboard({ initialWorkspaces, initialForms, loadError }) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [forms, setForms] = useState(initialForms);
  const [selected, setSelected] = useState(ALL);
  const [error, setError] = useState(loadError || "");
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const counts = useMemo(() => {
    const map = { [ALL]: forms.length, [UNFILED]: 0 };
    for (const w of workspaces) map[w.id] = 0;
    for (const f of forms) {
      const key = f.workspaceId || UNFILED;
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [forms, workspaces]);

  const visible = useMemo(() => {
    if (selected === ALL) return forms;
    if (selected === UNFILED) return forms.filter((f) => !f.workspaceId);
    return forms.filter((f) => f.workspaceId === selected);
  }, [forms, selected]);

  async function addSection() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const { workspace } = await call("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setWorkspaces((w) => [...w, workspace]);
      setNewName("");
      setAdding(false);
      setSelected(workspace.id);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function saveRename(id) {
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { workspace } = await call(`/api/workspaces/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setWorkspaces((list) => list.map((w) => (w.id === id ? workspace : w)));
      setRenamingId(null);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function removeSection(id, name) {
    const inside = counts[id] || 0;
    const warning = inside
      ? `Delete the section "${name}"? Its ${inside} form${inside === 1 ? "" : "s"} will move to Unfiled — nothing is lost.`
      : `Delete the section "${name}"?`;
    if (!window.confirm(warning)) return;

    setBusy(true);
    try {
      await call(`/api/workspaces/${id}`, { method: "DELETE" });
      setWorkspaces((list) => list.filter((w) => w.id !== id));
      setForms((list) =>
        list.map((f) => (f.workspaceId === id ? { ...f, workspaceId: null } : f))
      );
      if (selected === id) setSelected(ALL);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function moveForm(formId, workspaceId) {
    setBusy(true);
    try {
      await call(`/api/forms/${formId}`, {
        method: "PATCH",
        body: JSON.stringify({ workspaceId: workspaceId || null }),
      });
      setForms((list) =>
        list.map((f) => (f.id === formId ? { ...f, workspaceId: workspaceId || null } : f))
      );
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleOpen(form) {
    setBusy(true);
    try {
      await call(`/api/forms/${form.id}`, {
        method: "PATCH",
        body: JSON.stringify({ open: !form.open }),
      });
      setForms((list) =>
        list.map((f) => (f.id === form.id ? { ...f, open: !form.open } : f))
      );
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function removeForm(form) {
    if (
      !window.confirm(
        `Delete "${form.title}"? Its ${form.responseCount || 0} response${
          form.responseCount === 1 ? "" : "s"
        } will be deleted too. This cannot be undone.`
      )
    )
      return;
    setBusy(true);
    try {
      await call(`/api/forms/${form.id}`, { method: "DELETE" });
      setForms((list) => list.filter((f) => f.id !== form.id));
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  const sectionTitle =
    selected === ALL
      ? "All forms"
      : selected === UNFILED
      ? "Unfiled"
      : workspaces.find((w) => w.id === selected)?.name || "Forms";

  return (
    <>
      <h1>My forms</h1>
      <p className="lede">
        Everything you&apos;ve built. Make sections to keep different work apart.
      </p>

      {error && <div className="note bad">{error}</div>}

      <div className="split">
        <aside className="sidebar">
          <button
            className={`side-item${selected === ALL ? " on" : ""}`}
            onClick={() => setSelected(ALL)}
          >
            <span>All forms</span>
            <span className="count">{counts[ALL] || 0}</span>
          </button>

          <button
            className={`side-item${selected === UNFILED ? " on" : ""}`}
            onClick={() => setSelected(UNFILED)}
          >
            <span>Unfiled</span>
            <span className="count">{counts[UNFILED] || 0}</span>
          </button>

          <div className="side-heading">Your sections</div>

          {workspaces.length === 0 && !adding && (
            <p className="hint" style={{ padding: "2px 10px 8px" }}>
              None yet. Sections are yours to name — &ldquo;College&rdquo;,
              &ldquo;AIESEC&rdquo;, a client&apos;s name.
            </p>
          )}

          {workspaces.map((w) =>
            renamingId === w.id ? (
              <div className="side-rename" key={w.id}>
                <input
                  type="text"
                  value={renameValue}
                  autoFocus
                  maxLength={60}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveRename(w.id); }
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
                <button className="btn small primary" onClick={() => saveRename(w.id)} disabled={busy}>
                  Save
                </button>
              </div>
            ) : (
              <div className="side-row" key={w.id}>
                <button
                  className={`side-item${selected === w.id ? " on" : ""}`}
                  onClick={() => setSelected(w.id)}
                >
                  <span>{w.name}</span>
                  <span className="count">{counts[w.id] || 0}</span>
                </button>
                <div className="side-tools">
                  <button
                    className="btn ghost small"
                    title="Rename"
                    aria-label={`Rename ${w.name}`}
                    onClick={() => { setRenamingId(w.id); setRenameValue(w.name); }}
                  >
                    ✎
                  </button>
                  <button
                    className="btn ghost small"
                    title="Delete"
                    aria-label={`Delete ${w.name}`}
                    onClick={() => removeSection(w.id, w.name)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          )}

          {adding ? (
            <div className="side-rename">
              <input
                type="text"
                value={newName}
                autoFocus
                maxLength={60}
                placeholder="Section name"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addSection(); }
                  if (e.key === "Escape") { setAdding(false); setNewName(""); }
                }}
              />
              <button className="btn small primary" onClick={addSection} disabled={busy || !newName.trim()}>
                Add
              </button>
            </div>
          ) : (
            <button className="btn small add-section" onClick={() => setAdding(true)}>
              + New section
            </button>
          )}
        </aside>

        <section style={{ minWidth: 0 }}>
          <div className="card">
            <div className="spread" style={{ marginBottom: 4 }}>
              <h2>{sectionTitle}</h2>
              <span className="tag">{visible.length}</span>
            </div>

            {visible.length === 0 ? (
              <div className="empty">
                <p style={{ margin: "0 0 14px" }}>Nothing here yet.</p>
                <Link className="btn primary" href="/">Build a form</Link>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                {visible.map((f) => (
                  <div className="list-item" key={f.id}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 590 }}>
                        {f.title}
                        {!f.open && <span className="tag" style={{ marginLeft: 8 }}>Closed</span>}
                      </div>
                      <div className="hint">
                        {f.fields.length} question{f.fields.length === 1 ? "" : "s"} · created {when(f.createdAt)}
                      </div>
                      <div className="row" style={{ marginTop: 8, gap: 6 }}>
                        <select
                          value={f.workspaceId || ""}
                          onChange={(e) => moveForm(f.id, e.target.value)}
                          disabled={busy}
                          aria-label={`Section for ${f.title}`}
                          style={{ width: "auto", padding: "4px 8px", fontSize: 12.5 }}
                        >
                          <option value="">Unfiled</option>
                          {workspaces.map((w) => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
                        <button className="btn ghost small" onClick={() => toggleOpen(f)} disabled={busy}>
                          {f.open ? "Close form" : "Reopen"}
                        </button>
                        <button className="btn ghost small" onClick={() => removeForm(f)} disabled={busy}>
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <span className={`tag${f.responseCount > 0 ? " accent" : ""}`}>
                        {f.responseCount ?? 0} response{f.responseCount === 1 ? "" : "s"}
                      </span>
                      <a className="btn small ghost" href={`/f/${f.id}`} target="_blank" rel="noreferrer">
                        Open
                      </a>
                      <Link className="btn small" href={`/dashboard/${f.id}`}>
                        Responses
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
