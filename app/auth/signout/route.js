import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase/server.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const supabase = await supabaseServer();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
