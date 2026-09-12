import { NextResponse } from "next/server";
import { getPublicForm, addPublicResponse, listResponses } from "../../../../../lib/db.js";
import { validateSubmission } from "../../../../../lib/schema.js";
import { fail, readJson } from "../../../../../lib/api.js";
import { senderHash } from "../../../../../lib/sender.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: anyone with the link can submit. No account needed.
export async function POST(request, { params }) {
  const { id } = await params;

  const form = await getPublicForm(id);
  if (!form) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  if (!form.open) return NextResponse.json({ error: "This form is closed." }, { status: 403 });

  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: "Send JSON." }, { status: 400 });

  // Two quiet bot checks. Neither is visible to a real person filling the form.
  //
  // 1. A hidden text box no human ever sees. Scripts fill in every input they
  //    find, so anything in it means this was not typed by a person.
  // 2. Nobody reads and answers a form in under three seconds.
  if (String(body.website || "").trim()) {
    // Answer as if it worked. A bot told "rejected" just tries again smarter.
    return NextResponse.json({ ok: true, thankYou: form.thankYou });
  }

  const elapsed = Number(body.elapsedMs);
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 3000) {
    return NextResponse.json(
      { error: "That was too quick — have another look at your answers and send again." },
      { status: 429 }
    );
  }

  const { errors, answers, ok } = validateSubmission(form, body.answers || {});
  if (!ok) return NextResponse.json({ errors }, { status: 422 });

  try {
    await addPublicResponse(id, answers, senderHash(request));
  } catch (err) {
    const message = String(err.message || err);
    const throttled = /short time|unusual number/.test(message);
    return NextResponse.json(
      { error: throttled ? message : `Could not save your response: ${message.slice(0, 200)}` },
      { status: throttled ? 429 : 500 }
    );
  }

  return NextResponse.json({ ok: true, thankYou: form.thankYou });
}

// Owner only.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const result = await listResponses(id, {
      page: url.searchParams.get("page"),
      size: url.searchParams.get("size"),
      all: url.searchParams.get("all") === "1",
    });
    if (!result) return NextResponse.json({ error: "Form not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}
