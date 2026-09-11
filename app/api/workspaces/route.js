import { NextResponse } from "next/server";
import { listWorkspaces, createWorkspace } from "../../../lib/db.js";
import { fail, readJson } from "../../../lib/api.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ workspaces: await listWorkspaces() });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    const workspace = await createWorkspace(body?.name);
    return NextResponse.json({ workspace });
  } catch (err) {
    return fail(err);
  }
}
