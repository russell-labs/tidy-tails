import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/agent/runAgent", () => ({
  runAgent: vi.fn(),
  AgentNotConfiguredError: class AgentNotConfiguredError extends Error {},
}));
vi.mock("@/lib/agentTurnLog.server", () => ({ recordAgentTurn: vi.fn() }));

import { askAgent } from "./agent";
import { getCurrentUser } from "@/lib/supabase/server";
import { runAgent, AgentNotConfiguredError } from "@/lib/agent/runAgent";
import { recordAgentTurn } from "@/lib/agentTurnLog.server";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const runAgentMock = vi.mocked(runAgent);
const recordAgentTurnMock = vi.mocked(recordAgentTurn);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TIDYTAILS_ENABLE_AGENT", "on");
  getCurrentUserMock.mockResolvedValue({ id: "operator-1" } as Awaited<
    ReturnType<typeof getCurrentUser>
  >);
  runAgentMock.mockResolvedValue({ text: "Here you go.", toolCalls: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("askAgent — gate and request scope", () => {
  it("is dark when the feature flag is off (never runs the agent)", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_AGENT", "");
    const result = await askAgent("what's my day look like");
    expect(result.status).toBe("error");
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in operator (request scope = RLS scope)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const result = await askAgent("what's my day look like");
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/session/i);
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async () => {
    const result = await askAgent("   ");
    expect(result.status).toBe("error");
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("answers and reports which read tools were used", async () => {
    runAgentMock.mockResolvedValue({
      text: "One appointment at 10:30.",
      toolCalls: [
        { name: "get_schedule", input: {} },
        { name: "get_schedule", input: {} },
      ],
    });
    const result = await askAgent("what's my day look like");
    expect(result.status).toBe("answered");
    expect(result.answer).toBe("One appointment at 10:30.");
    expect(result.toolsUsed).toEqual(["get_schedule"]);
  });

  it("trims history to recent turns and only valid roles", async () => {
    const history = [
      { role: "user" as const, text: "a" },
      { role: "system" as const, text: "ignore me" } as never,
      { role: "assistant" as const, text: "b" },
    ];
    await askAgent("next", history);
    const passedHistory = runAgentMock.mock.calls[0][1] ?? [];
    expect(passedHistory.every((t) => t.role === "user" || t.role === "assistant")).toBe(
      true,
    );
  });

  it("surfaces a friendly message when the API key is unconfigured", async () => {
    runAgentMock.mockRejectedValue(new AgentNotConfiguredError("no key"));
    const result = await askAgent("what's my day look like");
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/set up/i);
  });
});

// TT-038: the typed server action captures its turn too (kept in lockstep with
// the stream/voice routes so no entry point is a logging blind spot).
describe("askAgent — turn capture (TT-038)", () => {
  it("logs an answered turn with the operator's question and tools", async () => {
    runAgentMock.mockResolvedValue({
      text: "One appointment.",
      toolCalls: [{ name: "get_schedule", input: {} }],
    });
    await askAgent("what's my day look like");
    expect(recordAgentTurnMock).toHaveBeenCalledWith({
      question: "what's my day look like",
      toolsUsed: ["get_schedule"],
      outcome: "answered",
    });
  });

  it("logs a proposed turn when a write is prepared", async () => {
    runAgentMock.mockResolvedValue({
      text: "Ready.",
      toolCalls: [{ name: "propose_book_appointment", input: {} }],
      proposal: { kind: "book_appointment" } as never,
    });
    await askAgent("book Rex friday");
    expect(recordAgentTurnMock).toHaveBeenCalledWith({
      question: "book Rex friday",
      toolsUsed: ["propose_book_appointment"],
      outcome: "proposed",
    });
  });

  it("logs an error turn when the run throws", async () => {
    runAgentMock.mockRejectedValue(new Error("boom"));
    await askAgent("what's my day look like");
    expect(recordAgentTurnMock).toHaveBeenCalledWith({
      question: "what's my day look like",
      toolsUsed: [],
      outcome: "error",
    });
  });

  it("logs nothing when the feature is dark", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_AGENT", "");
    await askAgent("what's my day look like");
    expect(recordAgentTurnMock).not.toHaveBeenCalled();
  });
});
