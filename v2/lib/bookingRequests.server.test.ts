import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));

// Keep the real `currentGroomerId` (so it delegates to the mocked getCurrentUser
// below) and override only `dataMode` to force the live path.
vi.mock("@/lib/data/repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/repo")>()),
  dataMode: vi.fn(() => "live"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { loadRecentBookingRequests } from "./bookingRequests.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);

type Filter = { method: string; column: string; value: unknown };
type Capture = { table: string; filters: Filter[] };

// Records the read chain (`.select().eq().order().limit()`) and resolves to the
// queued rows when awaited.
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

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
});

describe("loadRecentBookingRequests — operator scoping", () => {
  it("filters the read to the operator's groomer_id", async () => {
    const { client, captures } = fakeReadClient({
      booking_requests: [
        { id: "br1", requested_date: "2026-06-12", status: "pending", created_at: "x" },
      ],
    });
    createServerSupabaseMock.mockResolvedValue(client);

    const rows = await loadRecentBookingRequests();

    expect(captures[0].table).toBe("booking_requests");
    expect(captures[0].filters).toContainEqual({
      method: "eq",
      column: "groomer_id",
      value: "operator-1",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("br1");
  });

  it("fails closed (no query, empty result) when there is no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { client, from } = fakeReadClient({
      booking_requests: [
        { id: "br1", requested_date: "2026-06-12", status: "pending", created_at: "x" },
      ],
    });
    createServerSupabaseMock.mockResolvedValue(client);

    expect(await loadRecentBookingRequests()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });
});
