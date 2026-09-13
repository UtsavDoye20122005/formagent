import { FIELD_TYPES } from "./schema.js";

// The model needs to know what day it is, or "before the 28th" and "next
// Friday" are unresolvable.
function today() {
  const d = new Date();
  return {
    iso: d.toISOString().slice(0, 10),
    human: d.toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    }),
  };
}

function systemPrompt() {
  const now = today();
  return `You turn a person's plain-language instructions into a web form definition.

Today is ${now.human} (${now.iso}). Use it to resolve anything they say about time.

Reply with ONLY a JSON object, no prose and no code fence, shaped like:
{
  "title": "short form title",
  "description": "one or two sentences shown under the title, or empty string",
  "submitLabel": "Submit",
  "thankYou": "message shown after someone submits",
  "closesAt": "2026-09-28T23:59",
  "fields": [
    {
      "label": "Full name",
      "type": "text",
      "required": true,
      "placeholder": "",
      "help": "",
      "options": []
    }
  ]
}

Rules:
- "type" must be one of: ${FIELD_TYPES.join(", ")}.
- Use "select" for more than 5 choices, "radio" for 5 or fewer, "checkbox" when several answers can be picked at once.
- "options" must be a non-empty array of strings for select, radio and checkbox; an empty array otherwise. Never invent a choice list for a free-text question.
- Use "email" for email, "tel" for phone, "date" for dates, "textarea" for anything long, "rating" for a 1-5 score, "boolean" for a single yes/no.
- Use "file" ONLY for things that are genuinely small: a photo, an ID card, a certificate, a PDF, a resume. The limit is 10 MB.
- For VIDEO or AUDIO, never use "file". A rehearsal video or a song will not fit in 10 MB. Use "url" instead and word the question as a link — for example "Link to your rehearsal video (YouTube or Google Drive)" — with help text telling them to set the link so anyone can view it.
- For a DOCUMENT people send in bulk — a resume, CV, portfolio, certificate, marksheet, transcript, report, assignment, slides, work sample — use "url" and not "file". Hundreds of people each attaching a few megabytes fills the storage allowance in one form and uploads start failing part-way through. Word it as a link, and say in the help text to set Google Drive sharing to "anyone with the link can view". Keep "file" only for small one-off things like a photo or a signed form.
- The instructions may be a rough spoken sentence with no punctuation. Work out what the person actually wants to collect and write proper questions for it, even if they never listed fields.
- If they describe a situation rather than a list ("collect details from people coming to our event"), infer the obvious fields for that situation.
- Everything is required by default. Mark a field optional ONLY when the instructions clearly say it is optional ("if any", "optional", "not compulsory").
- For "number" fields you may add "min" and "max" when the instructions imply a sensible range (age, marks out of 100, team size).
- Never turn a sentence of narration into a question. "I am running a workshop next Saturday" describes the situation; it is not something to ask a respondent.
- LANGUAGE: always write the form itself in English, even when the instructions are in Hindi, Hinglish or any other language. The person describing the form may speak however they like; the people filling it in get clean English.
- DEADLINE: if the instructions imply the form should stop accepting answers at some point — "before the 28th", "by Friday", "till Sunday night", "deadline is 5pm tomorrow" — resolve it against today's date and put it in "closesAt" as "YYYY-MM-DDTHH:MM" in the person's own local time. Use 23:59 when they name a day but not a time. If they mention a date that is NOT a deadline (the date of the event itself), leave "closesAt" out. Never turn a deadline into a question.
- At most 25 fields.
- If the form has more than about 8 questions, break it into pages of related questions by adding "page": 1, 2, 3 to each field. Keep a page to roughly 4-7 questions. For a short form leave "page" out entirely.`;
}

// --- Groq (free tier, no card) ----------------------------------------------

// Groq retires and renames models, and a given account does not always have
// access to every one of them. So instead of betting on a single name we walk
// a list, best first, and move on whenever a model is missing or not allowed.
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

function groqModelList() {
  const preferred = process.env.GROQ_MODEL;
  const list = preferred ? [preferred, ...GROQ_MODELS] : [...GROQ_MODELS];
  return [...new Set(list)];
}

// A 404 or 400 naming the model means "try the next one". Anything else (bad
// key, rate limit, outage) is a real failure and should surface as it is.
function isModelRejection(status, detail) {
  if (status !== 404 && status !== 400) return false;
  return /model|decommission|deprecat/i.test(detail);
}

// Remembering which model answered last time turns a cold three-model probe
// into a single call on every warm request. This is the difference between a
// form arriving in two seconds and the gateway giving up.
let workingModel = null;

export async function generateWithGroq(instructions) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const prompt = String(instructions).slice(0, 12000);
  const order = workingModel
    ? [workingModel, ...groqModelList().filter((m) => m !== workingModel)]
    : groqModelList();

  let lastError = null;

  for (const model of order) {
    // One slow model must not eat the whole request. 22s leaves room to try
    // another before the platform's own ceiling.
    const stop = AbortSignal.timeout(22000);
    let res;
    try {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: stop,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 3000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt() },
            { role: "user", content: prompt },
          ],
        }),
      });
    } catch (err) {
      // A timeout or a network blip is worth trying the next model for.
      lastError = new Error(
        err?.name === "TimeoutError" ? `Groq timed out on ${model}` : String(err?.message || err)
      );
      continue;
    }

    if (res.ok) {
      workingModel = model;
      const data = await res.json();
      return parseLooseJson(data?.choices?.[0]?.message?.content || "");
    }

    const detail = await res.text().catch(() => "");
    if (isModelRejection(res.status, detail)) {
      if (workingModel === model) workingModel = null;
      lastError = new Error(`Groq ${res.status}: ${detail.slice(0, 200)}`);
      continue;
    }
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 300)}`);
  }

  throw lastError || new Error("Groq had no usable model for this account.");
}

// --- Anthropic (optional, only if a key is set) ------------------------------

export async function generateWithClaude(instructions) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: systemPrompt(),
      messages: [{ role: "user", content: String(instructions).slice(0, 12000) }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  return parseLooseJson(text);
}

export function aiProvider() {
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

export function parseLooseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {}
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }
  return null;
}
