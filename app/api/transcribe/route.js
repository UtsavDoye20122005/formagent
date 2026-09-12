import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/supabase/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Turns a recorded audio clip into text using Groq's Whisper. Much better than
// the browser's built-in recognition: it adds punctuation, copes with accents,
// and works in Safari and on phones where the browser API does not exist.
export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Voice transcription is not set up." }, { status: 503 });
  }

  let incoming;
  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the audio as form data." }, { status: 400 });
  }

  const audio = incoming.get("audio");
  if (!audio || typeof audio === "string") {
    return NextResponse.json({ error: "No audio was sent." }, { status: 400 });
  }
  if (audio.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "That recording is too long. Keep it under a couple of minutes." }, { status: 413 });
  }

  // Not every Groq account has every Whisper model, so try them in turn.
  const models = [
    process.env.GROQ_WHISPER_MODEL,
    "whisper-large-v3-turbo",
    "whisper-large-v3",
  ].filter(Boolean);

  let lastDetail = "";

  for (const model of [...new Set(models)]) {
    const body = new FormData();
    body.append("file", audio, "speech.webm");
    body.append("model", model);
    body.append("response_format", "json");
    body.append(
      "prompt",
      "The speaker is describing a web form to collect details from people, such as name, email, phone, college, year of study, and multiple choice options."
    );

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ text: String(data?.text || "").trim() });
    }

    lastDetail = await res.text().catch(() => "");
    const missingModel =
      (res.status === 404 || res.status === 400) && /model|decommission|deprecat/i.test(lastDetail);
    if (!missingModel) break;
  }

  return NextResponse.json(
    { error: `Could not transcribe that: ${lastDetail.slice(0, 200)}` },
    { status: 502 }
  );
}
