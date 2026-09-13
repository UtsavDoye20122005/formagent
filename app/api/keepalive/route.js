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
    // A failing keep-alive has to FAIL, with a status code. Returning 200 and a
    // quiet "ok: false" is how a site dies without anybody noticing: Vercel's
    // cron log would show a green tick every day while the project drifted
    // towards being paused.
    return NextResponse.json(
      { ok: false, reason: "Supabase is not configured." },
      { status: 500 }
    );
  }

  // A real query, not just a reachable endpoint. Supabase counts database
  // activity, so pinging a page that never talks to the database would keep
  // Vercel happy and let Supabase fall asleep anyway.
  const { error } = await client.from("forms").select("id").limit(1);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code || null },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}
