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

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/twilio", () => ({
  getTwilioConfig: vi.fn(),
  fetchTwilioSmsStatus: vi.fn(),
}));

import {
  loadClientSmsMessages,
  loadRecentSmsMessages,
} from "./smsMessages.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { fetchTwilioSmsStatus, getTwilioConfig } from "@/lib/twilio";

const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const createServiceSupabaseMock = vi.mocked(createServiceSupabase);
const getTwilioConfigMock = vi.mocked(getTwilioConfig);
const fetchTwilioSmsStatusMock = vi.mocked(fetchTwilioSmsStatus);

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

// An outbound, in-flight message is a delivery-status refresh candidate.
const outboundRow = {
  id: "sms-out-1",
  groomer_id: "operator-1",
  client_id: "c1",
  direction: "outbound",
  from_phone: "+17055550199",
  to_phone: "+17055550100",
  body: "You're booked!",
  twilio_message_sid: "SM-1",
  status: "sent",
  created_at: "2026-06-06T10:00:00.000Z",
};

type WriteFilter = { column: string; value: unknown };

// Records the service-role UPDATE chain (`.update().eq().eq().eq()`).
function fakeServiceClient() {
  const updates: { table: string; patch: unknown; filters: WriteFilter[] }[] = [];
  const from = vi.fn((table: string) => ({
    update: (patch: unknown) => {
      const record = { table, patch, filters: [] as WriteFilter[] };
      updates.push(record);
      const chain = {
        eq: (column: string, value: unknown) => {
          record.filters.push({ column, value });
          return chain;
        },
        then: (onFulfilled: Parameters<Promise<unknown>["then"]>[0]) =>
          Promise.resolve({ error: null }).then(onFulfilled),
      };
      return chain;
    },
  }));
  return {
    client: { from } as unknown as ReturnType<typeof createServiceSupabase>,
    updates,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
  getTwilioConfigMock.mockReturnValue({
    ok: true,
    value: {
      accountSid: "AC-test",
      authUsername: "SK-test",
      authPassword: "secret",
      fromNumber: "+17055550199",
    },
  });
  fetchTwilioSmsStatusMock.mockResolvedValue({ ok: true, status: "delivered" });
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

describe("refreshOutboundDeliveryStatuses — service-role write scoping (WS0)", () => {
  it("scopes the RLS-bypassing status-refresh update to the operator", async () => {
    const { client } = fakeReadClient({ sms_messages: [outboundRow] });
    createServerSupabaseMock.mockResolvedValue(client);
    const service = fakeServiceClient();
    createServiceSupabaseMock.mockReturnValue(service.client);

    const rows = await loadRecentSmsMessages();

    expect(service.updates).toHaveLength(1);
    expect(service.updates[0].table).toBe("sms_messages");
    expect(service.updates[0].filters).toContainEqual({
      column: "groomer_id",
      value: "operator-1",
    });
    // The original id + direction constraints are preserved alongside the scope.
    expect(service.updates[0].filters).toContainEqual({
      column: "id",
      value: "sms-out-1",
    });
    expect(service.updates[0].filters).toContainEqual({
      column: "direction",
      value: "outbound",
    });
    // Behavior-identical for the legitimate operator: the refreshed status is
    // still applied to their own message.
    expect(rows[0].status).toBe("delivered");
  });

  it("fails closed: with no session, no service-role write is issued", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    // loadClientSmsMessages reads by client_id (RLS-scoped) and still reaches the
    // refresh — which must skip the service-role write when there is no operator.
    const { client } = fakeReadClient({ sms_messages: [outboundRow] });
    createServerSupabaseMock.mockResolvedValue(client);
    const service = fakeServiceClient();
    createServiceSupabaseMock.mockReturnValue(service.client);

    await loadClientSmsMessages("c1");

    expect(createServiceSupabaseMock).not.toHaveBeenCalled();
    expect(fetchTwilioSmsStatusMock).not.toHaveBeenCalled();
    expect(service.updates).toEqual([]);
  });
});
