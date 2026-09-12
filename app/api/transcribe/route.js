import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/supabase/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Turns a recorded audio clip into text using Groq's Whisper. Much better than
// the browser's built-in recognition: it adds punctuation, copes with accents,
// and works in Safari and on phones where the browser API does not exist.

// Whisper was trained on a great many subtitled videos, so when it is handed
// silence it does not return nothing — it returns the thing that most often
// appears over silence at the end of a video. "Thank you." "Thanks for
// watching." A full stop. None of that was said, so none of it is kept.
const HALLUCINATIONS = new Set([
  "thank you", "thank you.", "thanks", "thanks.", "thank you very much",
  "thanks for watching", "thanks for watching!", "thank you for watching",
  "you", "you.", ".", "...", "bye", "bye.", "okay", "ok", "so",
  "please subscribe", "subscribe", "music", "[music]", "(music)",
  "shukriya", "dhanyavaad", "namaste",
]);

function clean(raw) {
  const text = raw.trim();
  if (!text) return "";

  const bare = text.toLowerCase().replace(/[!?.,]+$/g, "").trim();
  if (HALLUCINATIONS.has(bare) || HALLUCINATIONS.has(text.toLowerCase())) return "";

  // A single short word on its own is noise far more often than it is speech.
  if (bare.length < 4 && !/\d/.test(bare)) return "";

  return text;
}

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

  // Under about 8 KB of webm there is no speech in there, only room tone.
  // Sending it anyway is how you get a hallucinated "Thank you."
  if (audio.size < 8000) {
    return NextResponse.json({ text: "" });
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
    // Two jobs. It steers the vocabulary towards forms, and the romanised
    // Hindi in it tells Whisper to write Hinglish in Latin letters rather than
    // switching to Devanagari halfway through a sentence.
    body.append(
      "prompt",
      "The speaker is describing a web form to collect details from people: naam, email, phone number, college, branch, year of study, aur options. " +
        "Mujhe ek form chahiye jisme naam aur phone number poochna hai. Write Hindi words in English letters, like this sentence."
    );

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body,
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ text: clean(String(data?.text || "")) });
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
