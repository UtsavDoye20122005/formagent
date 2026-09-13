// The longest a single answer may be. Shared so the counter people see while
// typing and the rule the server applies can never drift apart.
export const MAX_ANSWER_CHARS = 5000;

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

// Words that mean "this is a recording", in English and romanised Hindi.
const LOOKS_LIKE_RECORDING =
  /\b(video|videos|clip|clips|reel|reels|footage|recording|record|film|movie|audio|song|track|voice ?note|performance|showreel|demo tape|gaana|vdo)\b/i;

// Documents people are asked for in bulk. Five hundred students attaching a
// two-megabyte resume is a gigabyte — the whole free storage allowance, from a
// single form, and the uploads start failing halfway through registration.
// A link costs nothing at any size, and every student already has their own
// Drive. So these are asked for as a link and not as an upload.
const LOOKS_LIKE_DOCUMENT =
  /\b(resume|resumes|cv|cvs|portfolio|portfolios|certificate|certificates|certification|transcript|transcripts|marksheet|mark ?sheet|report|assignment|assignments|thesis|dissertation|paper|slides|deck|presentation|poster|document|documents|brochure|proposal|sample|samples|work sample|case study)\b/i;

const DRIVE_HELP =
  "Upload it to Google Drive and paste the link here. Set sharing to " +
  "\u201Canyone with the link can view\u201D, or nobody will be able to open it.";

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


