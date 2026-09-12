"use client";

// A read-at-a-glance view of the answers. One card per question, and the shape
// of the card follows the shape of the question: counts get bars, ratings get
// an average, numbers get a range, and free text gets left alone because a bar
// chart of 40 different sentences tells you nothing.

const CHOICE = new Set(["radio", "select", "checkbox"]);
const NUMERIC = new Set(["number"]);

function isAnswered(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return true;
  return value != null && String(value).trim() !== "";
}

function isYes(v) {
  return v === true || v === "true" || v === "yes" || v === "Yes";
}
function isNo(v) {
  return v === false || v === "false" || v === "no" || v === "No";
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
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

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function QuestionCard({ field, responses }) {
  const values = responses.map((r) => r.answers?.[field.id]);
  const answered = values.filter(isAnswered);
  const total = answered.length;

  let body = null;

  if (CHOICE.has(field.type)) {
    const counts = new Map((field.options || []).map((o) => [o, 0]));
    for (const v of answered) {
      const picks = Array.isArray(v) ? v : [v];
      for (const p of picks) {
        const key = String(p);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const rows = [...counts].map(([label, count]) => ({ label, count }));
    body = rows.length ? <Bars rows={rows} total={total} /> : null;
  } else if (field.type === "boolean") {
    const yes = answered.filter(isYes).length;
    const no = answered.filter(isNo).length;
    body = (
      <Bars
        rows={[
          { label: "Yes", count: yes },
          { label: "No", count: no },
        ]}
        total={yes + no}
        keepOrder
      />
    );
  } else if (field.type === "rating") {
    const max = field.max || 5;
    const nums = answered.map(Number).filter((n) => Number.isFinite(n));
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const rows = Array.from({ length: max }, (_, i) => ({
      label: String(i + 1),
      count: nums.filter((n) => n === i + 1).length,
    }));
    body = (
      <>
        <p className="hero">
          {avg.toFixed(1)}
          <span className="hero-unit">out of {max}</span>
        </p>
        <Bars rows={rows} total={nums.length} keepOrder />
      </>
    );
  } else if (NUMERIC.has(field.type)) {
    const nums = answered.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      body = (
        <div className="stats">
          <Stat label="lowest" value={Math.min(...nums)} />
          <Stat label="average" value={(sum / nums.length).toFixed(1)} />
          <Stat label="highest" value={Math.max(...nums)} />
        </div>
      );
    }
  } else if (field.type === "date") {
    const days = answered
      .map((v) => new Date(String(v)))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b);
    if (days.length) {
      const fmt = (d) =>
        d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      body = (
        <div className="stats">
          <Stat label="earliest" value={fmt(days[0])} />
          <Stat label="latest" value={fmt(days[days.length - 1])} />
        </div>
      );
    }
  }

  return (
    <div className="card summary-card">
      <h3 className="summary-q">{field.label}</h3>
      <p className="hint" style={{ margin: "0 0 14px" }}>
        {total} of {responses.length} answered
      </p>
      {body || (
        <p className="empty" style={{ margin: 0 }}>
          Written answers — see the table below.
        </p>
      )}
    </div>
  );
}

export default function Summary({ form, responses }) {
  if (responses.length === 0) return null;

  return (
    <div className="summary-grid">
      {form.fields.map((f) => (
        <QuestionCard key={f.id} field={f} responses={responses} />
      ))}
    </div>
  );
}
