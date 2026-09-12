import { createHash } from "crypto";

// We never store anyone's IP address. What goes in the database is a one-way
// hash of it, salted, so two answers can be recognised as coming from the same
// place without that place ever being identifiable from the row.
//
// The salt is whatever secret the project already has. If none is set the hash
// still works — it is just less resistant to someone with the whole table and a
// list of every IPv4 address, which is a threat this app does not face.
const SALT =
  process.env.RESPONSE_SALT ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "formagent-salt-v1"; // deliberately fixed: renaming the product must not
// re-bucket every fingerprint already in the table.

export function senderHash(request) {
  const headers = request?.headers;
  if (!headers) return null;

  const forwarded = headers.get("x-forwarded-for") || "";
  const ip =
    forwarded.split(",")[0].trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "";

  if (!ip) return null;
  return createHash("sha256").update(`${SALT}:${ip}`).digest("hex").slice(0, 32);
}
