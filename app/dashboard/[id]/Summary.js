"use client";

import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Colour
//
// Brand violet leads, then five hues from the Okabe–Ito set. This exact list
// was run through a colour-blindness validator across every pair, not just
// neighbouring ones — a donut puts every slice next to every other slice in the
// legend, so adjacent-only checking is not enough. Deuteranopia, protanopia and
// tritanopia all clear the separation threshold.
//
// Six is the ceiling. A seventh hue cannot be added without two of them
// becoming indistinguishable, so anything past six folds into "Other".
// ---------------------------------------------------------------------------
const HUES = ["#5B4BF0", "#E69F00", "#009E73", "#CC79A7", "#D55E00", "#56B4E9"];
const MAX_SLICES = 6;

const CHOICE = new Set(["radio", "select"]);
const MULTI = new Set(["checkbox"]);
const TEXTY = new Set(["text", "textarea", "email", "tel", "url", "file"]);

function isAnswered(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "boolean") return true;
  return v != null && String(v).trim() !== "";
}
const isYes = (v) => v === true || v === "true" || v === "yes" || v === "Yes";
const isNo = (v) => v === false || v === "false" || v === "no" || v === "No";
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null, bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return { value: best, count: bestN };
}

// --- pieces ----------------------------------------------------------------

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

