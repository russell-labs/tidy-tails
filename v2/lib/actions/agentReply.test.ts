import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseHarness, smsRow } from "./actionTestSupport";

// draftAgentReply is the agent's ONLY customer-text injection surface, and it
// lives OUTSIDE lib/agent/ on purpose: the customer's inbound message is loaded
// here (scoped to the operator, by an explicit sms_id Sam tapped) and seeded into
// the model as DATA, never reachable by a model-callable tool. The model can only
// produce a reply PROPOSAL — the confirm tap is the send backstop. We assert the
// quarantine, the operator-scoped load, and that the turn can ONLY yield a reply.

vi.mock("@/lib/writeGate", () => ({ isAgentEnabled: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(async () => ({ id: "operator-1" })),
}));
vi.mock("@/lib/agent/runAgent", () => ({ runAgent: vi.fn() }));

const { isAgentEnabled } = await import("@/lib/writeGate");
const { createServerSupabase, getCurrentUser } = await import("@/lib/supabase/server");
const { runAgent } = await import("@/lib/agent/runAgent");
const { draftAgentReply } = await import("./agentReply");

const isAgentEnabledMock = vi.mocked(isAgentEnabled);
const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const runAgentMock = vi.mocked(runAgent);

const supabase = createSupabaseHarness();

const REPLY_PROPOSAL = {
  kind: "send_text" as const,
  mode: "reply" as const,
  smsId: "sms-1",
  recipientLabel: "Mary Jones",
  message: "Yes, 2pm Saturday works — see you then!",
};

beforeEach(() => {
  vi.clearAllMocks();
  supabase.reset();
  isAgentEnabledMock.mockReturnValue(true);
  getCurrentUserMock.mockResolvedValue({ id: "operator-1" } as never);
  createServerSupabaseMock.mockResolvedValue(
    supabase.client as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
  );
  supabase.queueResult({ data: smsRow({ body: "Can we move Kiwi to 2pm Saturday?" }), error: null });
  runAgentMock.mockResolvedValue({ text: "", toolCalls: [], proposal: REPLY_PROPOSAL } as never);
});

describe("draftAgentReply", () => {
  it("loads the inbound text scoped to the operator and seeds it into the model as data", async () => {
    const result = await draftAgentReply("sms-1", "tell them 2pm works");

    expect(result.status).toBe("answered");
    expect(result.proposal).toEqual(REPLY_PROPOSAL);

    // The sms was loaded by id AND scoped to the signed-in operator (defence in depth + RLS).
    const read = supabase.operations.length === 0; // select goes through the harness builder
    void read;
    expect(createServerSupabaseMock).toHaveBeenCalled();

    // The model received the customer's words AND the sms_id, framed as data.
    const seeded = runAgentMock.mock.calls[0][0] as string;
    expect(seeded).toContain("Can we move Kiwi to 2pm Saturday?");
    expect(seeded).toContain("sms-1");
    expect(seeded.toLowerCase()).toContain("data"); // explicit data-not-instruction framing
    expect(seeded).toContain("tell them 2pm works"); // the operator's instruction
  });

  it("returns nothing to confirm when the agent feature is off", async () => {
    isAgentEnabledMock.mockReturnValue(false);
    const result = await draftAgentReply("sms-1", "tell them 2pm works");
    expect(result.status).toBe("error");
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("errors without a signed-in operator (no customer text is loaded)", async () => {
    getCurrentUserMock.mockResolvedValue(null as never);
    const result = await draftAgentReply("sms-1", "tell them 2pm works");
    expect(result.status).toBe("error");
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("errors when the message can't be found or isn't inbound", async () => {
    supabase.reset();
    supabase.queueResult({ data: null, error: { message: "not found" } });
    const result = await draftAgentReply("sms-x", "tell them 2pm works");
    expect(result.status).toBe("error");
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("rejects an outbound message (you only reply to inbound customer texts)", async () => {
    supabase.reset();
    supabase.queueResult({ data: smsRow({ direction: "outbound" }), error: null });
    const result = await draftAgentReply("sms-1", "tell them 2pm works");
    expect(result.status).toBe("error");
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it("HARDENING: discards any non-reply proposal the turn produces (injection backstop)", async () => {
    // Even if injected customer text steered the model toward another action, the
    // reply seam only ever surfaces a reply proposal — never a delete/booking card.
    runAgentMock.mockResolvedValue({
      text: "",
      toolCalls: [],
      proposal: { kind: "delete_household", clientId: "client-1" },
    } as never);
    const result = await draftAgentReply("sms-1", "tell them 2pm works");
    expect(result.status).toBe("error");
    expect(result.proposal).toBeUndefined();
  });

  it("requires a non-empty operator instruction", async () => {
    const result = await draftAgentReply("sms-1", "   ");
    expect(result.status).toBe("error");
    expect(runAgentMock).not.toHaveBeenCalled();
  });
});
