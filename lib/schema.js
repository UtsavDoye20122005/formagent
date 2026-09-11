// Field types the renderer knows how to draw.
export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "tel",
  "number",
  "url",
  "date",
  "time",
  "select",
  "radio",
  "checkbox",
  "boolean",
  "rating",
];

const ALIASES = {
  string: "text",
  short_text: "text",
  shorttext: "text",
  long_text: "textarea",
  longtext: "textarea",
  paragraph: "textarea",
  phone: "tel",
  mobile: "tel",
  dropdown: "select",
  choice: "radio",
  single_choice: "radio",
  singlechoice: "radio",
  multiple_choice: "checkbox",
  multiplechoice: "checkbox",
  multi_select: "checkbox",
  multiselect: "checkbox",
  yes_no: "boolean",
  yesno: "boolean",
  toggle: "boolean",
  integer: "number",
  link: "url",
  website: "url",
  datetime: "date",
  scale: "rating",
  stars: "rating",
};

export function slugify(input, fallback = "field") {
  const s = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || fallback;
}

export function newId(len = 10) {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function cleanOptions(options) {
  if (!Array.isArray(options)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of options) {
    const label = String(
      raw && typeof raw === "object" ? raw.label ?? raw.value ?? "" : raw ?? ""
    ).trim();
    if (!label || label.length > 120) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= 30) break;
  }
  return out;
}

// Accepts whatever the model (or the fallback parser) produced and forces it
// into a shape the renderer can trust. Never throws on bad input.
export function normalizeForm(raw, instructions = "") {
  const src = raw && typeof raw === "object" ? raw : {};
  const usedIds = new Set();

  const fieldsIn = Array.isArray(src.fields) ? src.fields.slice(0, 40) : [];
  const fields = [];

  for (const f of fieldsIn) {
    if (!f || typeof f !== "object") continue;
    const label = String(f.label || f.name || f.question || "").trim();
    if (!label) continue;

    let type = String(f.type || "text").toLowerCase().trim();
    type = ALIASES[type] || type;
    if (!FIELD_TYPES.includes(type)) type = "text";

    let options = cleanOptions(f.options || f.choices);
    if ((type === "select" || type === "radio" || type === "checkbox") && options.length < 2) {
      type = "text";
      options = [];
    }
    if (type === "radio" && options.length > 6) type = "select";

    let id = slugify(f.id || f.key || label, `field_${fields.length + 1}`);
    while (usedIds.has(id)) id = `${id}_${fields.length + 1}`;
    usedIds.add(id);

    fields.push({
      id,
      label: label.slice(0, 160),
      type,
      required: f.required !== false && f.optional !== true,
      placeholder: String(f.placeholder || "").slice(0, 120) || "",
      help: String(f.help || f.description || "").slice(0, 200) || "",
      options,
      max: type === "rating" ? Math.min(Math.max(Number(f.max) || 5, 3), 10) : undefined,
    });
  }

  const fallbackTitle = instructions.trim().split(/[.\n]/)[0]?.slice(0, 70) || "Untitled form";

  return {
    title: String(src.title || fallbackTitle).trim().slice(0, 120) || "Untitled form",
    description: String(src.description || "").trim().slice(0, 400),
    submitLabel: String(src.submitLabel || "Submit").trim().slice(0, 40) || "Submit",
    thankYou:
      String(src.thankYou || "").trim().slice(0, 300) ||
      "Thanks — your response has been recorded.",
    fields,
  };
}

// Server-side validation of one submission against the form's own fields.
export function validateSubmission(form, body) {
  const errors = {};
  const answers = {};

  for (const field of form.fields) {
    const raw = body ? body[field.id] : undefined;

    if (field.type === "checkbox") {
      const picked = Array.isArray(raw)
        ? raw.map(String).filter((v) => field.options.includes(v))
        : [];
      if (field.required && picked.length === 0) errors[field.id] = "Pick at least one option.";
      answers[field.id] = picked;
      continue;
    }

    if (field.type === "boolean") {
      answers[field.id] = raw === true || raw === "true" || raw === "yes";
      if (field.required && !answers[field.id]) errors[field.id] = "This is required.";
      continue;
    }

    const value = raw == null ? "" : String(raw).trim().slice(0, 5000);

    if (!value) {
      if (field.required) errors[field.id] = "This is required.";
      answers[field.id] = "";
      continue;
    }

    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      errors[field.id] = "Enter a valid email address.";
    }
    if (field.type === "number" && Number.isNaN(Number(value))) {
      errors[field.id] = "Enter a number.";
    }
    if (field.type === "tel" && value.replace(/\D/g, "").length < 6) {
      errors[field.id] = "Enter a valid phone number.";
    }
    if ((field.type === "select" || field.type === "radio") && !field.options.includes(value)) {
      errors[field.id] = "Pick one of the options.";
    }

    answers[field.id] = value;
  }

  return { errors, answers, ok: Object.keys(errors).length === 0 };
}
