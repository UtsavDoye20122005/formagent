import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from "./config.js";

// Acts as the signed-in user. Row Level Security applies, so a query can only
// ever return rows that belong to them.
export async function supabaseServer() {
  if (!isConfigured()) return null;
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session instead, so this is fine.
        }
      },
    },
  });
}

// A plain, logged-out client. This is what the public form page and the submit
// endpoint use. It has no special powers: the database's own rules let it read
// a form that is open and add an answer to one, and nothing else. Using this
// rather than a secret key means a missing or mistyped key can never take the
// public forms down.
export function supabasePublic() {
  if (!isConfigured()) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Bypasses Row Level Security. Optional — nothing in the normal app needs it.
// Kept for admin scripts and future maintenance work.
// Never import this into a client component.
export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !serviceKey) return null;
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function currentUser() {
  const supabase = await supabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}
