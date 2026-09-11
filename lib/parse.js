// Rule-based fallback: turns plain instructions into a form when no
// ANTHROPIC_API_KEY is configured (or the API call fails). Deliberately
// conservative — it recognises common field words and explicit option lists.

const PATTERNS = [
  { re: /\b(e-?mail|mail id|email address)\b/i, type: "email", label: "Email" },
  {
    re: /\b(phone|mobile|whatsapp|contact number|contact no|cell)\b/i,
    type: "tel",
    label: "Phone number",
  },
  { re: /\b(full name|your name|name)\b/i, type: "text", label: "Full name" },
  { re: /\b(age)\b/i, type: "number", label: "Age" },
  { re: /\b(date of birth|dob|birthday)\b/i, type: "date", label: "Date of birth" },
  { re: /\b(date)\b/i, type: "date", label: "Date" },
  { re: /\b(time|timing|slot)\b/i, type: "time", label: "Preferred time" },
  { re: /\b(college|university|institute|school)\b/i, type: "text", label: "College" },
  { re: /\b(course|branch|stream|department|major)\b/i, type: "text", label: "Branch" },
  { re: /\b(year of study|which year|year)\b/i, type: "text", label: "Year of study" },
  { re: /\b(roll number|roll no|student id|enrolment|enrollment)\b/i, type: "text", label: "Roll number" },
  { re: /\b(company|organisation|organization|employer)\b/i, type: "text", label: "Organisation" },
  { re: /\b(designation|job title|role|position)\b/i, type: "text", label: "Role" },
  { re: /\b(city|location|place)\b/i, type: "text", label: "City" },
  { re: /\b(address)\b/i, type: "textarea", label: "Address" },
  { re: /\b(linkedin|portfolio|website|github|link|url)\b/i, type: "url", label: "Link" },
  { re: /\b(resume|cv)\b/i, type: "url", label: "Resume link" },
  {
    re: /\b(why|reason|motivation|tell us|describe|about yourself|experience|feedback|comments?|message|suggestions?|notes?)\b/i,
    type: "textarea",
    label: "Tell us more",
  },
  { re: /\b(rate|rating|out of 5|score|how would you rate)\b/i, type: "rating", label: "Rating" },
  { re: /\b(t-?shirt|tshirt|size)\b/i, type: "select", label: "T-shirt size", options: ["XS", "S", "M", "L", "XL", "XXL"] },
  { re: /\b(gender)\b/i, type: "radio", label: "Gender", options: ["Female", "Male", "Prefer not to say"] },
  { re: /\b(dietary|food preference|veg or non-?veg|meal)\b/i, type: "radio", label: "Meal preference", options: ["Vegetarian", "Non-vegetarian", "Vegan"] },
];

const SPLIT = /\s*(?:\n|;|,|\d+\.\s|\.\s+| and | also |\bthen\b|\bplus\b|•)\s*/gi;

const COMMA_HOLD = "\u0001";

// "which track: Beginner, Intermediate or Advanced" must survive the comma
// split as one chunk, so hide its separators before splitting and restore
// them afterwards.
const OPTION_SPAN =
  /((?:which|what|choose|select|pick|prefer|option|options|choices?|either|size|type|category|track|slot)[^.:;\n]{0,60}?(?:[:\-]|\s+from|\s+among|\s+between|\s+one of)\s+)([^.;\n]+)/gi;

function protectOptionSpans(text) {
  return text.replace(OPTION_SPAN, (whole, head, list) => {
    const looksLikeList = /\s(?:or|and)\s|,|\//.test(list);
    if (!looksLikeList) return whole;
    return head + list.replace(/,/g, COMMA_HOLD).replace(/\s+and\s+/gi, COMMA_HOLD + " ");
  });
}

function restore(text) {
  return text
    .split(COMMA_HOLD)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:and|also|or|plus|then)\s+/i, "");
}

function extractTitle(text) {
  const lead = text.match(/^\s*(.{4,60}?)\s*[-–—:]\s+/);
  if (lead) {
    const t = lead[1].replace(/^(make|create|build|i want|i need)\s+(a|an)?\s*/i, "").trim();
    if (t.split(" ").length >= 2) return { title: titleCase(t), body: text.slice(lead[0].length) };
  }
  const firstLine = text.split("\n")[0].trim();
  if (firstLine.length > 4 && firstLine.length < 70 && text.includes("\n")) {
    return {
      title: titleCase(firstLine.replace(/^(make|create|build|i want)\s+(a|an)?\s*/i, "")),
      body: text.slice(firstLine.length),
    };
  }
  return { title: "New form", body: text };
}

