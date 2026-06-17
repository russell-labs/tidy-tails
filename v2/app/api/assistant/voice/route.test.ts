import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/writeGate", () => ({ isAgentEnabled: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/agent/transcribe", () => ({ transcribeAudio: vi.fn() }));
vi.mock("@/lib/agent/runAgent", () => ({
  runAgent: vi.fn(),
  AgentNotConfiguredError: class AgentNotConfiguredError extends Error {},
}));
vi.mock("@/lib/agentTurnLog.server", () => ({ recordAgentTurn: vi.fn() }));

import { POST } from "./route";
import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import { transcribeAudio } from "@/lib/agent/transcribe";
import { runAgent, AgentNotConfiguredError } from "@/lib/agent/runAgent";
import { recordAgentTurn } from "@/lib/agentTurnLog.server";
import { ProviderNotConfiguredError } from "@/lib/agent/provider/types";
import { MAX_AUDIO_BYTES } from "@/lib/agent/voiceInput";

const isAgentEnabledMock = vi.mocked(isAgentEnabled);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const transcribeAudioMock = vi.mocked(transcribeAudio);
const runAgentMock = vi.mocked(runAgent);
const recordAgentTurnMock = vi.mocked(recordAgentTurn);

/** Build a multipart voice request. Let undici set the boundary content-type. */
function voiceRequest(
  opts: { bytes?: Uint8Array; mimeType?: string; omitAudio?: boolean; history?: unknown } = {},
): Request {
  const form = new FormData();
  if (!opts.omitAudio) {
    const bytes = opts.bytes ?? new Uint8Array([1, 2, 3, 4]);
    form.append("audio", new Blob([bytes as BlobPart], { type: opts.mimeType ?? "audio/mp4" }), "clip");
  }
  if (opts.history !== undefined) form.append("history", JSON.stringify(opts.history));
  return new Request("http://localhost/api/assistant/voice", { method: "POST", body: form });
}

async function readEvents(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  vi.clearAllMocks();
  isAgentEnabledMock.mockReturnValue(true);
  getCurrentUserMock.mockResolvedValue({ id: "operator-1" } as Awaited<
    ReturnType<typeof getCurrentUser>
  >);
  transcribeAudioMock.mockResolvedValue("how much did I make today");
  runAgentMock.mockResolvedValue({ text: "You made $240 today.", toolCalls: [] });
});

