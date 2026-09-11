import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// Keeps the login session fresh on every request. Without this, a signed-in
// user gets logged out as soon as their access token expires.
export async function middleware(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // Network hiccup talking to Supabase — let the request through and let the
    // page itself decide what to show.
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static files, images and the public form pages.
    "/((?!_next/static|_next/image|favicon.ico|f/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
