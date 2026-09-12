import { NextResponse } from "next/server";
import { normalizeForm, newId } from "../../../lib/schema.js";
import { listForms, createForm } from "../../../lib/db.js";
import { fail, readJson } from "../../../lib/api.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publish a form and get back its shareable id.
export async function POST(request) {
  try {
    const body = await readJson(request);
    if (!body) return NextResponse.json({ error: "Send JSON." }, { status: 400 });

    const form = normalizeForm(body.form || {}, "");
    // The builder may have had the deadline edited or cleared by hand.
    if (typeof body.closesAt === "string") form.closesAt = body.closesAt.trim();
    if (form.fields.length === 0) {
      return NextResponse.json({ error: "A form needs at least one question." }, { status: 400 });
    }

    const saved = await createForm(form, body.workspaceId || null, newId());
    return NextResponse.json({ id: saved.id, form: saved });
  } catch (err) {
    return fail(err);
  }
}

export async function GET() {
  try {
    return NextResponse.json({ forms: await listForms() });
  } catch (err) {
    return fail(err);
  }
}
