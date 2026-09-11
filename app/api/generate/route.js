import { NextResponse } from "next/server";
import { generateWithClaude } from "../../../lib/ai.js";
import { parseInstructions } from "../../../lib/parse.js";
import { normalizeForm } from "../../../lib/schema.js";
import { currentUser } from "../../../lib/supabase/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let engine = "rules";
  let notice = "";
  let draft = null;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      draft = await generateWithClaude(instructions);
      if (draft) engine = "claude";
    } catch (err) {
      notice = "Claude could not be reached, so a basic parser built this instead.";
    }
  } else {
    notice =
      "Running without an Anthropic API key — a basic built-in parser built this. Add ANTHROPIC_API_KEY for much better forms.";
  }

  if (!draft) draft = parseInstructions(instructions);

  const form = normalizeForm(draft, instructions);

  if (form.fields.length === 0) {
    return NextResponse.json(
      { error: "Could not work out any questions from that. Try listing the details you want to collect." },
      { status: 422 }
    );
  }

  return NextResponse.json({ form, engine, notice });
}
