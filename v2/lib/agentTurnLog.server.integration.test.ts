import { beforeEach, describe, expect, it, vi } from "vitest";

// Integration: recordAgentTurn through the REAL audit pipeline (recordAuditEvent
// is NOT mocked here). The unit test proves call-arg wiring; this proves an
// actual audit_events row is built and inserted, org-scoped, with the agent.turn
// event type and the new "outcome" key surviving the safe-metadata filter — i.e.
// a turn really lands a row, not just that a mock was called.

vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/data/repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/repo")>()),
  dataMode: vi.fn(() => "live"),
  requireOrgId: vi.fn(async () => "org-1"),
}));
vi.mock("@/lib/writeGate", () => ({ isAgentEnabled: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(async () => ({ id: "operator-1" })),
}));

const { createServerSupabase, getCurrentUser } = await import("@/lib/supabase/server");
const { recordAgentTurn } = await import("./agentTurnLog.server");

const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({ id: "operator-1" } as never);
});

describe("recordAgentTurn — real audit insert", () => {
  it("lands an org-scoped agent.turn row with question/tools/outcome", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseMock.mockResolvedValue({
      from: vi.fn(() => ({ insert })),
    } as never);

    await recordAgentTurn({
      question: "what's my day look like",
      toolsUsed: ["get_schedule"],
      outcome: "answered",
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "operator-1",
        org_id: "org-1",
        event_type: "agent.turn",
        metadata: {
          question: "what's my day look like",
          toolsUsed: ["get_schedule"],
          outcome: "answered",
          source: "agent",
        },
      }),
    );
  });
});
