import { FIELD_TYPES } from "./schema.js";

const SYSTEM = `You turn a person's plain-language instructions into a web form definition.

Reply with ONLY a JSON object, no prose and no code fence, shaped like:
{
  "title": "short form title",
  "description": "one or two sentences shown under the title, or empty string",
  "submitLabel": "Submit",
  "thankYou": "message shown after someone submits",
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
- The instructions may be a rough spoken sentence with no punctuation. Work out what the person actually wants to collect and write proper questions for it, even if they never listed fields.
- If they describe a situation rather than a list ("collect details from people coming to our event"), infer the obvious fields for that situation.
- Mark a field optional only when the instructions say so.
- Write labels the way the respondent will read them, in the same language the instructions were written in.
- At most 25 fields.`;

// --- Groq (free tier, no card) ----------------------------------------------

export async function generateWithGroq(instructions) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: String(instructions).slice(0, 12000) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  return parseLooseJson(data?.choices?.[0]?.message?.content || "");
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
      system: SYSTEM,
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
