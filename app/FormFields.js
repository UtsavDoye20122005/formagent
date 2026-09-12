"use client";

const TEXTY = {
  text: "text",
  email: "email",
  tel: "tel",
  number: "number",
  url: "url",
  date: "date",
  time: "time",
};

export default function FormFields({ fields, values, errors = {}, onChange, disabled = false }) {
  return (
    <>
      {fields.map((f) => {
        const err = errors[f.id];
        const value = values[f.id];
        const describedBy = err ? `${f.id}-err` : f.help ? `${f.id}-help` : undefined;

        return (
          <div className="field" key={f.id}>
            <label className="label" htmlFor={f.id}>
              {f.label}
              {f.required && <span className="req" aria-hidden="true">*</span>}
            </label>

            {f.help && (
              <p className="hint" id={`${f.id}-help`} style={{ margin: "0 0 7px" }}>
                {f.help}
              </p>
            )}

            {TEXTY[f.type] && (
              <input
                id={f.id}
                type={TEXTY[f.type]}
                value={value ?? ""}
                placeholder={f.placeholder || (f.type === "tel" ? "10-digit mobile number" : "")}
                disabled={disabled}
                inputMode={f.type === "tel" ? "numeric" : undefined}
                autoComplete={
                  f.type === "tel" ? "tel" : f.type === "email" ? "email" : undefined
                }
                min={f.type === "number" && f.min != null ? f.min : undefined}
                max={f.type === "number" && f.max != null ? f.max : undefined}
                aria-invalid={err ? "true" : undefined}
                aria-describedby={describedBy}
                onChange={(e) => onChange(f.id, e.target.value)}
              />
            )}

            {f.type === "textarea" && (
              <textarea
                id={f.id}
                value={value ?? ""}
                placeholder={f.placeholder || ""}
                disabled={disabled}
                aria-invalid={err ? "true" : undefined}
                aria-describedby={describedBy}
                onChange={(e) => onChange(f.id, e.target.value)}
              />
            )}

            {f.type === "select" && (
              <select
                id={f.id}
                value={value ?? ""}
                disabled={disabled}
                aria-invalid={err ? "true" : undefined}
                aria-describedby={describedBy}
                onChange={(e) => onChange(f.id, e.target.value)}
              >
                <option value="">Choose…</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}

            {f.type === "radio" && (
              <div className="choices" role="radiogroup" aria-labelledby={f.id}>
                {f.options.map((o) => (
                  <label className="choice" key={o}>
                    <input
                      type="radio"
                      name={f.id}
                      value={o}
                      disabled={disabled}
                      checked={value === o}
                      onChange={() => onChange(f.id, o)}
                    />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
            )}

            {f.type === "checkbox" && (
              <div className="choices">
                {f.options.map((o) => {
                  const picked = Array.isArray(value) ? value : [];
                  return (
                    <label className="choice" key={o}>
                      <input
                        type="checkbox"
                        value={o}
                        disabled={disabled}
                        checked={picked.includes(o)}
                        onChange={(e) =>
                          onChange(
                            f.id,
                            e.target.checked
                              ? [...picked, o]
                              : picked.filter((v) => v !== o)
                          )
                        }
                      />
                      <span>{o}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {f.type === "boolean" && (
              <label className="choice" style={{ maxWidth: 320 }}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={value === true}
                  onChange={(e) => onChange(f.id, e.target.checked)}
                />
                <span>Yes</span>
              </label>
            )}

            {f.type === "rating" && (
              <div className="stars" role="group" aria-labelledby={f.id}>
                {Array.from({ length: f.max || 5 }, (_, i) => i + 1).map((n) => (
                  <button
                    type="button"
                    key={n}
                    className={`star${Number(value) >= n ? " on" : ""}`}
                    disabled={disabled}
                    aria-pressed={Number(value) === n}
                    aria-label={`${n} out of ${f.max || 5}`}
                    onClick={() => onChange(f.id, String(n))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            {err && (
              <p className="err" id={`${f.id}-err`}>
                {err}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
