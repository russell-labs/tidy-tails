import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

// TT-015 — proves the read pivot: while a platform admin is impersonating, live
// reads scope by org_id (the impersonated org), not groomer_id; and every read
// still fails closed when nothing resolves.

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/admin/impersonation.server", () => ({
  activeImpersonation: vi.fn(),
}));

import {
  effectiveOrgId,
  liveReadScope,
  loadClients,
  loadDataset,
} from "./repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { activeImpersonation } from "@/lib/admin/impersonation.server";

const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const activeImpersonationMock = vi.mocked(activeImpersonation);

type Row = Record<string, unknown>;
type Capture = { table: string; filters: { column: string; value: unknown }[] };

function fakeClient(rowsByTable: Record<string, Row[]> = {}) {
  const captures: Capture[] = [];
  const from = vi.fn((table: string) => {
    const capture: Capture = { table, filters: [] };
    captures.push(capture);
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        capture.filters.push({ column, value });
        return builder;
      },
      order: () => builder,
      range: async (start: number, end: number) => ({
        data: (rowsByTable[table] ?? []).slice(start, end + 1),
        error: null,
      }),
    };
    return builder;
  });
  const client = { from } as unknown as Awaited<
    ReturnType<typeof createServerSupabase>
  >;
  return { client, from, captures };
}

const OPERATOR = { id: "operator-1" } as User;
const ACTIVE = {
  sessionId: "sess-1",
  orgId: "org-7",
  orgName: "Pampered Paws",
  expiresAt: "2026-06-11T18:30:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_USE_LIVE_DATA", "on");
  getCurrentUserMock.mockResolvedValue(OPERATOR);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("read pivot while impersonating", () => {
  beforeEach(() => {
    activeImpersonationMock.mockResolvedValue(ACTIVE);
  });

  it("liveReadScope pivots to org_id of the impersonated org", async () => {
    expect(await liveReadScope()).toEqual({ column: "org_id", value: "org-7" });
  });

  it("effectiveOrgId is the impersonated org (no membership query needed)", async () => {
    expect(await effectiveOrgId()).toBe("org-7");
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it("loadClients filters by org_id, not groomer_id", async () => {
    const harness = fakeClient({
      clients: [{ id: "c1", first_name: "Mary", created_at: "2026-01-01" }],
    });
    createServerSupabaseMock.mockResolvedValue(harness.client);

    const clients = await loadClients();

    expect(harness.captures[0].table).toBe("clients");
    expect(harness.captures[0].filters).toContainEqual({
      column: "org_id",
      value: "org-7",
    });
    expect(harness.captures[0].filters).not.toContainEqual(
      expect.objectContaining({ column: "groomer_id" }),
    );
    expect(clients).toHaveLength(1);
  });

  it("loadDataset scopes every table by the impersonated org_id", async () => {
    const harness = fakeClient({
      clients: [{ id: "c1", first_name: "Mary", created_at: "2026-01-01" }],
      pets: [{ id: "p1", client_id: "c1", name: "Kiwi", created_at: "2026-01-01" }],
      appointments: [
        { id: "a1", client_id: "c1", pet_id: "p1", date: "2026-06-12", created_at: "x" },
      ],
    });
    createServerSupabaseMock.mockResolvedValue(harness.client);

    await loadDataset();

    for (const capture of harness.captures) {
      expect(capture.filters).toContainEqual({ column: "org_id", value: "org-7" });
    }
  });
});

describe("normal operator path is unchanged (flag-off / no impersonation)", () => {
  beforeEach(() => {
    activeImpersonationMock.mockResolvedValue(null);
  });

  it("liveReadScope scopes to the operator's groomer_id", async () => {
    expect(await liveReadScope()).toEqual({
      column: "groomer_id",
      value: "operator-1",
    });
  });

  it("fails closed to empty when there is no session and no impersonation", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect(await liveReadScope()).toBeNull();
    expect(await loadClients()).toEqual([]);
  });
});