// A deadline the model worked out from speech. Anything in the past, or absurdly
// far away, is more likely a misreading than an instruction, so it is dropped
// rather than silently closing somebody's form.
function cleanDeadline(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return "";

  const now = Date.now();
  const twoYears = 1000 * 60 * 60 * 24 * 730;
  if (when.getTime() <= now || when.getTime() - now > twoYears) return "";

  // Kept in the "YYYY-MM-DDTHH:MM" shape the date input and the API both speak.
  const pad = (n) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(
    when.getHours()
  )}:${pad(when.getMinutes())}`;
}

// "2026-09-28T23:59" has no time zone in it. Whoever reads it decides what it
// means, and the server runs on UTC — so a teacher in India saying "close it on
// the 28th" was getting a deadline of 5:29am on the 29th, her time. These two
// run in the BROWSER, where the person's own zone is known, so the wall-clock
// time they picked is pinned to a real moment before it ever leaves the page.
export function localToInstant(naive) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(String(naive || "").trim());
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = m[4] == null ? 23 : Number(m[4]);
  const mi = m[5] == null ? 59 : Number(m[5]);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
}

export function instantToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
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

    // A 10 MB cap and a rehearsal video are incompatible. Whatever the model
    // decided, anything that is clearly a recording is asked for as a link.
    let placeholder = f.placeholder;
    let help = f.help || f.description;
    if (type === "file" && LOOKS_LIKE_RECORDING.test(label)) {
      type = "url";
      placeholder = placeholder || "https://youtube.com/... or a Drive link";
      help =
        help ||
        "Upload it to YouTube or Google Drive, then paste the link here. Check that anyone with the link can view it.";
    } else if (type === "file" && LOOKS_LIKE_DOCUMENT.test(label)) {
      type = "url";
      placeholder = placeholder || "https://drive.google.com/...";
      help = help || DRIVE_HELP;
    }

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
      placeholder: String(placeholder || "").slice(0, 120) || "",
      help: String(help || "").slice(0, 200) || "",
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
    closesAt: cleanDeadline(src.closesAt || src.closes_at || src.deadline),
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

    const typed = raw == null ? "" : String(raw).trim();

    // Silently cutting someone's answer at 5,000 characters means they walk
    // away believing the whole thing was sent. Tell them instead.
    if (typed.length > MAX_ANSWER_CHARS) {
      errors[field.id] =
        `That is ${typed.length.toLocaleString()} characters — the limit is ` +
        `${MAX_ANSWER_CHARS.toLocaleString()}. Please shorten it.`;
      answers[field.id] = typed.slice(0, MAX_ANSWER_CHARS);
      continue;
    }

    const value = typed;

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

// ---------------------------------------------------------------------------
// Editing a form that is already out in the world.
//
// Every answer is filed under its question's id, so ids are the one thing that
// must never move. Fixing a typo in "Whta is your name?" must not quietly
// disconnect it from the twenty answers already underneath it — so an edit is
// matched to the question it came from by id, and the id is carried over
// untouched no matter how the wording changes.
//
// Once a single response has arrived the rules tighten. Wording, help text,
// whether it is required, the order, the page breaks and EXTRA options are all
// still free, because none of them touch a stored answer. Deleting a question,
// changing what kind of question it is, or removing an option somebody already
// chose would leave answers no one can read, so those are refused with a reason
// a person can act on. Before the first response, anything goes.
// ---------------------------------------------------------------------------

const PLAIN_TYPE = {
  text: "short text", textarea: "long text", email: "email", tel: "phone",
  number: "number", url: "link", date: "date", time: "time", select: "dropdown",
  radio: "pick one", checkbox: "pick many", boolean: "yes / no",
  rating: "rating", file: "file upload",
};

function newFieldId(label, taken) {
  const base =
    String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) ||
    "question";
  let id = base;
  let n = 2;
  while (taken.has(id)) id = `${base}_${n++}`;
  return id;
}

export function mergeFields(saved, incoming, live) {
  const no = (error) => ({ fields: null, error });

  if (!Array.isArray(incoming)) return no("Nothing to change.");
  if (incoming.length === 0) return no("A form needs at least one question.");
  if (incoming.length > 60) return no("That is too many questions for one form.");

  const before = new Map((saved || []).map((f) => [f.id, f]));
  const seen = new Set();
  const out = [];

  for (const raw of incoming) {
    if (!raw || typeof raw !== "object") continue;

    const label = String(raw.label || "").trim().slice(0, 200);
    if (!label) return no("Every question needs some wording.");

    const old = raw.id ? before.get(String(raw.id)) : null;

    // No match means this is a new question. New ones are fine at any time:
    // earlier responses simply have nothing under them, which the summary
    // already reports honestly as "skipped".
    const id = old ? old.id : newFieldId(label, seen);
    if (seen.has(id)) return no("Two questions ended up with the same name.");
    seen.add(id);

    let type = String(raw.type || old?.type || "text");
    if (!FIELD_TYPES.includes(type)) type = "text";

    const options = Array.isArray(raw.options)
      ? [...new Set(raw.options.map((o) => String(o).trim()).filter(Boolean))].slice(0, 40)
      : [];

    if ((type === "select" || type === "radio" || type === "checkbox") && options.length < 2) {
      return no(`"${label}" needs at least two options to choose from.`);
    }

    if (live && old) {
      if (type !== old.type) {
        return no(
          `"${old.label}" already has answers, so it has to stay a ` +
          `${PLAIN_TYPE[old.type] || old.type} question. Add a new question instead.`
        );
      }
      const dropped = (old.options || []).filter((o) => !options.includes(o));
      if (dropped.length) {
        return no(
          `"${old.label}" already has answers, so the option "${dropped[0]}" cannot be ` +
          `removed — somebody may have chosen it. You can add options or change the wording.`
        );
      }
    }

    const field = {
      id,
      label,
      type,
      required: Boolean(raw.required),
      options,
      placeholder: String(raw.placeholder || "").trim().slice(0, 120),
      help: String(raw.help || "").trim().slice(0, 300),
      breakBefore: Boolean(raw.breakBefore),
    };
    if (raw.min != null && Number.isFinite(Number(raw.min))) field.min = Number(raw.min);
    if (raw.max != null && Number.isFinite(Number(raw.max))) field.max = Number(raw.max);
    out.push(field);
  }

  if (out.length === 0) return no("A form needs at least one question.");

  if (live) {
    const gone = (saved || []).filter((f) => !seen.has(f.id));
    if (gone.length) {
      return no(
        `"${gone[0].label}" already has answers, so deleting it would throw away what ` +
        `people wrote. You can make it not required instead.`
      );
    }
  }

  // Pages are rebuilt from the break marks, so the two can never disagree.
  let page = 1;
  for (let i = 0; i < out.length; i++) {
    if (i > 0 && out[i].breakBefore) page++;
    out[i].page = page;
  }

  return { fields: out, error: "" };
}
