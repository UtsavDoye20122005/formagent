export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// True once the two public environment variables are set. Used to show a
// friendly setup screen instead of crashing before Supabase is connected.
export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
