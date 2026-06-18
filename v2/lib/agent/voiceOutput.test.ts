import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VOICE_PREFERENCE,
  SPEAK_ENDPOINT,
  VOICE_PREFERENCE_KEY,
  createSpeaker,
  detectSpeechOutputSupport,
  normalizeVoicePreference,
  readVoicePreference,
  writeVoicePreference,
  type AudioElementLike,
  type SpeakerDeps,
  type UtteranceLike,
} from "./voiceOutput";

/** A minimal fake utterance the fake synth can drive (onend/onstart). */
function fakeUtterance(text: string): UtteranceLike & { text: string } {
  return { text, onstart: null, onend: null, onerror: null };
}

/** A fake audio element that resolves play() and lets a test fire ended/error. */
function fakeAudio(): AudioElementLike & { fireEnded: () => void; fireError: () => void } {
  const el = {
    src: "",
    onended: null as ((e?: unknown) => void) | null,
    onerror: null as ((e?: unknown) => void) | null,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    fireEnded() {
      this.onended?.();
    },
    fireError() {
      this.onerror?.();
    },
  };
  return el;
}

/** Settle queued microtasks (the speak() fetch/play chain is async). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("detectSpeechOutputSupport", () => {
  it("is true when the window exposes speechSynthesis and the utterance constructor", () => {
    expect(
      detectSpeechOutputSupport({ speechSynthesis: {}, SpeechSynthesisUtterance: function () {} }),
    ).toBe(true);
  });

  it("is false when speech synthesis is unavailable", () => {
    expect(detectSpeechOutputSupport({})).toBe(false);
    expect(detectSpeechOutputSupport({ speechSynthesis: {} })).toBe(false);
  });
});

// --- Client-side voice preference (localStorage, no DB) ----------------------

describe("voice preference (localStorage)", () => {
  const store = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it("normalizes any stored value to an allowlisted key (default female)", () => {
    expect(normalizeVoicePreference("male")).toBe("male");
    expect(normalizeVoicePreference("female")).toBe("female");
    expect(normalizeVoicePreference("robot")).toBe("female");
    expect(normalizeVoicePreference(null)).toBe("female");
    expect(DEFAULT_VOICE_PREFERENCE).toBe("female");
  });

  it("defaults when nothing is stored, and round-trips a written choice", () => {
    vi.stubGlobal("window", fakeWindow);
    expect(readVoicePreference()).toBe("female");
    writeVoicePreference("male");
    expect(store.get(VOICE_PREFERENCE_KEY)).toBe("male");
    expect(readVoicePreference()).toBe("male");
  });

  it("falls back to the default if storage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readVoicePreference()).toBe("female");
    expect(() => writeVoicePreference("male")).not.toThrow();
  });
});

// --- Speaker: server TTS with Web Speech fallback ----------------------------

describe("createSpeaker", () => {
  function setup(overrides: Partial<SpeakerDeps> = {}) {
    const synth = { speak: vi.fn(), cancel: vi.fn() };
    const audio = fakeAudio();
    const fetchImpl = vi.fn();
    const deps: SpeakerDeps = {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      createAudio: () => audio,
      createObjectUrl: () => "blob:fake",
      revokeObjectUrl: vi.fn(),
      readVoice: () => "male",
      ...overrides,
    };
    const speaker = createSpeaker(synth, (text) => fakeUtterance(text), deps);
    return { synth, audio, fetchImpl, speaker };
  }

  it("keeps the 2-arg signature working (deps optional, byte-identical call site)", () => {
    const synth = { speak: vi.fn(), cancel: vi.fn() };
    // The exact AssistantChat call shape — no third argument.
    const speaker = createSpeaker(synth, (text) => fakeUtterance(text));
    expect(typeof speaker.speak).toBe("function");
    expect(typeof speaker.prime).toBe("function");
    expect(typeof speaker.cancel).toBe("function");
  });

  it("prime() unlocks BOTH engines inside the gesture (Web Speech + an audio element)", () => {
    const { synth, audio, speaker } = setup();
    speaker.prime();
    expect(synth.speak).toHaveBeenCalledTimes(1); // near-silent Web Speech prime
    expect(audio.play).toHaveBeenCalledTimes(1); // audio element unlock
  });

  it("speak() fetches the server voice and plays it (POSTing text + the chosen voice)", async () => {
    const { synth, audio, fetchImpl, speaker } = setup();
    fetchImpl.mockResolvedValue({ ok: true, blob: async () => new Blob([new Uint8Array([1])]) });
    const onStart = vi.fn();
    const onEnd = vi.fn();

    speaker.prime();
    speaker.speak("You have three dogs today.", { onStart, onEnd });
    await flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(SPEAK_ENDPOINT);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe("You have three dogs today.");
    expect(body.voice).toBe("male");

    // Played through the audio element, not Web Speech.
    expect(audio.play).toHaveBeenCalledTimes(2); // 1 prime + 1 real play
    expect(synth.speak).toHaveBeenCalledTimes(1); // only the prime utterance
    expect(onStart).toHaveBeenCalledTimes(1);

    audio.fireEnded();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("falls back to Web Speech when the route fails (non-OK response)", async () => {
    const { synth, fetchImpl, speaker } = setup();
    fetchImpl.mockResolvedValue({ ok: false, status: 404 }); // flag off -> 404
    const onEnd = vi.fn();

    speaker.speak("how much did I make Friday", { onEnd });
    await flush();

    // Web Speech took over: an utterance was spoken with the answer text.
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const uttered = synth.speak.mock.calls[0][0] as { text: string; onend: () => void };
    expect(uttered.text).toBe("how much did I make Friday");
    uttered.onend();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("falls back to Web Speech when fetch rejects (offline)", async () => {
    const { synth, fetchImpl, speaker } = setup();
    fetchImpl.mockRejectedValue(new Error("offline"));

    speaker.speak("what's my day look like");
    await flush();

    expect(synth.speak).toHaveBeenCalledTimes(1);
    const uttered = synth.speak.mock.calls[0][0] as { text: string };
    expect(uttered.text).toBe("what's my day look like");
  });

  it("falls back to Web Speech when no fetch is available at all (no global fetch)", () => {
    // Simulate an environment with no fetch (older SSR / unsupported): the
    // speaker must still read aloud via the Web Speech fallback engine.
    vi.stubGlobal("fetch", undefined);
    try {
      const synth = { speak: vi.fn(), cancel: vi.fn() };
      const speaker = createSpeaker(synth, (text) => fakeUtterance(text), {
        createAudio: () => fakeAudio(),
      });
      speaker.speak("hello");
      expect(synth.speak).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not speak (or fetch) an empty answer", async () => {
    const { synth, fetchImpl, speaker } = setup();
    speaker.speak("   ");
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("speak() cancels any current speech before starting", async () => {
    const { synth, fetchImpl, speaker } = setup();
    fetchImpl.mockResolvedValue({ ok: true, blob: async () => new Blob([new Uint8Array([1])]) });
    speaker.speak("first");
    await flush();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("cancel() stops Web Speech and any playing audio", () => {
    const { synth, audio, speaker } = setup();
    speaker.prime();
    speaker.cancel();
    expect(synth.cancel).toHaveBeenCalled();
    expect(audio.pause).toHaveBeenCalled();
  });
});
