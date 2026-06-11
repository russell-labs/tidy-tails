import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import {
  activeImpersonation,
  endImpersonation,
  isImpersonating,
  isPlatformAdmin,
  listOrgsForAdmin,
  startImpersonation,
} from "./impersonation.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);

const ADMIN = { id: "admin-1" } as User;

// A minimal stand-in for the server client that records rpc calls and returns
// a queued response per rpc name.
function fakeRpcClient(responses: Record<string, { data: unknown; error: unknown }>) {
  const calls: { fn: string; args: unknown }[] = [];
  const rpc = vi.fn(async (fn: string, args?: unknown) => {
    calls.push({ fn, args });
    return responses[fn] ?? { data: null, error: null };
  });
  const client = { rpc } as unknown as Awaited<
    ReturnType<typeof createServerSupabase>
  >;
  return { client, rpc, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  getCurrentUserMock.mockResolvedValue(ADMIN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("impersonation — flag OFF is inert (no DB, no leak)", () => {
  beforeEach(() => {
    // Flag unset, even with live data on: the whole feature is dark.
    vi.stubEnv("NEXT_PUBLIC_USE_LIVE_DATA", "on");
  });

  it("isPlatformAdmin returns false without touching the DB", async () => {
    expect(await isPlatformAdmin()).toBe(false);
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it("activeImpersonation returns null without touching the DB", async () => {
    expect(await activeImpersonation()).toBeNull();
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it("isImpersonating is false", async () => {
    expect(await isImpersonating()).toBe(false);
  });

  it("listOrgsForAdmin returns [] and startImpersonation returns null", async () => {
    expect(await listOrgsForAdmin()).toEqual([]);
    expect(await startImpersonation("org-9", "reason")).toBeNull();
    await expect(endImpersonation()).resolves.toBeUndefined();
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it('treats a non-exact flag value ("ON", " on ", "true") as OFF', async () => {
    for (const value of ["ON", " on ", "true", "1", "off", ""]) {
      vi.stubEnv("TIDYTAILS_ENABLE_ADMIN_VIEW_AS", value);
      expect(await activeImpersonation()).toBeNull();
    }
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });
});

describe("impersonation — flag ON but not live data is inert", () => {
  it("returns inert values when NEXT_PUBLIC_USE_LIVE_DATA is not on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADMIN_VIEW_AS", "on");
    // live-data flag intentionally unset
    expect(await isPlatformAdmin()).toBe(false);
    expect(await activeImpersonation()).toBeNull();
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });
});

describe("impersonation — flag ON + live resolves against the DB", () => {
  beforeEach(() => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADMIN_VIEW_AS", "on");
    vi.stubEnv("NEXT_PUBLIC_USE_LIVE_DATA", "on");
  });

  it("isPlatformAdmin reflects the is_platform_admin RPC", async () => {
    const { client, calls } = fakeRpcClient({
      is_platform_admin: { data: true, error: null },
    });
    createServerSupabaseMock.mockResolvedValue(client);
    expect(await isPlatformAdmin()).toBe(true);
    expect(calls).toEqual([{ fn: "is_platform_admin", args: undefined }]);
  });

  it("maps an active session row from admin_active_impersonation", async () => {
    const { client } = fakeRpcClient({
      admin_active_impersonation: {
        data: [
          {
            session_id: "sess-1",
            target_org_id: "org-7",
            org_name: "Pampered Paws",
            expires_at: "2026-06-11T18:30:00Z",
          },
        ],
        error: null,
      },
    });
    createServerSupabaseMock.mockResolvedValue(client);

    expect(await activeImpersonation()).toEqual({
      sessionId: "sess-1",
      orgId: "org-7",
      orgName: "Pampered Paws",
      expiresAt: "2026-06-11T18:30:00Z",
    });
    expect(await isImpersonating()).toBe(true);
  });

  it("returns null when there is no active session row", async () => {
    const { client } = fakeRpcClient({
      admin_active_impersonation: { data: [], error: null },
    });
    createServerSupabaseMock.mockResolvedValue(client);
    expect(await activeImpersonation()).toBeNull();
  });

  it("returns null on RPC error (fail closed)", async () => {
    const { client } = fakeRpcClient({
      admin_active_impersonation: { data: null, error: { message: "boom" } },
    });
    createServerSupabaseMock.mockResolvedValue(client);
    expect(await activeImpersonation()).toBeNull();
  });

  it("startImpersonation passes org + reason and returns the new session id", async () => {
    const { client, calls } = fakeRpcClient({
      admin_start_impersonation: { data: "sess-new", error: null },
    });
    createServerSupabaseMock.mockResolvedValue(client);
    expect(await startImpersonation("org-7", "card on file")).toBe("sess-new");
    expect(calls).toEqual([
      {
        fn: "admin_start_impersonation",
        args: { p_org: "org-7", p_reason: "card on file" },
      },
    ]);
  });
});
