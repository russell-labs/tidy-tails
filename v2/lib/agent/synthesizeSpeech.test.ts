import { describe, expect, it, vi } from "vitest";
import {
  ASSISTANT_VOICES,
  DEFAULT_ASSISTANT_VOICE,
  DEFAULT_TTS_MODEL,
  MAX_TTS_TEXT_LENGTH,
  TTS_OUTPUT_MIME,
  buildSynthesizeRequestBody,
  clampSpeechText,
  isAssistantVoice,
  parsePcmSampleRate,
  parseSynthesizeResponse,
  pcmToWav,
  resolveVoice,
  synthesizeSpeech,
} from "./synthesizeSpeech";
import { ProviderNotConfiguredError, ProviderRequestError } from "./provider/types";

type SynthBody = {
  contents: { role: string; parts: { text: string }[] }[];
  generationConfig: {
    responseModalities: string[];
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } };
  };
};

/** A small base64 PCM clip the fake Gemini returns. */
const PCM_B64 = Buffer.from(new Uint8Array([1, 2, 3, 4])).toString("base64");

/** A fake successful TTS response (inline base64 PCM + a rate mime). */
function fakeTtsResponse(data = PCM_B64, mimeType = "audio/L16;rate=24000") {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }],
    }),
  } as unknown as Response;
}

describe("voice allowlist (server-side)", () => {
  it("maps the two operator-facing keys to clearly-male/female prebuilt voices", () => {
    expect(ASSISTANT_VOICES.female).toBe("Kore");
    expect(ASSISTANT_VOICES.male).toBe("Charon");
  });

  it("recognizes only the two allowlisted keys", () => {
    expect(isAssistantVoice("female")).toBe(true);
    expect(isAssistantVoice("male")).toBe(true);
    expect(isAssistantVoice("robot")).toBe(false);
    expect(isAssistantVoice(undefined)).toBe(false);
    expect(isAssistantVoice("Kore")).toBe(false); // raw voice name is not a key
  });

  it("clamps anything unknown to the default voice (never trusts client input)", () => {
    expect(resolveVoice("male")).toBe("male");
    expect(resolveVoice("female")).toBe("female");
    expect(resolveVoice("Charon")).toBe(DEFAULT_ASSISTANT_VOICE);
    expect(resolveVoice("")).toBe(DEFAULT_ASSISTANT_VOICE);
    expect(resolveVoice(undefined)).toBe(DEFAULT_ASSISTANT_VOICE);
    expect(resolveVoice({ voiceName: "Evil" })).toBe(DEFAULT_ASSISTANT_VOICE);
  });
});

describe("clampSpeechText", () => {
  it("trims and passes short text through", () => {
    expect(clampSpeechText("  hi there  ")).toBe("hi there");
  });
  it("returns empty for whitespace/nullish (caller skips the call)", () => {
    expect(clampSpeechText("   ")).toBe("");
    expect(clampSpeechText("")).toBe("");
    expect(clampSpeechText(undefined as unknown as string)).toBe("");
  });
  it("caps over-long text to the max length", () => {
    const long = "a".repeat(MAX_TTS_TEXT_LENGTH + 500);
    expect(clampSpeechText(long).length).toBe(MAX_TTS_TEXT_LENGTH);
  });
});

describe("buildSynthesizeRequestBody", () => {
  it("requests AUDIO with the mapped prebuilt voice and the text as DATA (not an instruction)", () => {
    const body = buildSynthesizeRequestBody("how much did I make today", "male") as SynthBody;
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[0].parts[0].text).toBe("how much did I make today");
    expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      "Charon",
    );
  });

  it("uses the female prebuilt voice for the female key", () => {
    const body = buildSynthesizeRequestBody("hello", "female") as SynthBody;
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      "Kore",
    );
  });
});

describe("parseSynthesizeResponse", () => {
  it("returns the inline base64 audio + mime", () => {
    const inline = parseSynthesizeResponse({
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: PCM_B64 } }] } },
      ],
    });
    expect(inline.data).toBe(PCM_B64);
    expect(inline.mimeType).toBe("audio/L16;rate=24000");
  });

  it("throws when blocked / no candidate", () => {
    expect(() => parseSynthesizeResponse({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(
      ProviderRequestError,
    );
    expect(() => parseSynthesizeResponse({})).toThrow(ProviderRequestError);
  });

  it("throws when the candidate carries no audio part", () => {
    expect(() =>
      parseSynthesizeResponse({ candidates: [{ content: { parts: [{}] } }] }),
    ).toThrow(ProviderRequestError);
  });
});

describe("parsePcmSampleRate", () => {
  it("reads rate=NNNNN out of the mime", () => {
    expect(parsePcmSampleRate("audio/L16;rate=24000")).toBe(24000);
    expect(parsePcmSampleRate("audio/L16; codec=pcm; rate=16000")).toBe(16000);
  });
  it("falls back to 24kHz when no rate is present or it is bad", () => {
    expect(parsePcmSampleRate("audio/pcm")).toBe(24000);
    expect(parsePcmSampleRate("audio/L16;rate=0")).toBe(24000);
    expect(parsePcmSampleRate("")).toBe(24000);
  });
});

describe("pcmToWav", () => {
  it("prepends a 44-byte RIFF/WAVE header and preserves the PCM bytes", () => {
    const pcm = new Uint8Array([10, 20, 30, 40]);
    const wav = pcmToWav(pcm, 24000);
    expect(wav.byteLength).toBe(44 + pcm.byteLength);
    // "RIFF" .... "WAVE"
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...wav.slice(36, 40))).toBe("data");
    // The PCM payload survives verbatim after the header.
    expect(Array.from(wav.slice(44))).toEqual([10, 20, 30, 40]);
    // Sample rate written little-endian at offset 24.
    const view = new DataView(wav.buffer);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint16(20, true)).toBe(1); // PCM format
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });
});

describe("synthesizeSpeech", () => {
  it("throws ProviderNotConfiguredError when no key is set (apiKey: '')", async () => {
    await expect(synthesizeSpeech({ text: "hi", apiKey: "" })).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });

  it("calls the Gemini TTS endpoint with the key in the header (never the URL) and returns playable WAV", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeTtsResponse());
    const result = await synthesizeSpeech({
      text: "you have three dogs today",
      voice: "male",
      apiKey: "secret-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    // Endpoint + model, key NOT in the URL.
    expect(url).toContain(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_TTS_MODEL}:generateContent`,
    );
    expect(url).not.toContain("secret-key");
    // Key rides only in the header (matching transcribe.ts).
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as SynthBody;
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      "Charon",
    );

    // Output is a real WAV container, not raw PCM.
    expect(result.mimeType).toBe(TTS_OUTPUT_MIME);
    expect(String.fromCharCode(...result.audio.slice(0, 4))).toBe("RIFF");
  });

  it("clamps an unknown client voice to the default before requesting", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeTtsResponse());
    await synthesizeSpeech({
      text: "hello",
      voice: "Charon", // raw name / unknown key — must be clamped, not trusted
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as SynthBody;
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
      ASSISTANT_VOICES[DEFAULT_ASSISTANT_VOICE],
    );
  });

  it("throws ProviderRequestError on a non-OK response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(
      synthesizeSpeech({ text: "hi", apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("throws ProviderRequestError on a network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      synthesizeSpeech({ text: "hi", apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("refuses empty text without calling the network", async () => {
    const fetchImpl = vi.fn();
    await expect(
      synthesizeSpeech({ text: "   ", apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
