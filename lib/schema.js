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
  "file",
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
  upload: "file",
  attachment: "file",
  document: "file",
  image: "file",
  photo: "file",
  resume: "file",
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
  let page = 1;

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

    // A page break belongs to the field it sits above. Both spellings are
    // accepted because the model sometimes volunteers one of its own.
    const startsPage =
      f.pageBreak === true || f.newPage === true || f.breakBefore === true;
    if (startsPage && fields.length > 0) page += 1;
    if (Number.isFinite(Number(f.page)) && Number(f.page) >= 1) {
      page = Math.min(Math.floor(Number(f.page)), 20);
    }

    fields.push({
      id,
      page,
      breakBefore: startsPage && fields.length > 0,
      label: label.slice(0, 160),
      type,
      required: f.required !== false && f.optional !== true,
      placeholder: String(f.placeholder || "").slice(0, 120) || "",
      help: String(f.help || f.description || "").slice(0, 200) || "",
      options,
      max:
        type === "rating"
          ? Math.min(Math.max(Number(f.max) || 5, 3), 10)
          : type === "number" && Number.isFinite(Number(f.max))
            ? Number(f.max)
            : undefined,
      min:
        type === "number" && Number.isFinite(Number(f.min)) ? Number(f.min) : undefined,
    });
  }

  // Whatever page numbers came in, squash them down to 1, 2, 3… in order.
  const seenPages = [...new Set(fields.map((f) => f.page))].sort((a, b) => a - b);
  const pageIndex = new Map(seenPages.map((p, i) => [p, i + 1]));
  for (const f of fields) f.page = pageIndex.get(f.page) || 1;

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


// Phone check, written for Indian mobile numbers because that is who fills
// these forms, but not so strict that a number from elsewhere is rejected.
// Accepted: 9876543210, 09876543210, +91 98765 43210, +44 20 7946 0958.
export function phoneOk(raw) {
  const value = String(raw || "").trim();
  const digits = value.replace(/\D/g, "");

  if (value.startsWith("+") && !value.startsWith("+91")) {
    return digits.length >= 8 && digits.length <= 15;
  }

  let local = digits;
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  if (local.length === 11 && local.startsWith("0")) local = local.slice(1);

  return /^[6-9]\d{9}$/.test(local);
}

// Server-side validation of one submission against the form's own fields.
export function validateSubmission(form, body) {
  return validateFieldList(form.fields, body, form.id);
}

// The same checks, over any subset of the fields. The multi-page form uses
// this to check one page before letting someone move on, so the rules a
// person sees in the browser are exactly the rules the server applies.
export function validateFieldList(fieldList, body, formId = "") {
  const errors = {};
  const answers = {};


  for (const field of fieldList) {
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
      const yes = raw === true || raw === "true" || raw === "yes";
      const no = raw === false || raw === "false" || raw === "no";

      // Saying No is answering the question. Only leaving it untouched is not.
      if (!yes && !no) {
        if (field.required) errors[field.id] = "Pick Yes or No.";
        answers[field.id] = null;
        continue;
      }

      answers[field.id] = yes;
      continue;
    }

    const value = raw == null ? "" : String(raw).trim().slice(0, 5000);

    if (!value) {
      if (field.required) errors[field.id] = "This is required.";
      answers[field.id] = "";
      continue;
    }

    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      errors[field.id] = "Enter a valid email address, like name@college.edu.";
    }

    if (field.type === "number") {
      const n = Number(value);
      if (Number.isNaN(n)) errors[field.id] = "Enter a number.";
      else if (field.min != null && n < field.min) errors[field.id] = `Has to be ${field.min} or more.`;
      else if (field.max != null && n > field.max) errors[field.id] = `Has to be ${field.max} or less.`;
    }

    if (field.type === "tel" && !phoneOk(value)) {
      errors[field.id] = "Enter a 10-digit mobile number.";
    }

    if (field.type === "url" && !/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(value)) {
      errors[field.id] = "Enter a full link starting with https://";
    }

    if (field.type === "date" && Number.isNaN(new Date(value).getTime())) {
      errors[field.id] = "Pick a date.";
    }

    // A file answer is the path the upload landed at. It must sit inside this
    // form's own folder, so nobody can point an answer at someone else's file.
    if (field.type === "file") {
      const prefix = formId ? `${formId}/` : "";
      if (!/^[a-z0-9_-]{4,40}\/[A-Za-z0-9._-]{1,120}$/i.test(value)) {
        errors[field.id] = "Attach the file again.";
      } else if (prefix && !value.startsWith(prefix)) {
        errors[field.id] = "Attach the file again.";
      }
    }
    if ((field.type === "select" || field.type === "radio") && !field.options.includes(value)) {
      errors[field.id] = "Pick one of the options.";
    }

    answers[field.id] = value;
  }

  return { errors, answers, ok: Object.keys(errors).length === 0 };
}
