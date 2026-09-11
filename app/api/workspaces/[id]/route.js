import { NextResponse } from "next/server";
import { renameWorkspace, deleteWorkspace } from "../../../../lib/db.js";
import { fail, readJson } from "../../../../lib/api.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const workspace = await renameWorkspace(id, body?.name);
    return NextResponse.json({ workspace });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await deleteWorkspace(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
