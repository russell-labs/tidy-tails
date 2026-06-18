// Agentic layer — voice OUTPUT helper (server-side Google TTS, Web Speech fallback).
//
// The assistant reads its answer back aloud after a voice-initiated turn. This
// used to be the browser SpeechSynthesis API end-to-end, which on iPhone Safari
// is stuck with the robotic iOS system voices and sounds different on every
// device. The engine is now a SERVER call: speak() POSTs the answer text (+ the
// chosen voice) to /api/assistant/speak, gets back natural WAV audio, and plays
// it with an HTMLAudioElement — the same voice on every device.
//
// Web Speech is kept as the FALLBACK: if the fetch fails (offline, the route 404s
// because the agent flag is off, a synthesis error), speak() falls back to the
// passed SpeechSynthesis engine so read-aloud never just dies. That is why the
// signature is unchanged — AssistantChat still constructs the speaker with
// `window.speechSynthesis` + a SpeechSynthesisUtterance factory, and still calls
// `speak(answer, { onEnd })`; only the internals changed.
//
// iOS gesture rule: Safari only lets audio start from inside a real user gesture.
// prime() (called from the mic-tap) primes BOTH engines — the near-silent Web
// Speech utterance AND an HTMLAudioElement.play() — so a later async play() after
// the network round-trip is allowed. The voice choice is a CLIENT-SIDE preference
// (localStorage), read here and sent in the POST; nothing is plumbed through the
// chat component, and the route re-validates the voice against its own allowlist.
//
// Pure presentation concern: it reads no data and changes nothing. It speaks the
// same answer the UI already shows, and it can never trigger or auto-confirm a
// write — TTS is output, downstream of the confirm-card flow.
//
// Testability: the network (fetch), the audio element factory, and the
// localStorage reader are injectable seams with safe browser defaults, so the
// fetch-success, fetch-failure-fallback, mute, and empty-answer paths are
// unit-tested without a browser.

/** Structural subset of `window.speechSynthesis` — the Web Speech FALLBACK engine. */
export type SpeechSynthesisLike = {
  speak: (utterance: unknown) => void;
  cancel: () => void;
};

/** Structural subset of a SpeechSynthesisUtterance we set callbacks on. */
export type UtteranceLike = {
  onstart: ((event?: unknown) => void) | null;
  onend: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
};

export type SpeakOptions = { onStart?: () => void; onEnd?: () => void };

export type Speaker = {
  /** Call inside a user gesture (the mic tap) to unlock BOTH audio engines on iOS. */
  prime: () => void;
  /** Speak text aloud; no-ops on empty/whitespace. */
  speak: (text: string, options?: SpeakOptions) => void;
  /** Stop any current speech (server audio and/or Web Speech). */
  cancel: () => void;
};

/** True when the window can synthesize speech (the Web Speech fallback is what we probe). */
export function detectSpeechOutputSupport(win: {
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
}): boolean {
  return (
    typeof win.speechSynthesis === "object" &&
    win.speechSynthesis !== null &&
    typeof win.SpeechSynthesisUtterance === "function"
  );
}

// --- Client-side voice preference (localStorage, no DB) ----------------------
// The male/female choice is a per-device preference set in Settings. It is read
// HERE and sent in the speak request; the route re-validates it against a small
// server-side allowlist (so a tampered value is clamped, not trusted).

/** localStorage key for the assistant read-aloud voice. */
export const VOICE_PREFERENCE_KEY = "tt.assistant.voice";

/** The voice keys the client may request; the server clamps anything else to its default. */
export type VoicePreference = "female" | "male";

/** The default voice when no preference is stored. */
export const DEFAULT_VOICE_PREFERENCE: VoicePreference = "female";

/** Normalize a stored value to an allowlisted voice key (unknown -> default). Pure. */
export function normalizeVoicePreference(value: unknown): VoicePreference {
  return value === "male" ? "male" : "female";
}

/** Read the stored voice preference from localStorage; default on any error/SSR. */
export function readVoicePreference(): VoicePreference {
  try {
    if (typeof window === "undefined") return DEFAULT_VOICE_PREFERENCE;
    return normalizeVoicePreference(window.localStorage.getItem(VOICE_PREFERENCE_KEY));
  } catch {
    return DEFAULT_VOICE_PREFERENCE;
  }
}

/** Persist the voice preference to localStorage (best-effort; no-op on error/SSR). */
export function writeVoicePreference(value: VoicePreference): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VOICE_PREFERENCE_KEY, normalizeVoicePreference(value));
  } catch {
    // Storage disabled (private mode / quota) — the default voice is used instead.
  }
}

// --- Server-TTS audio playback ----------------------------------------------

/** The route the browser fetches audio from (never Google directly — the key stays server-only). */
export const SPEAK_ENDPOINT = "/api/assistant/speak";

/** Structural subset of an HTMLAudioElement we drive for playback. */
export type AudioElementLike = {
  src: string;
  onended: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  play: () => Promise<void> | void;
  pause: () => void;
};

/** Injectable seams (all default to the real browser globals) so playback is unit-testable. */
export type SpeakerDeps = {
  /** POSTs { text, voice } to the speak route; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Creates a fresh audio element; defaults to `new Audio()`. */
  createAudio?: () => AudioElementLike;
  /** Turns audio bytes into a playable object URL; defaults to URL.createObjectURL. */
  createObjectUrl?: (blob: Blob) => string;
  /** Releases an object URL; defaults to URL.revokeObjectURL. */
  revokeObjectUrl?: (url: string) => void;
  /** Reads the client-side voice preference; defaults to readVoicePreference. */
  readVoice?: () => VoicePreference;
};

