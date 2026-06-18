// Agentic layer — SPEAK entry point (text-to-speech for read-aloud).
//
// After a voice-initiated turn, the assistant can read its answer back aloud. The
// browser used to do this with the iPhone's robotic Web Speech voices; this route
// replaces that engine with a natural, SERVER-SIDE Google voice that sounds the
// same on every device. The client POSTs the answer TEXT (the same text the UI
// already shows) plus a voice choice, and this route returns synthesized WAV
// audio for the browser to play from inside the user-gesture path.
//
// SAFETY: this is OUTPUT only. It is a NEW entry point into the assistant, so it
// re-applies the SAME rails as the askAgent action, the stream route, and the
// voice route — never diverging:
//   - TIDYTAILS_ENABLE_AGENT must be on, or the route 404s (the feature is dark).
//   - A signed-in operator is required (401 otherwise) — operator-only, so the
//     surface is org-scoped to a real session like every other agent entry.
//   - The text is input-sanitized and size-capped before we touch Google.
// It imports NO read tool, NO write/send action, and never runs the agent — TTS
// cannot read data, trigger a write, or auto-confirm anything. It is downstream of
// the confirm-card flow, not part of it. The agent safety test pins all of this.
//
// MODEL/VOICES (verified at build time against Google's docs,
// ai.google.dev/gemini-api/docs/speech-generation, updated 2026-05-18): Gemini TTS
// `gemini-2.5-flash-preview-tts` on the Generative Language API, with the two
// prebuilt voices "Kore" (female) and "Charon" (male). The client sends
// "female" / "male"; synthesizeSpeech clamps anything else to the default voice
// (the server-side allowlist).
//
// PRIVACY: answers can contain customer names, so synthesis stays under the SAME
// paid, no-training Google processor terms as transcription — same GOOGLE_API_KEY,
// same generativelanguage.googleapis.com host, no new TTS vendor / sub-processor.
// GOOGLE_API_KEY is server-only: it rides the x-goog-api-key header inside
// synthesizeSpeech and is never logged, echoed, or returned.

import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  MAX_TTS_TEXT_LENGTH,
  synthesizeSpeech,
  TTS_OUTPUT_MIME,
} from "@/lib/agent/synthesizeSpeech";
import { ProviderNotConfiguredError } from "@/lib/agent/provider/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

/** A JSON error response with a status (the client falls back to Web Speech on any non-OK). */
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  // Gate: dark unless the flag is explicitly on — same as the page guard, stream
  // route, and voice route. A 404 keeps the feature invisible when off.
  if (!isAgentEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  // Request scope: a real session is what makes this operator-only and org-scoped.
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "Your session ended. Sign in again to use the assistant.");
  }

  // Parse + validate the body BEFORE touching Google.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "We couldn't read that request.");
  }

  const body = (payload ?? {}) as { text?: unknown; voice?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return errorResponse(400, "There is nothing to read aloud.");
  }
  if (text.length > MAX_TTS_TEXT_LENGTH) {
    return errorResponse(413, "That answer is too long to read aloud.");
  }

  // The voice is clamped against the server-side allowlist inside synthesizeSpeech
  // (unknown -> default), so anything the client sends is safe to pass through.
  try {
    const speech = await synthesizeSpeech({
      text,
      voice: body.voice,
      // Env-overridable so a newer Gemini TTS preview can be adopted without a
      // code change; unset -> the verified DEFAULT_TTS_MODEL.
      model: process.env.TIDYTAILS_ASSISTANT_TTS_MODEL?.trim() || undefined,
    });
    return new Response(speech.audio as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": speech.mimeType || TTS_OUTPUT_MIME,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    // Not configured -> 503 so the client cleanly falls back to Web Speech; any
    // other failure -> 502 (same fallback). We never echo the key or the text.
    if (error instanceof ProviderNotConfiguredError) {
      return errorResponse(503, "Voice playback isn't set up yet.");
    }
    return errorResponse(502, "Couldn't read that answer aloud.");
  }
}
