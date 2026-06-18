import { beforeEach, describe, expect, it, vi } from "vitest";

// recordAgentTurn (TT-038) logs ONE "agent.turn" audit event per assistant turn
// through the shared audit pipeline (no new table): the operator's own question,
// which read/propose tools fired, and the turn's outcome. Like every agent entry
// point it inherits the master gate + a signed-in operator, so it is inert when
// the feature is dark, and the row is tagged source=agent. It is fire-and-forget:
// it returns void and must NEVER throw — a logging fault can't slow or fail the
// turn it is recording.

vi.mock("@/lib/writeGate", () => ({ isAgentEnabled: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/audit.server", () => ({ recordAuditEvent: vi.fn(async () => {}) }));

const { isAgentEnabled } = await import("@/lib/writeGate");
const { getCurrentUser } = await import("@/lib/supabase/server");
const { recordAuditEvent } = await import("@/lib/audit.server");
const { recordAgentTurn } = await import("./agentTurnLog.server");

const isAgentEnabledMock = vi.mocked(isAgentEnabled);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const recordAuditEventMock = vi.mocked(recordAuditEvent);

beforeEach(() => {
  vi.clearAllMocks();
  isAgentEnabledMock.mockReturnValue(true);
  getCurrentUserMock.mockResolvedValue({ id: "user-1" } as never);
});

describe("recordAgentTurn", () => {
  it("records an agent.turn audit event with question, tools, outcome, tagged source=agent", async () => {
    await recordAgentTurn({
      question: "what's my day look like",
      toolsUsed: ["get_schedule"],
      outcome: "answered",
    });

    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
    const input = recordAuditEventMock.mock.calls[0][0];
    expect(input.eventType).toBe("agent.turn");
    expect(input.metadata).toMatchObject({
      question: "what's my day look like",
      toolsUsed: ["get_schedule"],
      outcome: "answered",
      source: "agent",
    });
  });

  it("truncates the question to 200 chars so it survives the safe-metadata filter", async () => {
    await recordAgentTurn({
      question: "x".repeat(500),
      toolsUsed: [],
      outcome: "answered",
    });
    const input = recordAuditEventMock.mock.calls[0][0];
    expect((input.metadata?.question as string).length).toBeLessThanOrEqual(200);
  });

  it("drops non-string tool names", async () => {
    await recordAgentTurn({
      question: "anything",
      toolsUsed: ["get_schedule", "", 42 as never, null as never],
      outcome: "answered",
    });
    const input = recordAuditEventMock.mock.calls[0][0];
    expect(input.metadata?.toolsUsed).toEqual(["get_schedule"]);
  });

  it("writes nothing when the agent feature is off (inert while dark)", async () => {
    isAgentEnabledMock.mockReturnValue(false);
    await recordAgentTurn({ question: "anything", toolsUsed: [], outcome: "answered" });
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("writes nothing without a signed-in operator", async () => {
    getCurrentUserMock.mockResolvedValue(null as never);
    await recordAgentTurn({ question: "anything", toolsUsed: [], outcome: "answered" });
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("never throws — a logging fault must not fail the turn it records (fire-and-forget)", async () => {
    // If even the gate/auth read throws on the hot path, logging must swallow it.
    getCurrentUserMock.mockRejectedValue(new Error("session backend down"));
    await expect(
      recordAgentTurn({ question: "anything", toolsUsed: [], outcome: "answered" }),
    ).resolves.toBeUndefined();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});