function defaultCreateAudio(): AudioElementLike {
  // `new Audio()` exists in the browser; the cast keeps the structural type small.
  return new Audio() as unknown as AudioElementLike;
}

/**
 * Wrap the speech engines (or fakes, in tests) with prime/speak/cancel. The
 * SIGNATURE IS UNCHANGED: AssistantChat still passes `window.speechSynthesis` and
 * a SpeechSynthesisUtterance factory — those are now the FALLBACK engine. Optional
 * `deps` supply the server-TTS seams (defaulted to browser globals), so the call
 * site stays byte-identical.
 */
export function createSpeaker(
  synth: SpeechSynthesisLike,
  makeUtterance: (text: string) => UtteranceLike,
  deps: SpeakerDeps = {},
): Speaker {
  const fetchImpl = deps.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  const createAudio = deps.createAudio ?? defaultCreateAudio;
  const createObjectUrl =
    deps.createObjectUrl ??
    ((blob: Blob) =>
      typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(blob)
        : "");
  const revokeObjectUrl =
    deps.revokeObjectUrl ??
    ((url: string) => {
      if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
    });
  const readVoice = deps.readVoice ?? readVoicePreference;

  // The single primed audio element, unlocked inside the gesture and reused so
  // iOS keeps treating playback as gesture-initiated.
  let audioEl: AudioElementLike | null = null;
  // The current object URL, so we can revoke it when playback ends or is cancelled.
  let currentUrl: string | null = null;

  function releaseUrl() {
    if (currentUrl) {
      revokeObjectUrl(currentUrl);
      currentUrl = null;
    }
  }

  /** Speak via the Web Speech fallback engine (the original behavior). */
  function speakWithWebSpeech(text: string, options?: SpeakOptions) {
    synth.cancel();
    const utterance = makeUtterance(text);
    utterance.onstart = () => options?.onStart?.();
    utterance.onend = () => options?.onEnd?.();
    utterance.onerror = () => options?.onEnd?.();
    synth.speak(utterance);
  }

  /** Play already-fetched audio bytes; on any playback error, fall back to Web Speech. */
  function playAudio(blob: Blob, text: string, options?: SpeakOptions) {
    const url = createObjectUrl(blob);
    if (!url || !audioEl) {
      speakWithWebSpeech(text, options);
      return;
    }
    releaseUrl();
    currentUrl = url;
    const el = audioEl;
    let started = false;
    el.onended = () => {
      releaseUrl();
      options?.onEnd?.();
    };
    el.onerror = () => {
      releaseUrl();
      // Playback failed after a successful fetch — still honor read-aloud.
      if (!started) speakWithWebSpeech(text, options);
      else options?.onEnd?.();
    };
    el.src = url;
    try {
      const result = el.play();
      // play() can reject (autoplay policy); fall back rather than going silent.
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).then(
          () => {
            started = true;
            options?.onStart?.();
          },
          () => {
            releaseUrl();
            speakWithWebSpeech(text, options);
          },
        );
      } else {
        started = true;
        options?.onStart?.();
      }
    } catch {
      releaseUrl();
      speakWithWebSpeech(text, options);
    }
  }

  return {
    prime() {
      // (1) Prime the Web Speech fallback: a near-silent utterance spoken from the
      // gesture context unlocks iOS synthesis for a later async fallback.
      synth.cancel();
      synth.speak(makeUtterance(" "));
      // (2) Prime an HTMLAudioElement inside the same gesture so a later async
      // play() (after the network round-trip) is allowed by Safari's autoplay
      // policy. A play()/pause() on an empty element is the standard unlock.
      try {
        if (!audioEl) audioEl = createAudio();
        const result = audioEl.play();
        if (result && typeof (result as Promise<void>).then === "function") {
          (result as Promise<void>).then(
            () => audioEl?.pause(),
            () => {},
          );
        } else {
          audioEl.pause();
        }
      } catch {
        // No Audio support — speak() will use the Web Speech fallback instead.
        audioEl = null;
      }
    },
    speak(text, options) {
      const trimmed = text.trim();
      if (!trimmed) return;
      // Stop anything currently playing on either engine.
      synth.cancel();
      if (audioEl) {
        try {
          audioEl.pause();
        } catch {
          // ignore — about to start fresh
        }
      }
      releaseUrl();

      // No fetch available (SSR / unsupported) -> straight to Web Speech.
      if (!fetchImpl) {
        speakWithWebSpeech(trimmed, options);
        return;
      }

      const voice = readVoice();
      Promise.resolve(
        fetchImpl(SPEAK_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: trimmed, voice }),
        }),
      )
        .then(async (response) => {
          if (!response || !response.ok) {
            // Route 404 (flag off), 401, 5xx, etc. -> fall back to Web Speech.
            speakWithWebSpeech(trimmed, options);
            return;
          }
          const blob = await response.blob();
          playAudio(blob, trimmed, options);
        })
        .catch(() => {
          // Offline / network error -> read-aloud still works via Web Speech.
          speakWithWebSpeech(trimmed, options);
        });
    },
    cancel() {
      synth.cancel();
      if (audioEl) {
        try {
          audioEl.pause();
        } catch {
          // ignore
        }
      }
      releaseUrl();
    },
  };
}
