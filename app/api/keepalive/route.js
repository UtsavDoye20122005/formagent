import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supabase pauses a free project after about a week with no database activity.
// A paused project means every form link stops working. This endpoint runs one
// tiny real query so the project always looks in use. Vercel calls it daily
// (see vercel.json); any external uptime pinger hitting this URL works too.
export async function GET() {
  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, reason: "Supabase is not configured." },
      { status: 503 }
    );
  }

  try {
    const { error } = await admin.from("forms").select("id").limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err.message || err).slice(0, 200) },
      { status: 500 }
    );
  }
}
