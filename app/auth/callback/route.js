import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase/server.js";

export const dynamic = "force-dynamic";

// Where Google (and the email confirmation link) sends people back to.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.redirect(`${origin}/login`);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=sign_in_failed`);
  }

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
