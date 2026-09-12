import { NextResponse } from "next/server";
import { getPublicForm, updateForm, deleteForm } from "../../../../lib/db.js";
import { fail, readJson } from "../../../../lib/api.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: what the fill-in page reads. Never includes who owns the form.
export async function GET(request, { params }) {
  const { id } = await params;
  const form = await getPublicForm(id);
  if (!form) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  return NextResponse.json({ form });
}

// Owner only: move it, rename it, open/close it, set a deadline or a limit.
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const form = await updateForm(id, {
      workspaceId: body?.workspaceId,
      open: body?.open,
      title: body?.title,
      thankYou: body?.thankYou,
      closesAt: body?.closesAt,
      maxResponses: body?.maxResponses,
      accent: body?.accent,
    });
    if (!form) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    return NextResponse.json({ form });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await deleteForm(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
