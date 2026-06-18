// Agentic layer — server-side text-to-speech (Gemini TTS).
//
// The assistant reads its answer back aloud after a voice-initiated turn. The
// browser used to do this with the Web Speech API, but on iPhone Safari that is
// stuck with the iOS system voices and sounds robotic — and it sounds different
// on every device. This module replaces that engine: the answer TEXT is sent
// here, we ask Google to synthesize a natural, prebuilt voice, and the audio
// bytes come back for the browser to play. Synthesis is OUTPUT only — it reads
// the same answer the UI already shows; it reads no data and changes nothing,
// and it can never trigger or auto-confirm a write (TTS is downstream of the
// confirm-card flow, not part of it).
//
// Why server-side: same reason as transcription — the iPhone Safari Web Speech
// voices are unreliable/robotic, so we do not trust on-device synthesis. A
// server TTS call returns the SAME voice on every device.
//
// Reuse the SAME Google processor as transcription: answers can contain customer
// names, so synthesis must stay under the terms already accepted for the chat /
// transcription path. We call the Generative Language API (Gemini TTS) with the
// SAME GOOGLE_API_KEY, the SAME generativelanguage.googleapis.com host, and the
// SAME x-goog-api-key header posture as transcribe.ts — no new TTS vendor, so no
// new sub-processor for customer data.
//
// Trust boundary: the text is DATA to read aloud, never an instruction. We pass a
// plain transcript (no director's notes / style prompt that the model could be
// coaxed into reading), set response modality to AUDIO, and pick the voice from a
// fixed server-side allowlist (the client can ask only for the two we offer).
//
// VERIFIED against Google's docs (ai.google.dev/gemini-api/docs/speech-generation,
// last updated 2026-05-18) at build time:
//   - Endpoint: POST {host}/v1beta/models/{model}:generateContent, key in the
//     x-goog-api-key header (identical to transcribe.ts).
//   - Model: gemini-2.5-flash-preview-tts (single-speaker TTS, Generative
//     Language API, same key as transcription). The model id is overridable so a
//     newer TTS preview can be swapped via env without a code change.
//   - Request: generationConfig.responseModalities = ["AUDIO"] +
//     speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName.
//   - Voices (cross-checked male/female): "Kore" (Firm, female — Google's own
//     single-speaker example voice) and "Charon" (Informative, male). These are
//     the two operator-facing options.
//   - Output: base64 audio in candidates[0].content.parts[0].inlineData.data, as
//     RAW 24kHz/16-bit/mono signed-LE PCM (mime like audio/L16;rate=24000). Raw
//     PCM is not playable in a browser <audio>, so we wrap it in a WAV container
//     here and return audio/wav. CI proves the ROUTING + the WAV wrap, never
//     Gemini's acceptance (no key in CI) — a live staging check is still needed
//     before TTS is enabled.

import { ProviderNotConfiguredError, ProviderRequestError } from "./provider/types";

/** Same host as transcription — Generative Language API, same key, same processor terms. */
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Default Gemini TTS model (single-speaker, Generative Language API). Overridable
 * via `model` / TIDYTAILS_ASSISTANT_TTS_MODEL so a newer preview can be adopted
 * without a code change. Verified current at build time (2026-06).
 */
export const DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts";

/**
 * The operator-facing voice choices. This is the SERVER-SIDE ALLOWLIST: the
 * client sends "female" / "male" (from a localStorage preference), the route
 * clamps anything else to the default, and only these two prebuilt Gemini voices
 * are ever requested. Genders cross-checked against Google's voice list:
 *   - female -> "Kore"   (Firm — Google's own single-speaker example voice)
 *   - male   -> "Charon" (Informative — calm, professional male)
 */
export const ASSISTANT_VOICES = {
  female: "Kore",
  male: "Charon",
} as const;

export type AssistantVoice = keyof typeof ASSISTANT_VOICES;

/** The default voice when none/an unknown one is requested. */
export const DEFAULT_ASSISTANT_VOICE: AssistantVoice = "female";

/** Type guard: is this one of the two allowlisted voice keys? */
export function isAssistantVoice(value: unknown): value is AssistantVoice {
  return value === "female" || value === "male";
}

/** Clamp any client-supplied voice to an allowlisted key (unknown -> default). Pure. */
export function resolveVoice(value: unknown): AssistantVoice {
  return isAssistantVoice(value) ? value : DEFAULT_ASSISTANT_VOICE;
}

/**
 * Hard cap on the text we will synthesize in one request. An assistant answer is
 * short; this keeps a runaway/giant answer from ballooning cost or latency, and
 * stays well under the TTS context window. The route also caps before calling.
 */
export const MAX_TTS_TEXT_LENGTH = 2000;

/** The Gemini TTS sample rate (24kHz), bit depth (16), and channels (mono) per the docs. */
const PCM_SAMPLE_RATE = 24000;
const PCM_BITS_PER_SAMPLE = 16;
const PCM_CHANNELS = 1;

/** Mime we return to the client — a real WAV container the browser can play. */
export const TTS_OUTPUT_MIME = "audio/wav";

/** The synthesized audio: the bytes plus the container mime (always WAV here). */
export type SynthesizedSpeech = { audio: Uint8Array; mimeType: string };

