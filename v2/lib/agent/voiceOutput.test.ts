import { describe, expect, it, vi } from "vitest";
import { createSpeaker, detectSpeechOutputSupport, type UtteranceLike } from "./voiceOutput";

/** A minimal fake utterance the fake synth can drive (onend/onstart). */
function fakeUtterance(text: string): UtteranceLike & { text: string } {
  return { text, onstart: null, onend: null, onerror: null };
}

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

describe("createSpeaker", () => {
  function setup() {
    const synth = { speak: vi.fn(), cancel: vi.fn() };
    const speaker = createSpeaker(synth, (text) => fakeUtterance(text));
    return { synth, speaker };
  }

  it("prime() speaks once so iOS unlocks synthesis inside the mic-tap gesture", () => {
    const { synth, speaker } = setup();
    speaker.prime();
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it("speak() cancels any current speech, then speaks the given text", () => {
    const { synth, speaker } = setup();
    speaker.speak("You have three dogs today.");
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const uttered = synth.speak.mock.calls[0][0] as { text: string };
    expect(uttered.text).toBe("You have three dogs today.");
  });

  it("invokes onStart and onEnd as the utterance fires them", () => {
    const { synth, speaker } = setup();
    const onStart = vi.fn();
    const onEnd = vi.fn();
    speaker.speak("hi", { onStart, onEnd });
    const u = synth.speak.mock.calls[0][0] as { onstart: () => void; onend: () => void };
    u.onstart();
    u.onend();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("does not speak an empty answer", () => {
    const { synth, speaker } = setup();
    speaker.speak("   ");
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("cancel() stops current speech", () => {
    const { synth, speaker } = setup();
    speaker.cancel();
    expect(synth.cancel).toHaveBeenCalled();
  });
});
