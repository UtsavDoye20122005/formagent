"use client";

// One person's submission, on its own. Google Forms calls this the Individual
// tab, and it is the view a teacher actually wants when a student says "did my
// entry come through?" — a table row is unreadable at that moment.

function show(field, value) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
    return <span className="unanswered">Not answered</span>;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (field.type === "rating") return `${value} out of ${field.max || 5}`;
  return String(value);
}

export default function OneResponse({ form, responses, index, onIndex, onDelete, FileCell }) {
  const total = responses.length;
  const r = responses[index];

  if (!r) return <p className="empty">No responses yet.</p>;

  const when = new Date(r.submittedAt).toLocaleString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });

  return (
    <div className="card one-response">
      <div className="one-head">
        <div>
          <p className="hint" style={{ margin: 0 }}>Response {index + 1} of {total}</p>
          <h3 style={{ margin: "4px 0 0" }}>{when}</h3>
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button
            className="btn small"
            onClick={() => onIndex(index - 1)}
            disabled={index <= 0}
            aria-label="Previous response"
          >
            ←
          </button>
          <button
            className="btn small"
            onClick={() => onIndex(index + 1)}
            disabled={index >= total - 1}
            aria-label="Next response"
          >
            →
          </button>
          <button className="btn small danger" onClick={() => onDelete(r.id)}>
            Delete
          </button>
        </div>
      </div>

      <dl className="one-list">
        {form.fields.map((f) => (
          <div key={f.id}>
            <dt>{f.label}</dt>
            <dd>
              {f.type === "file" && r.answers?.[f.id] ? (
                <FileCell path={r.answers[f.id]} />
              ) : (
                show(f, r.answers?.[f.id])
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
