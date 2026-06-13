import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/agent/runAgent", () => ({
  runAgent: vi.fn(),
  AgentNotConfiguredError: class AgentNotConfiguredError extends Error {},
}));

import { askAgent } from "./agent";
import { getCurrentUser } from "@/lib/supabase/server";
import { runAgent, AgentNotConfiguredError } from "@/lib/agent/runAgent";

const getCurrentUserMock = vi.mocked(getCurrentUser);
const runAgentMock = vi.mocked(runAgent);

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
