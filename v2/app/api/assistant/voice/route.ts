// Agentic layer — VOICE entry point (speech-to-text → read-only agent).
//
// Sam taps the mic, the browser records her question with MediaRecorder, and the
// audio is POSTed here as multipart/form-data. This route transcribes it
// SERVER-SIDE with Gemini (the iPhone Safari Web Speech API is too unreliable to
// trust on-device), then runs the resulting TEXT through the exact same
// same `runAgent` pipeline as a typed question. Voice adds an input mode and
// nothing else: a voice turn can PREPARE a write exactly as a typed turn can, but
// the route still only proposes — the actual write happens later, on Sam's
// confirm tap, through the separate confirm action. No write/send action is
// imported or called anywhere in this path.
//
// SAFETY: this is a THIRD entry point into the agent, so it re-applies the SAME
// gate and request scope as the askAgent action and the stream route — never
// diverging:
//   - TIDYTAILS_ENABLE_AGENT must be on, or the route 404s (the feature is dark).
//   - A signed-in operator is required (401 otherwise); the run executes inside
//     this request, so the read tools inherit that operator's RLS + org_id scope.
//   - The transcript is validated by the shared sanitizeAgentRequest — the same
//     rules as typed input, since after transcription it IS typed input.
// It only ever calls the read-only runAgent — there is no write/send path here,
// and it must not import the service-role client (asserted by the agent safety test).
//
// PRIVACY: the recorded audio is sent to Google for transcription, under the same
// paid, no-training Gemini processor terms as the chat (see transcribe.ts / the
// PRD ToS clause). GOOGLE_API_KEY is required here even when the chat provider is
// Anthropic — reasoning may be Claude, but transcription is always Gemini.

import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import { sanitizeAgentRequest } from "@/lib/agent/agentRequest";
import { runAgent, AgentNotConfiguredError } from "@/lib/agent/runAgent";
import { recordAgentTurn } from "@/lib/agentTurnLog.server";
import { transcribeAudio } from "@/lib/agent/transcribe";
import { ProviderNotConfiguredError } from "@/lib/agent/provider/types";
import { isAudioWithinLimit, isLikelyAudioMime } from "@/lib/agent/voiceInput";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Known, generous budget that comfortably exceeds runAgent's own 45s deadline so
// the run always settles and the stream flushes a terminal {done}/{error} event
// before the platform could kill the function. Valid on Hobby (≤60s) and Pro.
export const maxDuration = 60;

const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
} as const;

const NOT_CONFIGURED_MESSAGE =
  "The assistant isn't set up yet. Ask Russell to finish configuring it.";
const GENERIC_ERROR = "Something went wrong answering that. Please try again.";
const NO_SPEECH_MESSAGE = "I didn't catch that. Try again, a little closer to the mic.";

/** One NDJSON line. */
function line(event: Record<string, unknown>): string {
  return `${JSON.stringify(event)}\n`;
}

/** A single-line NDJSON error response with a status (validation failures, no streaming). */
function errorResponse(status: number, message: string): Response {
  return new Response(line({ type: "error", message }), { status, headers: NDJSON_HEADERS });
}

/** "Not configured" (transcription or chat) → friendly setup message; anything else → generic. */
function friendlyMessage(error: unknown): string {
  return error instanceof ProviderNotConfiguredError || error instanceof AgentNotConfiguredError
    ? NOT_CONFIGURED_MESSAGE
    : GENERIC_ERROR;
}

export async function POST(request: Request): Promise<Response> {
  // Gate: dark unless the flag is explicitly on — same as the page guard and stream route.
  if (!isAgentEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  // Request scope: a real session is what makes the read tools org-scoped.
  const user = await getCurrentUser();
  if (!user) {
    return errorResponse(401, "Your session ended. Sign in again to use the assistant.");
  }

  // Parse the multipart body and validate the audio BEFORE touching Gemini.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "We couldn't read that recording. Try again.");
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return errorResponse(400, NO_SPEECH_MESSAGE);
  }
  if (!isLikelyAudioMime(audio.type)) {
    return errorResponse(415, "That recording isn't a supported audio format.");
  }
  if (!isAudioWithinLimit(audio.size)) {
    return errorResponse(413, "That recording is too long. Keep it short and try again.");
  }

  const mimeType = audio.type;
  const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");

  // History rides as a JSON string field, same shape the stream route accepts.
  let history: unknown = [];
  const historyRaw = form.get("history");
  if (typeof historyRaw === "string") {
    try {
      history = JSON.parse(historyRaw);
    } catch {
      history = [];
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(line(event)));
      // The operator's transcript, once we have it — used to attribute a captured
      // turn (TT-038). Empty until transcription succeeds, so a transcription/
      // validation failure (no real question yet) is not logged as a turn.
      let question = "";
      try {
        // 1) Transcribe the audio to text (server-side, Gemini).
        const transcript = await transcribeAudio({ audioBase64, mimeType });

        // Silence / no recognizable speech: a voice-specific nudge, not the
        // typed-input "type a question" copy.
        if (transcript.trim() === "") {
          write({ type: "error", message: NO_SPEECH_MESSAGE });
          return;
        }

        // 2) Show Sam what we heard before the answer streams.
        write({ type: "transcript", text: transcript });

        // 3) The transcript is now ordinary typed input — same validation, same
        // read-only pipeline. No new power is granted by having arrived as voice.
        const sanitized = sanitizeAgentRequest(transcript, history);
        if (!sanitized.ok) {
          write({ type: "error", message: sanitized.message });
          return;
        }
        question = sanitized.message;

        const result = await runAgent(sanitized.message, sanitized.history, {
          onEvent: (event) =>
            write(
              event.type === "tool"
                ? { type: "tool", name: event.name }
                : { type: "thinking" },
            ),
        });
        const toolsUsed = Array.from(new Set(result.toolCalls.map((call) => call.name)));
        write({
          type: "done",
          answer: result.text,
          toolsUsed,
          // A voice-initiated turn may PREPARE a write (book/tip/log). The route
          // never executes it — the proposal rides back so the UI surfaces the
          // same confirm card a typed turn would. Voice does not bypass confirm.
          proposal: result.proposal,
        });
        // TT-038: capture the turn after the answer is on the wire. The audio is
        // never logged — only the operator's transcript, tools, and outcome.
        await recordAgentTurn({
          question,
          toolsUsed,
          outcome: result.proposal ? "proposed" : "answered",
        });
      } catch (error) {
        write({ type: "error", message: friendlyMessage(error) });
        // Only an error AFTER we had the operator's question is a model turn that
        // "couldn't do it"; a transcription/setup failure has no question to log.
        if (question) {
          await recordAgentTurn({ question, toolsUsed: [], outcome: "error" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
