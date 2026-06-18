import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/writeGate", () => ({ isAgentEnabled: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/agent/runAgent", () => ({
  runAgent: vi.fn(),
  AgentNotConfiguredError: class AgentNotConfiguredError extends Error {},
}));
vi.mock("@/lib/agentTurnLog.server", () => ({ recordAgentTurn: vi.fn() }));

import { POST } from "./route";
import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import { runAgent, AgentNotConfiguredError } from "@/lib/agent/runAgent";
import { recordAgentTurn } from "@/lib/agentTurnLog.server";

const isAgentEnabledMock = vi.mocked(isAgentEnabled);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const runAgentMock = vi.mocked(runAgent);
const recordAgentTurnMock = vi.mocked(recordAgentTurn);

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/assistant/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Read an NDJSON response body into parsed event objects. */
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
});

describe("POST /api/assistant/stream — gate and request scope", () => {
  it("404s and never runs the agent when the flag is off", async () => {
    isAgentEnabledMock.mockReturnValue(false);
    const response = await POST(postRequest({ message: "hi" }));
    expect(response.status).toBe(404);
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("401s when there is no signed-in operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const response = await POST(postRequest({ message: "hi" }));
    expect(response.status).toBe(401);
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("rejects an empty message without running the agent", async () => {
    const response = await POST(postRequest({ message: "   " }));
    const events = await readEvents(response);
    expect(events).toEqual([{ type: "error", message: "Type a question to get started." }]);
    expect(runAgentMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/assistant/stream — live event stream", () => {
  it("streams thinking, tool-in-use, then done with the answer and tools used", async () => {
    runAgentMock.mockImplementation(async (_message, _history, options) => {
      options?.onEvent?.({ type: "thinking" });
      options?.onEvent?.({ type: "tool", name: "get_schedule" });
      options?.onEvent?.({ type: "thinking" });
      return {
        text: "You have 3 today.",
        toolCalls: [
          { name: "get_schedule", input: {} },
          { name: "get_schedule", input: {} },
        ],
      };
    });

    const response = await POST(postRequest({ message: "what's my day look like", history: [] }));
    expect(response.headers.get("content-type")).toContain("ndjson");
    const events = await readEvents(response);

    expect(events).toEqual([
      { type: "thinking" },
      { type: "tool", name: "get_schedule" },
      { type: "thinking" },
      { type: "done", answer: "You have 3 today.", toolsUsed: ["get_schedule"] },
    ]);
  });

  it("emits a friendly 'not set up' error when the provider key is missing", async () => {
    runAgentMock.mockRejectedValue(new AgentNotConfiguredError("no key"));
    const response = await POST(postRequest({ message: "hi", history: [] }));
    const events = await readEvents(response);
    expect(events.at(-1)?.type).toBe("error");
    expect(String(events.at(-1)?.message)).toMatch(/set up/i);
  });

  it("emits a generic error when the run throws unexpectedly", async () => {
    runAgentMock.mockRejectedValue(new Error("boom"));
    const response = await POST(postRequest({ message: "hi", history: [] }));
    const events = await readEvents(response);
    expect(events.at(-1)?.type).toBe("error");
    expect(String(events.at(-1)?.message)).toMatch(/went wrong/i);
  });
});

// TT-038: every turn through this (primary) chat path is captured on the audit
// rails — the operator's own question, the tools that fired, and the outcome.
describe("POST /api/assistant/stream — turn capture (TT-038)", () => {
  it("logs an answered turn with the operator's question and tools used", async () => {
    runAgentMock.mockResolvedValue({
      text: "You have 3 today.",
      toolCalls: [
        { name: "get_schedule", input: {} },
        { name: "get_schedule", input: {} },
      ],
    });

    const response = await POST(postRequest({ message: "what's my day look like", history: [] }));
    await readEvents(response); // drain so the post-stream log runs

    expect(recordAgentTurnMock).toHaveBeenCalledTimes(1);
    expect(recordAgentTurnMock).toHaveBeenCalledWith({
      question: "what's my day look like",
      toolsUsed: ["get_schedule"],
      outcome: "answered",
    });
  });

  it("logs a proposed turn when the run prepares a write", async () => {
    runAgentMock.mockResolvedValue({
      text: "Ready to book.",
      toolCalls: [{ name: "propose_book_appointment", input: {} }],
      proposal: { kind: "book_appointment" } as never,
    });

    const response = await POST(postRequest({ message: "book Rex friday", history: [] }));
    await readEvents(response);

    expect(recordAgentTurnMock).toHaveBeenCalledWith({
      question: "book Rex friday",
      toolsUsed: ["propose_book_appointment"],
      outcome: "proposed",
    });
  });

  it("logs an error turn when the run throws", async () => {
    runAgentMock.mockRejectedValue(new Error("boom"));

    const response = await POST(postRequest({ message: "what's my day look like", history: [] }));
    await readEvents(response);

    expect(recordAgentTurnMock).toHaveBeenCalledWith({
      question: "what's my day look like",
      toolsUsed: [],
      outcome: "error",
    });
  });

  it("logs nothing when the feature is dark (route never runs)", async () => {
    isAgentEnabledMock.mockReturnValue(false);
    await POST(postRequest({ message: "hi" }));
    expect(recordAgentTurnMock).not.toHaveBeenCalled();
  });
});
