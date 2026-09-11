import { NextResponse } from "next/server";
import { getPublicForm, addPublicResponse, listResponses } from "../../../../../lib/db.js";
import { validateSubmission } from "../../../../../lib/schema.js";
import { fail, readJson } from "../../../../../lib/api.js";

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

  const { errors, answers, ok } = validateSubmission(form, body.answers || {});
  if (!ok) return NextResponse.json({ errors }, { status: 422 });

  try {
    await addPublicResponse(id, answers);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save your response: ${String(err.message || err).slice(0, 200)}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, thankYou: form.thankYou });
}

// Owner only.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const result = await listResponses(id);
    if (!result) return NextResponse.json({ error: "Form not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    return fail(err);
  }
}
