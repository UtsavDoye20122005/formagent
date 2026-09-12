import { NextResponse } from "next/server";
import { generateWithGroq, generateWithClaude, aiProvider } from "../../../lib/ai.js";
import { parseInstructions } from "../../../lib/parse.js";
import { normalizeForm } from "../../../lib/schema.js";
import { currentUser } from "../../../lib/supabase/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Writing a 15-question form can take a model longer than the default ten
// seconds, and the gateway hanging up mid-thought is the worst failure of all
// — the person has already spoken.
export const maxDuration = 60;

export async function POST(request) {
  // Signed in only — otherwise a stranger could run up the API bill.
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  const instructions = String(body?.instructions || "").trim();
  if (instructions.length < 3) {
    return NextResponse.json(
      { error: "Describe the form you want in a sentence or two." },
      { status: 400 }
    );
  }

  const provider = aiProvider();

  // When an AI is configured, it is the only thing allowed to write questions.
  // The word-matching parser used to step in whenever the AI hiccuped, and it
  // turned narration like "I am running a workshop next Saturday" into a form
  // field. A clear "say that again" beats a broken form every time.
  if (provider) {
    let draft = null;
    let failure = "";

    try {
      draft = provider === "groq"
        ? await generateWithGroq(instructions)
        : await generateWithClaude(instructions);
    } catch (err) {
      failure = String(err?.message || err);
    }

    if (!draft) {
      return NextResponse.json(
        {
          error: failure
            ? "The form builder could not be reached just now. Wait a few seconds and try again."
            : "That did not come through clearly enough to build a form. Try saying it again, listing the details you want to collect.",
          detail: failure.slice(0, 200),
        },
        { status: 503 }
      );
    }

    const form = normalizeForm(draft, instructions);

    if (form.fields.length === 0) {
      return NextResponse.json(
        {
          error:
            "No questions could be worked out from that. Try listing what you want to collect — for example: name, email, phone, which year they are in.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ form, engine: provider, notice: "" });
  }

  // No AI key at all: this is the unconfigured-setup case, so the basic parser
  // is better than nothing, and we say plainly that that is what happened.
  const draft = parseInstructions(instructions);
  const form = normalizeForm(draft, instructions);

  if (form.fields.length === 0) {
    return NextResponse.json(
      { error: "Could not work out any questions from that. Try listing the details you want to collect." },
      { status: 422 }
    );
  }

  const notice =
    "No AI key is set, so a basic word-matching parser built this. Add a free GROQ_API_KEY for forms that actually understand what you said.";

  return NextResponse.json({ form, engine: "rules", notice });
}
