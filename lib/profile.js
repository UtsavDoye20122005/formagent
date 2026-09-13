// Who a person is, as far as this app is concerned.
//
// Google hands over a name and a picture at sign-in. We keep them, but we do
// not *use* them until the person has said they want them — somebody signing in
// with a personal Gmail should not discover their full legal name and a photo
// they set up in 2014 sitting at the top of a product they are showing a class.
//
// Everything lives in Supabase's own user metadata, so there is no extra table
// and no extra row-level security to get wrong: a person can only ever write
// their own.

export function displayName(user) {
  const chosen = user?.user_metadata?.display_name;
  if (typeof chosen === "string" && chosen.trim()) return chosen.trim();
  return "";
}

// What to show when they have not picked a name yet. Never the Google name.
export function fallbackName(user) {
  const email = user?.email || "";
  const handle = email.split("@")[0] || "there";
  return handle.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim() || "there";
}

export function shownName(user) {
  return displayName(user) || fallbackName(user);
}

export function avatarUrl(user) {
  const chosen = user?.user_metadata?.avatar_url;
  return typeof chosen === "string" && chosen.trim() ? chosen.trim() : "";
}

export function initials(user) {
  const name = shownName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.slice(0, 1) || "?").toUpperCase();
}

// True when the person has never chosen a name, so we can ask once.
export function needsSetup(user) {
  return Boolean(user) && !displayName(user);
}
