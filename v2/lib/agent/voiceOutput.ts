// Agentic layer — voice OUTPUT helper (browser SpeechSynthesis, wrapped).
//
// The assistant can read its answer back aloud after a voice-initiated turn. The
// browser SpeechSynthesis API is the whole engine; this wrapper exists for two
// reasons: (1) iOS Safari only unlocks synthesis after a real user gesture, so we
// expose prime() to call from inside the mic-tap, and (2) the prime/speak/cancel
// surface is injectable, so the start/stop/empty-answer logic is unit-tested
// without a browser. Pure presentation concern — it speaks the same answer the UI
// already shows; it reads nothing and changes nothing.

/** Structural subset of `window.speechSynthesis`. */
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
  /** Call inside a user gesture (the mic tap) to unlock synthesis on iOS. */
  prime: () => void;
  /** Speak text aloud; no-ops on empty/whitespace. */
  speak: (text: string, options?: SpeakOptions) => void;
  /** Stop any current speech. */
  cancel: () => void;
};

/** True when the window can synthesize speech. */
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

/** Wrap a SpeechSynthesis engine (or a fake, in tests) with prime/speak/cancel. */
export function createSpeaker(
  synth: SpeechSynthesisLike,
  makeUtterance: (text: string) => UtteranceLike,
): Speaker {
  return {
    prime() {
      // A near-silent utterance spoken from the gesture context primes iOS so a
      // later async speak() (after the network round-trip) is not dropped.
      synth.cancel();
      synth.speak(makeUtterance(" "));
    },
    speak(text, options) {
      const trimmed = text.trim();
      if (!trimmed) return;
      synth.cancel();
      const utterance = makeUtterance(trimmed);
      utterance.onstart = () => options?.onStart?.();
      utterance.onend = () => options?.onEnd?.();
      utterance.onerror = () => options?.onEnd?.();
      synth.speak(utterance);
    },
    cancel() {
      synth.cancel();
    },
  };
}
