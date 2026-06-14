import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRANSCRIBE_MODEL,
  buildTranscribeRequestBody,
  parseTranscribeResponse,
  transcribeAudio,
} from "./transcribe";
import { ProviderNotConfiguredError, ProviderRequestError } from "./provider/types";

const audio = { audioBase64: "QUJD", mimeType: "audio/mp4" };

type TranscribeBody = {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: string; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }[];
  generationConfig: { maxOutputTokens: number; temperature: number; thinkingConfig: { thinkingBudget: number } };
};

describe("buildTranscribeRequestBody", () => {
  it("carries the audio through verbatim as an inlineData part (no re-encoding of the container)", () => {
    const body = buildTranscribeRequestBody(audio) as TranscribeBody;
    const part = body.contents[0].parts.find((p) => p.inlineData);
    expect(part?.inlineData).toEqual({ mimeType: "audio/mp4", data: "QUJD" });
    expect(body.contents[0].role).toBe("user");
  });

  it("instructs the model to transcribe verbatim, not to answer the question", () => {
    const body = buildTranscribeRequestBody(audio) as TranscribeBody;
    const instruction = body.systemInstruction.parts[0].text.toLowerCase();
    expect(instruction).toContain("transcrib");
    // The audio is data, never an instruction — same trust boundary as the agent.
    expect(instruction).toContain("verbatim");
  });

  it("decodes deterministically: temperature 0 and thinking disabled", () => {
    const body = buildTranscribeRequestBody(audio) as TranscribeBody;
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThan(0);
  });
});

describe("parseTranscribeResponse", () => {
  it("returns the trimmed transcript text", () => {
    const text = parseTranscribeResponse({
      candidates: [{ content: { parts: [{ text: "  how much did I make today  " }] } }],
    });
    expect(text).toBe("how much did I make today");
  });

  it("joins multiple text parts in order", () => {
    const text = parseTranscribeResponse({
      candidates: [{ content: { parts: [{ text: "how busy " }, { text: "am I" }] } }],
    });
    expect(text).toBe("how busy am I");
  });

  it("returns an empty string for a silent clip (candidate with no text) — the caller handles 'didn't catch that'", () => {
    expect(parseTranscribeResponse({ candidates: [{ content: { parts: [] } }] })).toBe("");
  });

  it("throws a request error when the response was blocked / has no candidate", () => {
    expect(() => parseTranscribeResponse({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(
      ProviderRequestError,
    );
    expect(() => parseTranscribeResponse({})).toThrow(ProviderRequestError);
  });
});

describe("transcribeAudio", () => {
  it("throws ProviderNotConfiguredError when no API key is available", async () => {
    await expect(transcribeAudio({ ...audio, apiKey: "" })).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });

  it("posts the audio to the Gemini generateContent endpoint with the key in the header, and returns the transcript", async () => {
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "what's my day look like" }] } }] }),
        { status: 200 },
      ),
    );

    const text = await transcribeAudio({ ...audio, apiKey: "key-123", fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(text).toBe("what's my day look like");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain(`/models/${DEFAULT_TRANSCRIBE_MODEL}:generateContent`);
    expect(url).not.toContain("key-123"); // key never lands in the URL
    expect(init?.headers).toMatchObject({ "x-goog-api-key": "key-123" });
  });

  it("throws ProviderRequestError on a non-200 response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 403 }));
    await expect(
      transcribeAudio({ ...audio, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("throws ProviderRequestError when the network call fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      transcribeAudio({ ...audio, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });
});