function splitList(source) {
  return source
    .split(/\s*(?:,|\/|\||\bor\b|\band\b)\s*/i)
    .map((s) => s.replace(/[.]+$/, "").trim())
    .filter((s) => s.length > 0 && s.length < 60);
}

// Returns { options, head } where head is the text before the list, usable
// as the question label.
function extractOptions(chunk) {
  const keyed = chunk.match(
    /^(.*?)\b(?:options?|choices?|either|choose from|select from|dropdown of|one of|pick from)\b\s*[:\-]?\s*(.+)$/i
  );
  if (keyed) {
    const parts = splitList(keyed[2]);
    if (parts.length >= 2) return { options: parts.slice(0, 20), head: keyed[1] };
  }

  // "which country they prefer from Turkey, Egypt, Vietnam or Poland"
  const worded = chunk.match(/^(.{2,70}?)\s+(?:from|among|between)\s+(.+)$/i);
  if (worded && /^(which|what|choose|select|pick|prefer|any)/i.test(worded[1].trim())) {
    const parts = splitList(worded[2]);
    if (parts.length >= 2 && parts.every((p) => p.split(" ").length <= 4)) {
      return { options: parts.slice(0, 20), head: worded[1] };
    }
  }

  // "which track they want: Beginner, Intermediate or Advanced"
  const colon = chunk.match(/^(.{2,70}?)\s*[:\-]\s+(.+)$/);
  if (colon) {
    const parts = splitList(colon[2]);
    if (parts.length >= 2 && parts.every((p) => p.split(" ").length <= 4)) {
      return { options: parts.slice(0, 20), head: colon[1] };
    }
  }

  const paren = chunk.match(/^(.*?)\(([^)]{3,200})\)/);
  if (paren) {
    const parts = splitList(paren[2]);
    if (parts.length >= 2) return { options: parts.slice(0, 20), head: paren[1] };
  }

  return null;
}

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function labelFromChunk(chunk) {
  const cleaned = chunk
    .replace(
      /^(?:and|also|or|plus|i want|i need|please|kindly|ask (?:for|them for)?|collect|get|include|add|take|with|their|the|a|an|field for|question about)\s+/gi,
      ""
    )
    .replace(/\b(is\s+)?(required|mandatory|optional|compulsory)\b/gi, "")
    .replace(/\b(they|you)\s+(want|prefer|choose|need|are|would like)\b/gi, "")
    .replace(/\bfrom$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:;]+$/, "");
  if (!cleaned) return null;
  return titleCase(cleaned.slice(0, 80));
}

export function parseInstructions(instructions) {
  const text = String(instructions || "").trim();
  if (!text) return { title: "Untitled form", description: "", fields: [] };

  const { title, body } = extractTitle(text);

  const chunks = protectOptionSpans(body)
    .split(SPLIT)
    .map((c) => restore(c))
    .filter((c) => c.length > 1);

  const fields = [];
  const used = new Set();

  for (const chunk of chunks) {
    const found = extractOptions(chunk);
    const explicitOptions = found ? found.options : null;
    let matched = null;

    for (const p of PATTERNS) {
      if (p.re.test(chunk)) {
        matched = p;
        break;
      }
    }

    const optional = /\b(optional|not required|if any|if applicable)\b/i.test(chunk);

    if (matched) {
      const key = matched.label.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      const options = explicitOptions || matched.options || null;
      fields.push({
        label: matched.label,
        type: options ? (options.length > 5 ? "select" : matched.type === "select" ? "select" : "radio") : matched.type,
        required: !optional,
        options: options || undefined,
      });
      continue;
    }

    if (explicitOptions) {
      const label = labelFromChunk(found.head) || "Choose one";
      const key = label.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      fields.push({
        label,
        type: explicitOptions.length > 5 ? "select" : "radio",
        required: !optional,
        options: explicitOptions,
      });
      continue;
    }

    // Only treat a leftover chunk as a field if it reads like one (short).
    const label = labelFromChunk(chunk);
    if (label && label.split(" ").length <= 8 && fields.length < 20) {
      const key = label.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      fields.push({ label, type: "text", required: !optional });
    }
  }

  if (fields.length === 0) {
    fields.push(
      { label: "Full name", type: "text", required: true },
      { label: "Email", type: "email", required: true },
      { label: "Your message", type: "textarea", required: false }
    );
  }

  return { title, description: "", fields };
}
