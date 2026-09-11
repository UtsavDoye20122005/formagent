import { NextResponse } from "next/server";
import { NotSignedIn } from "./db.js";

// Turns a thrown error into the right HTTP response, so every route handler
// can just do the work and let this deal with failure.
export function fail(err) {
  if (err instanceof NotSignedIn || err?.code === "not_signed_in") {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }
  const message = String(err?.message || err).slice(0, 300);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
