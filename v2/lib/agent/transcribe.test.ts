import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TRANSCRIBE_MODEL,
  buildTranscribeRequestBody,
  buildFileDataTranscribeRequestBody,
  buildUploadStartRequest,
  buildUploadFinalizeRequest,
  isUploadedFileActive,
  normalizeAudioMimeType,
  parseTranscribeResponse,
  parseUploadSessionUrl,
  parseUploadedFile,
  transcribeAudio,
  transcribeDelivery,
} from "./transcribe";
import { ProviderNotConfiguredError, ProviderRequestError } from "./provider/types";

// audio/mp4 is iOS Safari's only container; it routes through the Files API.
const audio = { audioBase64: "QUJD", mimeType: "audio/mp4" };
// audio/ogg is on Gemini's documented inline set; it stays on the fast inline path.
const inlineAudio = { audioBase64: "QUJD", mimeType: "audio/ogg" };

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

  it("posts inline audio (documented container) to the generateContent endpoint with the key in the header, and returns the transcript", async () => {
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "what's my day look like" }] } }] }),
        { status: 200 },
      ),
    );

    const text = await transcribeAudio({ ...inlineAudio, apiKey: "key-123", fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(text).toBe("what's my day look like");
    // An accepted inline container is a SINGLE round trip — no Files API upload.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain(`/models/${DEFAULT_TRANSCRIBE_MODEL}:generateContent`);
    expect(url).not.toContain("key-123"); // key never lands in the URL
    expect(init?.headers).toMatchObject({ "x-goog-api-key": "key-123" });
  });

  it("throws ProviderRequestError on a non-200 inline response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 403 }));
    await expect(
      transcribeAudio({ ...inlineAudio, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("throws ProviderRequestError when the network call fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      transcribeAudio({ ...inlineAudio, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });
});

// --- Container/format handling: the iPhone fix ------------------------------
// iOS Safari MediaRecorder only emits audio/mp4 and Chrome emits audio/webm —
// neither is on Gemini's documented INLINE-audio list, so the old code's inline
// call could be rejected. Both ARE accepted via the Files API (audio MIME
// preserved), so unsupported containers route there while documented inline
// containers keep the single-request fast path.

describe("normalizeAudioMimeType", () => {
  it("lowercases and strips codec/parameters down to the base type", () => {
    expect(normalizeAudioMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeAudioMimeType("AUDIO/MP4")).toBe("audio/mp4");
    expect(normalizeAudioMimeType("audio/ogg; codecs=opus")).toBe("audio/ogg");
    expect(normalizeAudioMimeType("  audio/mp4  ")).toBe("audio/mp4");
  });
});

describe("transcribeDelivery", () => {
  it("keeps documented inline containers on the inline path", () => {
    for (const mime of ["audio/wav", "audio/mp3", "audio/mpeg", "audio/aac", "audio/ogg", "audio/flac"]) {
      expect(transcribeDelivery(mime)).toBe("inline");
    }
  });

  it("routes the browser-recorder containers (iOS mp4, Chrome webm, m4a, opus) through the Files API", () => {
    expect(transcribeDelivery("audio/mp4")).toBe("files");
    expect(transcribeDelivery("audio/webm;codecs=opus")).toBe("files");
    expect(transcribeDelivery("audio/m4a")).toBe("files");
    expect(transcribeDelivery("audio/opus")).toBe("files");
  });
});

describe("buildUploadStartRequest", () => {
  it("targets the Files upload endpoint with the key in the header (never the URL) and the resumable start command", () => {
    const { url, init } = buildUploadStartRequest("key-123", "audio/mp4", 1234);
    expect(url).toBe("https://generativelanguage.googleapis.com/upload/v1beta/files");
    expect(url).not.toContain("key-123");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("key-123");
    expect(headers["X-Goog-Upload-Protocol"]).toBe("resumable");
    expect(headers["X-Goog-Upload-Command"]).toBe("start");
    expect(headers["X-Goog-Upload-Header-Content-Length"]).toBe("1234");
    // The ORIGINAL audio MIME is preserved — never relabeled to video/*.
    expect(headers["X-Goog-Upload-Header-Content-Type"]).toBe("audio/mp4");
  });
});

describe("parseUploadSessionUrl", () => {
  it("reads the resumable upload URL from the response headers (case-insensitive)", () => {
    const headers = new Headers({ "x-goog-upload-url": "https://upload.example/session/abc" });
    expect(parseUploadSessionUrl(headers)).toBe("https://upload.example/session/abc");
  });

  it("throws a request error when the upload session URL is missing", () => {
    expect(() => parseUploadSessionUrl(new Headers())).toThrow(ProviderRequestError);
  });
});

describe("buildUploadFinalizeRequest", () => {
  it("uploads and finalizes the bytes at offset 0", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { url, init } = buildUploadFinalizeRequest("https://upload.example/session/abc", bytes);
    expect(url).toBe("https://upload.example/session/abc");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Upload-Offset"]).toBe("0");
    expect(headers["X-Goog-Upload-Command"]).toBe("upload, finalize");
    expect(init.body).toBe(bytes);
  });
});

describe("parseUploadedFile", () => {
  it("extracts the file uri, name, mime, and state", () => {
    const file = parseUploadedFile({
      file: { name: "files/abc", uri: "https://files/abc", mimeType: "audio/mp4", state: "ACTIVE" },
    });
    expect(file).toEqual({
      name: "files/abc",
      uri: "https://files/abc",
      mimeType: "audio/mp4",
      state: "ACTIVE",
    });
  });

  it("also accepts an unwrapped File resource (the poll GET shape)", () => {
    const file = parseUploadedFile({
      name: "files/abc",
      uri: "https://files/abc",
      mimeType: "audio/mp4",
      state: "PROCESSING",
    });
    expect(file.state).toBe("PROCESSING");
    expect(file.uri).toBe("https://files/abc");
  });

  it("throws a request error when there is no usable file uri", () => {
    expect(() => parseUploadedFile({ file: { name: "files/abc", state: "FAILED" } })).toThrow(
      ProviderRequestError,
    );
  });
});

describe("isUploadedFileActive", () => {
  it("is true only for ACTIVE", () => {
    expect(isUploadedFileActive("ACTIVE")).toBe(true);
    expect(isUploadedFileActive("PROCESSING")).toBe(false);
    expect(isUploadedFileActive("FAILED")).toBe(false);
  });
});

describe("buildFileDataTranscribeRequestBody", () => {
  it("references the uploaded file by uri (fileData), not inline bytes, and keeps the verbatim-transcribe instruction", () => {
    const body = buildFileDataTranscribeRequestBody("https://files/abc", "audio/mp4") as {
      systemInstruction: { parts: { text: string }[] };
      contents: { role: string; parts: Array<{ fileData?: { mimeType: string; fileUri: string }; inlineData?: unknown }> }[];
      generationConfig: { temperature: number };
    };
    const part = body.contents[0].parts.find((p) => p.fileData);
    expect(part?.fileData).toEqual({ mimeType: "audio/mp4", fileUri: "https://files/abc" });
    // No inline bytes when going through the Files API.
    expect(body.contents[0].parts.some((p) => p.inlineData)).toBe(false);
    expect(body.systemInstruction.parts[0].text.toLowerCase()).toContain("verbatim");
    expect(body.generationConfig.temperature).toBe(0);
  });
});

describe("transcribeAudio — Files API path (iOS mp4 / Chrome webm)", () => {
  function jsonResponse(json: unknown, status = 200, headers?: Record<string, string>): Response {
    return new Response(JSON.stringify(json), { status, headers });
  }

  it("uploads the clip via the Files API and transcribes by file uri — never sends mp4 inline, key always in the header", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/upload/v1beta/files")) {
        return new Response("", { status: 200, headers: { "x-goog-upload-url": "https://upload.example/s1" } });
      }
      if (String(url) === "https://upload.example/s1") {
        return jsonResponse({ file: { name: "files/abc", uri: "https://files/abc", mimeType: "audio/mp4", state: "ACTIVE" } });
      }
      // generateContent
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "how busy am I today" }] } }] });
    });

    const text = await transcribeAudio({ ...audio, apiKey: "key-xyz", fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(text).toBe("how busy am I today");
    // start upload → finalize upload → generateContent
    expect(calls.map((c) => c.url)).toEqual([
      "https://generativelanguage.googleapis.com/upload/v1beta/files",
      "https://upload.example/s1",
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_TRANSCRIBE_MODEL}:generateContent`,
    ]);
    // The key rides in the header on every Gemini call and never in any URL.
    for (const c of calls) {
      expect(c.url).not.toContain("key-xyz");
    }
    expect((calls[0].init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("key-xyz");
    expect((calls[2].init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("key-xyz");
    // The transcription request references the uploaded file, NOT inline mp4 bytes.
    const genBody = JSON.parse(String(calls[2].init?.body)) as {
      contents: { parts: Array<{ fileData?: { fileUri: string }; inlineData?: unknown }> }[];
    };
    expect(genBody.contents[0].parts.some((p) => p.inlineData)).toBe(false);
    expect(genBody.contents[0].parts.find((p) => p.fileData)?.fileData?.fileUri).toBe("https://files/abc");
  });

  it("polls while the uploaded file is PROCESSING, then transcribes once ACTIVE", async () => {
    let polls = 0;
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
      const u = String(url);
      if (u.endsWith("/upload/v1beta/files")) {
        return new Response("", { status: 200, headers: { "x-goog-upload-url": "https://upload.example/s1" } });
      }
      if (u === "https://upload.example/s1") {
        return jsonResponse({ file: { name: "files/abc", uri: "https://files/abc", mimeType: "audio/mp4", state: "PROCESSING" } });
      }
      if (u.endsWith("/v1beta/files/abc")) {
        polls += 1;
        return jsonResponse({ name: "files/abc", uri: "https://files/abc", mimeType: "audio/mp4", state: polls >= 2 ? "ACTIVE" : "PROCESSING" });
      }
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "all good" }] } }] });
    });

    const text = await transcribeAudio({
      ...audio,
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollDelayMs: 0,
    });
    expect(text).toBe("all good");
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  it("throws ProviderRequestError when the Files upload is rejected (e.g. billing/format)", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      String(url).endsWith("/upload/v1beta/files")
        ? new Response("denied", { status: 403 })
        : new Response("{}", { status: 200 }),
    );
    await expect(
      transcribeAudio({ ...audio, apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("throws ProviderNotConfiguredError before any upload when no key is set", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(
      transcribeAudio({ ...audio, apiKey: "", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
