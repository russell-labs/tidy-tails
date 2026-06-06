import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_noStore: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

// Keep the real `currentGroomerId` (delegates to the mocked getCurrentUser) and
// override only `dataMode` so the live read path runs.
vi.mock("@/lib/data/repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/repo")>()),
  dataMode: vi.fn(() => "live"),
  requireOrgId: vi.fn(async () => "org-1"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { loadRecentAuditEvents, recordAuditEvent } from "./audit.server";
import * as Sentry from "@sentry/nextjs";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const captureExceptionMock = vi.mocked(Sentry.captureException);

type Filter = { method: string; column: string; value: unknown };
type Capture = { table: string; filters: Filter[] };

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

function mockAuditInsertFailure(error: Error): void {
  createServerSupabaseMock.mockResolvedValue({
    from: vi.fn(() => ({
      insert: vi.fn().mockRejectedValue(error),
    })),
  } as unknown as Awaited<ReturnType<typeof createServerSupabase>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
});

describe("recordAuditEvent", () => {
  it("keeps the primary action alive and captures audit write failures when Sentry is configured", async () => {
    const writeError = new Error("audit insert failed");
    mockAuditInsertFailure(writeError);
    vi.stubEnv("SENTRY_DSN", "https://public@example.com/1");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordAuditEvent({
        eventType: "client.updated",
        summary: "Updated Mary Jones.",
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to record audit event",
      writeError,
    );
    expect(captureExceptionMock).toHaveBeenCalledWith(writeError);

    consoleError.mockRestore();
  });

  it("still logs and no-ops Sentry capture when no DSN is configured", async () => {
    const writeError = new Error("audit insert failed");
    mockAuditInsertFailure(writeError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordAuditEvent({
        eventType: "client.updated",
        summary: "Updated Mary Jones.",
      }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to record audit event",
      writeError,
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("stamps the audit row with the operator's actor_id and org_id", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    createServerSupabaseMock.mockResolvedValue({
      from: vi.fn(() => ({ insert })),
    } as unknown as Awaited<ReturnType<typeof createServerSupabase>>);

    await recordAuditEvent({
      eventType: "client.updated",
      summary: "Updated Mary Jones.",
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "operator-1",
        org_id: "org-1",
        event_type: "client.updated",
      }),
    );
  });
});

describe("loadRecentAuditEvents — operator scoping", () => {
  it("filters the read to the operator's groomer_id", async () => {
    const { client, captures } = fakeReadClient({
      audit_events: [
        {
          id: "ae1",
          actor_id: "operator-1",
          event_type: "client.updated",
          summary: "Updated Mary Jones.",
          created_at: "2026-06-12T10:00:00.000Z",
        },
      ],
    });
    createServerSupabaseMock.mockResolvedValue(client);

    const rows = await loadRecentAuditEvents();

    expect(captures[0].table).toBe("audit_events");
    expect(captures[0].filters).toContainEqual({
      method: "eq",
      column: "groomer_id",
      value: "operator-1",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("ae1");
  });

  it("fails closed (no query, empty result) when there is no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const { client, from } = fakeReadClient({
      audit_events: [{ id: "ae1", actor_id: "operator-1", created_at: "x" }],
    });
    createServerSupabaseMock.mockResolvedValue(client);

    expect(await loadRecentAuditEvents()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });
});
