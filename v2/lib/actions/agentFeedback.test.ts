import { beforeEach, describe, expect, it, vi } from "vitest";

// recordAgentFeedback logs a thumbs up/down on an assistant answer through the
// shared audit pipeline (no new table). It inherits the agent gate + auth, marks
// the row agent-originated, and bounds the recorded question so the safe-metadata
// filter (which drops strings > 200 chars) never silently discards it.

vi.mock("@/lib/writeGate", () => ({ isAgentEnabled: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/audit.server", () => ({ recordAuditEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/feedbackAlert", () => ({ sendFeedbackAlert: vi.fn(async () => {}) }));

const { isAgentEnabled } = await import("@/lib/writeGate");
const { getCurrentUser } = await import("@/lib/supabase/server");
const { recordAuditEvent } = await import("@/lib/audit.server");
const { sendFeedbackAlert } = await import("@/lib/feedbackAlert");
const { recordAgentFeedback } = await import("./agentFeedback");

const isAgentEnabledMock = vi.mocked(isAgentEnabled);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const recordAuditEventMock = vi.mocked(recordAuditEvent);
const sendFeedbackAlertMock = vi.mocked(sendFeedbackAlert);

beforeEach(() => {
  vi.clearAllMocks();
  isAgentEnabledMock.mockReturnValue(true);
  getCurrentUserMock.mockResolvedValue({ id: "user-1" } as never);
  sendFeedbackAlertMock.mockResolvedValue(undefined);
});

describe("recordAgentFeedback", () => {
  it("records an agent.feedback audit event tagged source=agent", async () => {
    const result = await recordAgentFeedback({
      rating: "up",
      question: "how much did I make Friday",
      toolsUsed: ["get_day_income"],
    });

    expect(result.ok).toBe(true);
    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
    const input = recordAuditEventMock.mock.calls[0][0];
    expect(input.eventType).toBe("agent.feedback");
    expect(input.metadata).toMatchObject({
      rating: "up",
      question: "how much did I make Friday",
      toolsUsed: ["get_day_income"],
      source: "agent",
    });
  });

  it("truncates the question to 200 chars so it survives the safe-metadata filter", async () => {
    await recordAgentFeedback({
      rating: "down",
      question: "x".repeat(500),
      toolsUsed: [],
    });
    const input = recordAuditEventMock.mock.calls[0][0];
    expect((input.metadata?.question as string).length).toBeLessThanOrEqual(200);
  });

  it("records a thumbs-down note on ONE agent.feedback event, bounded to 200 chars", async () => {
    const result = await recordAgentFeedback({
      rating: "down",
      question: "how much did I make Friday",
      toolsUsed: ["get_day_income"],
      note: "n".repeat(500),
    });

    expect(result.ok).toBe(true);
    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
    const input = recordAuditEventMock.mock.calls[0][0];
    expect(input.eventType).toBe("agent.feedback");
    expect((input.metadata?.note as string).length).toBeLessThanOrEqual(200);
    expect(input.metadata).toMatchObject({ rating: "down", note: "n".repeat(200) });
  });

  it("omits the note key when no note is given (no empty note in metadata)", async () => {
    await recordAgentFeedback({
      rating: "down",
      question: "anything",
      toolsUsed: [],
    });
    const input = recordAuditEventMock.mock.calls[0][0];
    expect(input.metadata).not.toHaveProperty("note");
  });

  it("alerts Russell on a thumbs-down, passing the question and note", async () => {
    await recordAgentFeedback({
      rating: "down",
      question: "how much did I make",
      toolsUsed: [],
      note: "it used the wrong day",
    });
    expect(sendFeedbackAlertMock).toHaveBeenCalledTimes(1);
    expect(sendFeedbackAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "how much did I make",
        note: "it used the wrong day",
        at: expect.any(String),
      }),
    );
  });

  it("does NOT alert on a thumbs-up", async () => {
    await recordAgentFeedback({ rating: "up", question: "anything", toolsUsed: [] });
    expect(sendFeedbackAlertMock).not.toHaveBeenCalled();
  });

  it("still writes the feedback row even if the alert send fails (logged first)", async () => {
    sendFeedbackAlertMock.mockRejectedValue(new Error("twilio down"));
    const result = await recordAgentFeedback({
      rating: "down",
      question: "anything",
      toolsUsed: [],
    });
    expect(result.ok).toBe(true);
    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
  });

  it("writes nothing and alerts no one when the agent feature is off", async () => {
    isAgentEnabledMock.mockReturnValue(false);
    const result = await recordAgentFeedback({
      rating: "down",
      question: "anything",
      toolsUsed: [],
    });
    expect(result.ok).toBe(false);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
    expect(sendFeedbackAlertMock).not.toHaveBeenCalled();
  });

  it("writes nothing and alerts no one without a signed-in operator", async () => {
    getCurrentUserMock.mockResolvedValue(null as never);
    const result = await recordAgentFeedback({
      rating: "down",
      question: "anything",
      toolsUsed: [],
    });
    expect(result.ok).toBe(false);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
    expect(sendFeedbackAlertMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid rating without writing", async () => {
    const result = await recordAgentFeedback({
      rating: "sideways" as never,
      question: "anything",
      toolsUsed: [],
    });
    expect(result.ok).toBe(false);
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});
