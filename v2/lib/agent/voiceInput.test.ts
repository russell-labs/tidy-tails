import { describe, expect, it } from "vitest";
import {
  MAX_AUDIO_BYTES,
  PREFERRED_AUDIO_MIME_TYPES,
  detectVoiceInputSupport,
  friendlyMicError,
  isAudioWithinLimit,
  isLikelyAudioMime,
  pickRecordingMimeType,
} from "./voiceInput";

describe("detectVoiceInputSupport", () => {
  it("is supported when a secure context has getUserMedia and MediaRecorder", () => {
    expect(
      detectVoiceInputSupport({
        isSecureContext: true,
        mediaDevices: { getUserMedia: () => {} },
        MediaRecorder: function () {},
      }),
    ).toEqual({ supported: true });
  });

  it("falls back (typing) when getUserMedia is missing — older / locked-down browsers", () => {
    expect(
      detectVoiceInputSupport({ isSecureContext: true, mediaDevices: {}, MediaRecorder: function () {} }),
    ).toEqual({ supported: false, reason: "no-mediadevices" });
  });

  it("falls back when MediaRecorder is unavailable", () => {
    expect(
      detectVoiceInputSupport({ isSecureContext: true, mediaDevices: { getUserMedia: () => {} } }),
    ).toEqual({ supported: false, reason: "no-mediarecorder" });
  });

  it("falls back on an insecure (http) context — iOS Safari requires https for the mic", () => {
    expect(
      detectVoiceInputSupport({
        isSecureContext: false,
        mediaDevices: { getUserMedia: () => {} },
        MediaRecorder: function () {},
      }),
    ).toEqual({ supported: false, reason: "insecure-context" });
  });
});

describe("pickRecordingMimeType", () => {
  it("prefers a Gemini-accepted container (ogg) when the browser supports it", () => {
    // A browser that supports everything should land on the first preferred type.
    expect(pickRecordingMimeType(() => true)).toBe(PREFERRED_AUDIO_MIME_TYPES[0]);
    expect(PREFERRED_AUDIO_MIME_TYPES[0]).toContain("ogg");
  });

  it("falls back to audio/mp4 on iOS Safari, which only supports that container", () => {
    const supported = new Set(["audio/mp4"]);
    expect(pickRecordingMimeType((t) => supported.has(t))).toBe("audio/mp4");
  });

  it("returns undefined when none are supported, letting the recorder choose its default", () => {
    expect(pickRecordingMimeType(() => false)).toBeUndefined();
  });
});

describe("isLikelyAudioMime", () => {
  it("accepts the containers browsers actually produce", () => {
    for (const mime of ["audio/mp4", "audio/webm", "audio/ogg", "audio/wav;codecs=1"]) {
      expect(isLikelyAudioMime(mime)).toBe(true);
    }
  });

  it("rejects anything that is not audio/* — the route never forwards a non-audio blob", () => {
    for (const mime of ["video/mp4", "application/json", "", "text/plain"]) {
      expect(isLikelyAudioMime(mime)).toBe(false);
    }
  });
});

describe("isAudioWithinLimit", () => {
  it("accepts a normal short clip", () => {
    expect(isAudioWithinLimit(50_000)).toBe(true);
  });

  it("rejects an empty clip and an oversize clip (must stay under the serverless body limit)", () => {
    expect(isAudioWithinLimit(0)).toBe(false);
    expect(isAudioWithinLimit(MAX_AUDIO_BYTES + 1)).toBe(false);
    expect(MAX_AUDIO_BYTES).toBeLessThanOrEqual(4.5 * 1024 * 1024);
  });
});

describe("friendlyMicError", () => {
  it("explains a denied mic and points the operator to typing", () => {
    const msg = friendlyMicError({ name: "NotAllowedError" });
    expect(msg.toLowerCase()).toContain("type");
    expect(msg.toLowerCase()).toMatch(/block|allow|denied|permission/);
  });

  it("explains a missing mic", () => {
    expect(friendlyMicError({ name: "NotFoundError" }).toLowerCase()).toContain("microphone");
  });

  it("has a generic fallback that still offers typing", () => {
    expect(friendlyMicError({ name: "WeirdError" }).toLowerCase()).toContain("type");
    expect(friendlyMicError(undefined).toLowerCase()).toContain("type");
  });
});
