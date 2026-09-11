import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which kind of key is sitting in the environment variable. Only the fixed
// prefix is inspected — no part of the secret itself is ever reported.
function keyKind(key) {
  if (!key) return "missing";
  if (key.startsWith("sb_secret_")) return "secret (correct)";
  if (key.startsWith("sb_publishable_")) return "publishable (WRONG — this is the public key)";
  if (key.startsWith("eyJ")) return "legacy JWT";
  return "unrecognised";
}

// Supabase pauses a free project after about a week with no database activity.
// A paused project means every form link stops working. This endpoint runs one
// tiny real query so the project always looks in use. Vercel calls it daily
// (see vercel.json); any external uptime pinger hitting this URL works too.
//
// It always answers 200 so the diagnosis is readable rather than hidden behind
// a generic server error.
export async function GET() {
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";

  const diagnosis = {
    serviceKey: keyKind(rawKey),
    serviceKeyLength: rawKey.length,
    supabaseUrlSet: Boolean(url),
    supabaseHost: url ? url.replace(/^https?:\/\//, "").split(".")[0] : null,
    anonKeySet: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };

  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: "Supabase is not configured.", diagnosis });
  }

  const { error } = await admin.from("forms").select("id").limit(1);

  if (error) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      code: error.code || null,
      hint: error.hint || null,
      diagnosis,
    });
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString(), diagnosis });
}
