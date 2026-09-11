import { NextResponse } from "next/server";
import { supabasePublic } from "../../../lib/supabase/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supabase pauses a free project after about a week with no database activity,
// and a paused project means every form link stops working. This runs one tiny
// real query each day so the project always looks in use. Vercel calls it on a
// schedule (see vercel.json); any uptime pinger hitting this URL works too.
export async function GET() {
  const client = supabasePublic();
  if (!client) {
    return NextResponse.json({ ok: false, reason: "Supabase is not configured." });
  }

  const { error } = await client.from("forms").select("id").limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, code: error.code || null });
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}