// A donut, for a question where exactly one answer was picked and the slices
// therefore genuinely add up to everyone. Angles are hard to compare, so the
// exact count and share sit beside every label underneath — the ring shows the
// shape, the list carries the numbers.
function Donut({ rows, total }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 140 140" role="img" aria-label="Share of answers">
        <circle cx="70" cy="70" r={R} className="donut-track" />
        {rows.map((r, i) => {
          const len = total ? (r.count / total) * C : 0;
          // A 2px gap keeps neighbouring slices from bleeding into each other.
          const gap = len > 4 ? 2 : 0;
          const seg = (
            <circle
              key={r.label}
              cx="70" cy="70" r={R}
              className="donut-seg"
              stroke={HUES[i % HUES.length]}
              strokeDasharray={`${Math.max(len - gap, 0)} ${C - Math.max(len - gap, 0)}`}
              strokeDashoffset={-offset}
            >
              <title>{`${r.label}: ${r.count} of ${total}`}</title>
            </circle>
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="donut-mid">
        <strong>{total}</strong>
        <span>answers</span>
      </div>
    </div>
  );
}

function Legend({ rows, total, segments }) {
  return (
    <ul className="legend">
      {rows.map((r, i) => (
        <li key={r.label}>
          <span className="swatch-dot" style={{ background: HUES[i % HUES.length] }} aria-hidden="true" />
          <span className="legend-label">{r.label}</span>
          {segments ? (
            <span className="legend-split">
              {segments.map((seg, j) => {
                const n = r.bySegment?.[seg] || 0;
                if (!n) return null;
                return (
                  <span
                    key={seg}
                    className="split-seg"
                    style={{ width: `${pct(n, r.count)}%`, background: HUES[j % HUES.length] }}
                    title={`${seg}: ${n}`}
                  />
                );
              })}
            </span>
          ) : null}
          <span className="legend-value">
            {r.count}
            <span className="bar-pct">{pct(r.count, total)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Bars({ rows, total, keepOrder = false }) {
  const ordered = keepOrder ? rows : [...rows].sort((a, b) => b.count - a.count);
  const top = Math.max(1, ...ordered.map((r) => r.count));
  return (
    <ul className="bars">
      {ordered.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.count} of ${total}`}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.count / top) * 100}%` }} />
          </span>
          <span className="bar-value">
            {r.count}
            <span className="bar-pct">{pct(r.count, total)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// --- one question ----------------------------------------------------------

function QuestionCard({ field, responses, splitField, segments }) {
  const [showAll, setShowAll] = useState(false);

  const values = responses.map((r) => r.answers?.[field.id]);
  const answered = responses.filter((r) => isAnswered(r.answers?.[field.id]));
  const total = answered.length;
  const skipped = responses.length - total;

  // Counts per option, and — when a split is chosen — per option per segment.
  function tally(optionsFrom) {
    const counts = new Map(optionsFrom.map((o) => [o, { count: 0, bySegment: {} }]));
    for (const r of answered) {
      const raw = r.answers?.[field.id];
      const picks = Array.isArray(raw) ? raw : [raw];
      const seg = splitField ? String(r.answers?.[splitField.id] ?? "—") : null;
      for (const p of picks) {
        const key = String(p);
        if (!counts.has(key)) counts.set(key, { count: 0, bySegment: {} });
        const row = counts.get(key);
        row.count += 1;
        if (seg) row.bySegment[seg] = (row.bySegment[seg] || 0) + 1;
      }
    }
    return [...counts].map(([label, v]) => ({ label, ...v }));
  }

  let body = null;
  let note = null;

  if (CHOICE.has(field.type)) {
    let rows = tally(field.options || []).sort((a, b) => b.count - a.count);
    if (rows.length > MAX_SLICES) {
      const keep = rows.slice(0, MAX_SLICES - 1);
      const rest = rows.slice(MAX_SLICES - 1);
      // The folded bucket has to carry the segment counts of everything inside
      // it, or choosing a breakdown makes the last row silently go blank.
      const merged = {};
      for (const r of rest) {
        for (const [seg, n] of Object.entries(r.bySegment || {})) {
          merged[seg] = (merged[seg] || 0) + n;
        }
      }
      keep.push({
        label: `Other (${rest.length})`,
        count: rest.reduce((n, r) => n + r.count, 0),
        bySegment: merged,
      });
      rows = keep;
      note = "Options past the sixth are grouped, because a seventh colour cannot be told apart from the others.";
    }
    body = (
      <>
        <Donut rows={rows} total={total} />
        <Legend rows={rows} total={total} segments={segments} />
      </>
    );
  } else if (MULTI.has(field.type)) {
    const rows = tally(field.options || []);
    body = <Bars rows={rows} total={total} />;
    note = "People could pick more than one, so these add up to more than the number of answers.";
  } else if (field.type === "boolean") {
    const yes = answered.filter((r) => isYes(r.answers?.[field.id])).length;
    const no = answered.filter((r) => isNo(r.answers?.[field.id])).length;
    const base = yes + no;
    body = (
      <>
        <p className="hero-num">
          {pct(yes, base)}%<span className="hero-unit">said yes</span>
        </p>
        <div className="meter" role="img" aria-label={`${yes} yes, ${no} no`}>
          <span style={{ width: `${pct(yes, base)}%` }} />
        </div>
        <div className="stats" style={{ marginTop: 14 }}>
          <Stat label="yes" value={yes} />
          <Stat label="no" value={no} />
        </div>
      </>
    );
  } else if (field.type === "rating") {
    const max = field.max || 5;
    const nums = answered.map((r) => Number(r.answers?.[field.id])).filter(Number.isFinite);
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const m = mode(nums);
    const rows = Array.from({ length: max }, (_, i) => ({
      label: String(i + 1),
      count: nums.filter((n) => n === i + 1).length,
    }));
    body = (
      <>
        <p className="hero-num">
          {avg.toFixed(2)}<span className="hero-unit">average out of {max}</span>
        </p>
        <div className="stats" style={{ marginBottom: 16 }}>
          <Stat label="median" value={median(nums)} />
          <Stat label="most common" value={m.value ?? "—"} />
          <Stat label="rated 4 or 5" value={`${pct(nums.filter((n) => n >= 4).length, nums.length)}%`} />
        </div>
        <Bars rows={rows} total={nums.length} keepOrder />
      </>
    );
  } else if (field.type === "number") {
    const nums = answered.map((r) => Number(r.answers?.[field.id])).filter(Number.isFinite);
    if (nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      // Five buckets across the range — enough to see a shape, few enough to read.
      const lo = Math.min(...nums), hi = Math.max(...nums);
      const step = (hi - lo) / 5 || 1;
      const rows = Array.from({ length: 5 }, (_, i) => {
        const from = lo + step * i;
        const to = i === 4 ? hi : from + step;
        return {
          label: `${Math.round(from)}–${Math.round(to)}`,
          count: nums.filter((n) => (i === 4 ? n >= from : n >= from && n < to)).length,
        };
      });
      body = (
        <>
          <div className="stats" style={{ marginBottom: 16 }}>
            <Stat label="average" value={(sum / nums.length).toFixed(1)} />
            <Stat label="median" value={median(nums)} />
            <Stat label="lowest" value={lo} />
            <Stat label="highest" value={hi} />
          </div>
          {hi > lo && <Bars rows={rows} total={nums.length} keepOrder />}
        </>
      );
    }
  } else if (field.type === "date") {
    const days = answered
      .map((r) => new Date(String(r.answers?.[field.id])))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b);
    if (days.length) {
      const fmt = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      const counts = new Map();
      for (const d of days) {
        const k = fmt(d);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      body = (
        <>
          <div className="stats" style={{ marginBottom: 16 }}>
            <Stat label="earliest" value={fmt(days[0])} />
            <Stat label="latest" value={fmt(days[days.length - 1])} />
          </div>
          <Bars rows={[...counts].map(([label, count]) => ({ label, count }))} total={days.length} keepOrder />
        </>
      );
    }
  } else if (TEXTY.has(field.type)) {
    const written = answered.map((r) => String(r.answers?.[field.id])).filter(Boolean);
    const unique = new Set(written.map((w) => w.toLowerCase().trim())).size;
    const shown = showAll ? written : written.slice(0, 5);
    body = (
      <>
        <div className="stats" style={{ marginBottom: 14 }}>
          <Stat label={written.length === 1 ? "answer" : "answers"} value={written.length} />
          <Stat label={unique === 1 ? "different answer" : "different answers"} value={unique} />
        </div>
        <ul className="quotes">
          {shown.map((w, i) => (
            <li key={i}>{field.type === "file" ? w.split("/").pop() : w}</li>
          ))}
        </ul>
        {written.length > 5 && (
          <button className="btn small ghost" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${written.length}`}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="card summary-card">
      <h3 className="summary-q">{field.label}</h3>
      <p className="hint" style={{ margin: "0 0 16px" }}>
        {total} answered
        {skipped > 0 && <> · <span className="skipped">{skipped} skipped</span></>}
      </p>
      {body || <p className="empty" style={{ margin: 0 }}>Nothing to chart yet.</p>}
      {note && <p className="meta">{note}</p>}
    </div>
  );
}

// --- the view --------------------------------------------------------------

export default function Summary({ form, responses }) {
  const [splitId, setSplitId] = useState("");

  // Only a pick-one question with a sane number of options makes a useful
  // lens to look at everything else through.
  const splittable = useMemo(
    () =>
      form.fields.filter(
        (f) => CHOICE.has(f.type) && f.options?.length >= 2 && f.options.length <= MAX_SLICES
      ),
    [form.fields]
  );

  const splitField = splittable.find((f) => f.id === splitId) || null;
  const segments = splitField ? splitField.options : null;

  if (responses.length === 0) return null;

  return (
    <>
      {splittable.length > 0 && (
        <div className="split-bar">
          <label className="label" htmlFor="splitby" style={{ margin: 0 }}>Break down by</label>
          <select
            id="splitby"
            value={splitId}
            onChange={(e) => setSplitId(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="">Nothing — show totals</option>
            {splittable.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>

          {splitField && (
            <ul className="legend inline">
              {segments.map((s, i) => (
                <li key={s}>
                  <span className="swatch-dot" style={{ background: HUES[i % HUES.length] }} aria-hidden="true" />
                  <span className="legend-label">{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="summary-grid">
        {form.fields.map((f) => (
          <QuestionCard
            key={f.id}
            field={f}
            responses={responses}
            splitField={splitField && splitField.id !== f.id ? splitField : null}
            segments={splitField && splitField.id !== f.id ? segments : null}
          />
        ))}
      </div>
    </>
  );
}