/** Trim and clamp the text to synthesize. Empty (after trim) -> "" so the caller can skip the call. Pure. */
export function clampSpeechText(text: string): string {
  const trimmed = String(text ?? "").trim();
  return trimmed.length > MAX_TTS_TEXT_LENGTH ? trimmed.slice(0, MAX_TTS_TEXT_LENGTH) : trimmed;
}

/**
 * Build the generateContent body for a single-speaker TTS call. The transcript is
 * the only content — DATA to read aloud, never an instruction — and the voice is
 * a resolved allowlist key mapped to its prebuilt voice name. Pure — no network,
 * no key.
 */
export function buildSynthesizeRequestBody(
  text: string,
  voice: AssistantVoice,
): Record<string, unknown> {
  return {
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: ASSISTANT_VOICES[voice] },
        },
      },
    },
  };
}

type SynthesizeResponseJson = {
  candidates?: {
    content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
};

/** The inline-audio part of a TTS response: base64 PCM data + its declared mime (e.g. audio/L16;rate=24000). */
export type InlineAudio = { data: string; mimeType: string };

/**
 * Parse the inline audio (base64 PCM + mime) out of a generateContent TTS
 * response. Throws a request error when blocked / no audio came back. Pure.
 */
export function parseSynthesizeResponse(json: SynthesizeResponseJson): InlineAudio {
  const candidate = json?.candidates?.[0];
  if (!candidate) {
    const reason = json?.promptFeedback?.blockReason;
    throw new ProviderRequestError(
      reason
        ? `Speech synthesis returned no audio (blocked: ${reason}).`
        : "Speech synthesis returned no audio.",
    );
  }
  const part = (candidate.content?.parts ?? []).find(
    (p) => typeof p.inlineData?.data === "string" && p.inlineData.data.length > 0,
  );
  if (!part?.inlineData?.data) {
    throw new ProviderRequestError("Speech synthesis returned no audio.");
  }
  return {
    data: part.inlineData.data,
    mimeType: typeof part.inlineData.mimeType === "string" ? part.inlineData.mimeType : "",
  };
}

/** Read a `rate=NNNNN` parameter out of an audio mime; falls back to the documented 24kHz. Pure. */
export function parsePcmSampleRate(mimeType: string, fallback = PCM_SAMPLE_RATE): number {
  const match = /rate=(\d+)/i.exec(String(mimeType ?? ""));
  if (!match) return fallback;
  const rate = Number.parseInt(match[1], 10);
  return Number.isFinite(rate) && rate > 0 ? rate : fallback;
}

/**
 * Wrap raw signed-16-bit-LE mono PCM in a minimal WAV (RIFF) container so the
 * browser can play it from a plain <audio>/Blob. Gemini TTS returns RAW PCM, not
 * a playable container, so this wrap happens server-side before the bytes go to
 * the client. Pure — deterministic byte math, no network.
 */
export function pcmToWav(
  pcm: Uint8Array,
  sampleRate = PCM_SAMPLE_RATE,
  channels = PCM_CHANNELS,
  bitsPerSample = PCM_BITS_PER_SAMPLE,
): Uint8Array {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // RIFF chunk size
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size (PCM)
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const out = new Uint8Array(buffer);
  out.set(pcm, 44);
  return out;
}

export type SynthesizeOptions = {
  /** The answer text to read aloud (trimmed + clamped before synthesis). */
  text: string;
  /** Which allowlisted voice ("female" | "male"); unknown is clamped to the default. */
  voice?: unknown;
  /** Defaults to GOOGLE_API_KEY from the environment. Pass "" to assert the not-configured path. */
  apiKey?: string;
  /** Gemini TTS model id; defaults to DEFAULT_TTS_MODEL (env-overridable by the route). */
  model?: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
};

/** POST a JSON body to the Gemini endpoint with the key in the header; network errors -> ProviderRequestError. */
async function postGemini(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      `Could not reach the speech service: ${error instanceof Error ? error.message : "network error"}`,
    );
  }
}

/**
 * Synthesize one answer to speech via Gemini TTS and return playable WAV bytes.
 * Throws ProviderNotConfiguredError / ProviderRequestError like the transcription
 * adapter. The key is read from GOOGLE_API_KEY and only ever travels in the
 * x-goog-api-key header — never a URL, a log line, or the response.
 */
export async function synthesizeSpeech(options: SynthesizeOptions): Promise<SynthesizedSpeech> {
  const apiKey =
    options.apiKey !== undefined ? options.apiKey : process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderNotConfiguredError("Voice is not configured: GOOGLE_API_KEY is not set.");
  }

  const text = clampSpeechText(options.text);
  if (!text) {
    throw new ProviderRequestError("There is nothing to read aloud.");
  }

  const voice = resolveVoice(options.voice);
  const model = options.model ?? DEFAULT_TTS_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  const url = `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;
  const response = await postGemini(fetchImpl, url, apiKey, buildSynthesizeRequestBody(text, voice));
  if (!response.ok) {
    throw new ProviderRequestError(`Speech synthesis request failed (HTTP ${response.status}).`);
  }

  const json = (await response.json()) as SynthesizeResponseJson;
  const inline = parseSynthesizeResponse(json);
  const pcm = new Uint8Array(Buffer.from(inline.data, "base64"));
  const wav = pcmToWav(pcm, parsePcmSampleRate(inline.mimeType));
  return { audio: wav, mimeType: TTS_OUTPUT_MIME };
}