describe("POST /api/assistant/voice — gate and request scope (same rails as the stream route)", () => {
  it("404s and never transcribes or runs the agent when the flag is off", async () => {
    isAgentEnabledMock.mockReturnValue(false);
    const response = await POST(voiceRequest());
    expect(response.status).toBe(404);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("401s when there is no signed-in operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await POST(voiceRequest());
    expect(response.status).toBe(401);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
    expect(runAgentMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/assistant/voice — audio validation (before any transcription)", () => {
  it("rejects a request with no audio", async () => {
    const response = await POST(voiceRequest({ omitAudio: true }));
    expect(response.status).toBe(400);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });

  it("rejects a non-audio blob without forwarding it to Gemini", async () => {
    const response = await POST(voiceRequest({ mimeType: "application/json" }));
    expect(response.status).toBe(415);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });

  it("rejects an oversize clip (stays under the serverless body limit)", async () => {
    const response = await POST(voiceRequest({ bytes: new Uint8Array(MAX_AUDIO_BYTES + 1) }));
    expect(response.status).toBe(413);
    expect(transcribeAudioMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/assistant/voice — transcribe then run the read-only agent", () => {
  it("emits the transcript, then the live run, then the answer", async () => {
    runAgentMock.mockImplementation(async (_message, _history, options) => {
      options?.onEvent?.({ type: "thinking" });
      options?.onEvent?.({ type: "tool", name: "get_day_income" });
      return { text: "You made $240 today.", toolCalls: [{ name: "get_day_income", input: {} }] };
    });

    const response = await POST(voiceRequest({ history: [] }));
    expect(response.headers.get("content-type")).toContain("ndjson");
    const events = await readEvents(response);

    expect(events).toEqual([
      { type: "transcript", text: "how much did I make today" },
      { type: "thinking" },
      { type: "tool", name: "get_day_income" },
      { type: "done", answer: "You made $240 today.", toolsUsed: ["get_day_income"] },
    ]);

    // The transcript — not the audio — is what runs through the pipeline.
    expect(runAgentMock).toHaveBeenCalledWith(
      "how much did I make today",
      expect.any(Array),
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );
  });

  it("forwards prior history so a voice turn keeps context", async () => {
    await POST(voiceRequest({ history: [{ role: "user", text: "earlier" }] }));
    expect(runAgentMock).toHaveBeenCalledWith(
      "how much did I make today",
      [{ role: "user", text: "earlier" }],
      expect.anything(),
    );
  });

  it("gives a voice-specific 'didn't catch that' error on a silent clip — and never runs the agent", async () => {
    transcribeAudioMock.mockResolvedValue("");
    const events = await readEvents(await POST(voiceRequest()));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(String(events[0].message)).toMatch(/didn'?t catch/i);
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("emits a friendly 'not set up' error when the Gemini key is missing", async () => {
    transcribeAudioMock.mockRejectedValue(new ProviderNotConfiguredError("no key"));
    const events = await readEvents(await POST(voiceRequest()));
    expect(events.at(-1)?.type).toBe("error");
    expect(String(events.at(-1)?.message)).toMatch(/set up/i);
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("emits a generic error when transcription fails unexpectedly", async () => {
    transcribeAudioMock.mockRejectedValue(new Error("boom"));
    const events = await readEvents(await POST(voiceRequest()));
    expect(events.at(-1)?.type).toBe("error");
    expect(String(events.at(-1)?.message)).toMatch(/went wrong/i);
  });

  it("maps a runAgent not-configured error to the same friendly 'set up' message", async () => {
    runAgentMock.mockRejectedValue(new AgentNotConfiguredError("no key"));
    const events = await readEvents(await POST(voiceRequest()));
    // The transcript still streams first; the failure comes after.
    expect(events[0]).toEqual({ type: "transcript", text: "how much did I make today" });
    expect(events.at(-1)?.type).toBe("error");
    expect(String(events.at(-1)?.message)).toMatch(/set up/i);
  });
});

// TT-038: a voice turn is captured the same as a typed one — the OPERATOR's
// transcript is the question (operator-authored, safe to log); the audio is not.
describe("POST /api/assistant/voice — turn capture (TT-038)", () => {
  it("logs an answered turn with the transcript as the question", async () => {
    runAgentMock.mockResolvedValue({
      text: "You made $240 today.",
      toolCalls: [{ name: "get_day_income", input: {} }],
    });
    await readEvents(await POST(voiceRequest({ history: [] })));

    expect(recordAgentTurnMock).toHaveBeenCalledWith({
      question: "how much did I make today",
      toolsUsed: ["get_day_income"],
      outcome: "answered",
    });
  });

  it("logs a proposed turn when a voice turn prepares a write", async () => {
    runAgentMock.mockResolvedValue({
      text: "Ready to book.",
      toolCalls: [{ name: "propose_book_appointment", input: {} }],
      proposal: { kind: "book_appointment" } as never,
    });
    await readEvents(await POST(voiceRequest({ history: [] })));

    expect(recordAgentTurnMock).toHaveBeenCalledWith({
      question: "how much did I make today",
      toolsUsed: ["propose_book_appointment"],
      outcome: "proposed",
    });
  });

  it("logs an error turn when the run throws after transcription", async () => {
    runAgentMock.mockRejectedValue(new Error("boom"));
    await readEvents(await POST(voiceRequest()));

    expect(recordAgentTurnMock).toHaveBeenCalledWith({
      question: "how much did I make today",
      toolsUsed: [],
      outcome: "error",
    });
  });

  it("logs nothing on a silent clip (no question was asked)", async () => {
    transcribeAudioMock.mockResolvedValue("");
    await readEvents(await POST(voiceRequest()));
    expect(recordAgentTurnMock).not.toHaveBeenCalled();
  });

  it("logs nothing when transcription itself fails (no operator question to attribute)", async () => {
    transcribeAudioMock.mockRejectedValue(new Error("boom"));
    await readEvents(await POST(voiceRequest()));
    expect(recordAgentTurnMock).not.toHaveBeenCalled();
  });
});
