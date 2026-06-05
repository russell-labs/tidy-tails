import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));

// Keep the real `currentGroomerId` (delegates to the mocked getCurrentUser) and
// force the live path via `dataMode`.
vi.mock("@/lib/data/repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/repo")>()),
  dataMode: vi.fn(() => "live"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { loadRecentSmsMessages } from "./smsMessages.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);

type Filter = { method: string; column: string; value: unknown };
type Capture = { table: string; filters: Filter[] };

// Records the read chain (`.select().eq().neq().order().limit()`) and resolves
// to the queued rows when awaited.
function fakeReadClient(rowsByTable: Record<string, unknown[]> = {}) {
  const captures: Capture[] = [];
  const from = vi.fn((table: string) => {
    const capture: Capture = { table, filters: [] };
    captures.push(capture);
    const result = Promise.resolve({ data: rowsByTable[table] ?? [], error: null });
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        capture.filters.push({ method: "eq", column, value });
        return builder;
      },
      neq: (column: string, value: unknown) => {
        capture.filters.push({ method: "neq", column, value });
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      then: (onFulfilled: Parameters<Promise<unknown>["then"]>[0]) =>
        result.then(onFulfilled),
    };
    return builder;
  });
  return {
    client: { from } as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
    from,
    captures,
  };
}

// An inbound message is never an outbound-status-refresh candidate, so the read
// resolves without touching Twilio.
const inboundRow = {
  id: "sms1",
  groomer_id: "operator-1",
  client_id: "c1",
  direction: "inbound",
  from_phone: "7055550100",
  to_phone: "7055550199",
  body: "Hi, is Saturday free?",
  status: "received",
  created_at: "2026-06-12T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
});

describe("loadRecentSmsMessages — operator scoping (list read)", () => {
  it("filters the list read to the operator's groomer_id", async () => {
    const { client, captures } = fakeReadClient({ sms_messages: [inboundRow] });
    createServerSupabaseMock.mockResolvedValue(client);

    const rows = await loadRecentSmsMessages();

    expect(captures[0].table).toBe("sms_messages");
    expect(captures[0].filters).toContainEqual({
      method: "eq",
      column: "groomer_id",
      value: "operator-1",
    });
    // The existing status filter is preserved alongside the new operator scope.
    expect(captures[0].filters).toContainEqual({
      method: "neq",
      column: "status",
      value: "hidden",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("sms1");
  });

  it("fails closed (no query, empty result) when there is no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { client, from } = fakeReadClient({ sms_messages: [inboundRow] });
    createServerSupabaseMock.mockResolvedValue(client);

    expect(await loadRecentSmsMessages()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });
});
