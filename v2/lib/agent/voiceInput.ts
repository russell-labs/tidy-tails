// Agentic layer — voice INPUT helpers (pure, no DOM at module load).
//
// The mic flow lives in the AssistantChat client component, but the decisions
// that need to be correct and tested live here as pure functions: can this
// device record at all, which audio container to ask for, is the clip a sane
// size, and what to tell the operator when the mic fails. Keeping them pure means
// they run in node tests with no jsdom — and the route can reuse the size/mime
// guards so client and server agree.
//
// Imported by BOTH the client (capability + mime choice) and the server route
// (size/mime validation). No browser globals are touched at import time, so it is
// safe in either bundle.

/** Max audio upload, kept under Vercel's serverless request-body limit (~4.5MB). */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/** Hard cap on a single recording so a forgotten-open mic can't produce a huge clip. */
export const MAX_RECORDING_MS = 60_000;

// Containers to request, MOST-preferred first. Gemini's documented inline-audio
// set is wav/mp3/aiff/aac/ogg/flac, so we prefer those when the browser can
// record them. webm (Chrome/Firefox default) and mp4 (iOS Safari's only option)
// are fallbacks — the recorder's actual container is passed to Gemini verbatim,
// and the iOS path is verified in staging (see transcribe.ts format note).
export const PREFERRED_AUDIO_MIME_TYPES = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/aac",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

/** The capability shape we probe — a structural subset of `window`/`navigator`. */
export type VoiceInputEnv = {
  isSecureContext?: boolean;
  mediaDevices?: { getUserMedia?: unknown };
  MediaRecorder?: unknown;
};

export type VoiceInputSupport =
  | { supported: true }
  | { supported: false; reason: "insecure-context" | "no-mediadevices" | "no-mediarecorder" };

/** Whether this device can capture mic audio for server-side transcription. */
export function detectVoiceInputSupport(env: VoiceInputEnv): VoiceInputSupport {
  // getUserMedia only works in a secure context; iOS Safari is strict about it.
  if (env.isSecureContext === false) {
    return { supported: false, reason: "insecure-context" };
  }
  if (typeof env.mediaDevices?.getUserMedia !== "function") {
    return { supported: false, reason: "no-mediadevices" };
  }
  if (typeof env.MediaRecorder !== "function") {
    return { supported: false, reason: "no-mediarecorder" };
  }
  return { supported: true };
}

/** Pick the most-preferred container the recorder supports; undefined → let the recorder default. */
export function pickRecordingMimeType(
  isTypeSupported: (type: string) => boolean,
  preferred: readonly string[] = PREFERRED_AUDIO_MIME_TYPES,
): string | undefined {
  for (const type of preferred) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // A browser whose isTypeSupported throws on an odd string: skip it.
    }
  }
  return undefined;
}

/** A blob mime type that plausibly carries audio. The route forwards nothing else to Gemini. */
export function isLikelyAudioMime(mime: string): boolean {
  return typeof mime === "string" && mime.toLowerCase().startsWith("audio/");
}

/** A non-empty clip within the upload cap. */
export function isAudioWithinLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_AUDIO_BYTES;
}

/** A friendly, type-fallback message for a mic that won't start. */
export function friendlyMicError(error: { name?: string } | undefined): string {
  const name = error?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. You can type your question instead.";
  }
  if (name === "NotFoundError") {
    return "No microphone was found. Type your question instead.";
  }
  return "Couldn't start the mic. Type your question instead.";
}
