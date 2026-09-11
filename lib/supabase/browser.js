"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

let cached = null;

export function supabaseBrowser() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!cached) cached = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
