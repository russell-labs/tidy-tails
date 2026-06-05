import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import {
  loadAppointments,
  loadClients,
  loadDataset,
  loadDayCloseoutOverrideState,
  loadDayCloseoutOverrides,
  loadPets,
} from "./repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);

type Row = Record<string, unknown>;
type Capture = { table: string; filters: { column: string; value: unknown }[] };

// A minimal stand-in for the server Supabase client that records the read chain
// (`.select().eq().order().range()`) so tests can assert the explicit operator
// filter. Returns queued rows by table; the real mappers + fetchAllRows run.
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

function useLiveClient(rowsByTable: Record<string, Row[]> = {}) {
  const harness = fakeClient(rowsByTable);
  createServerSupabaseMock.mockResolvedValue(harness.client);
  return harness;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_USE_LIVE_DATA", "on");
  getCurrentUserMock.mockResolvedValue(OPERATOR);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("repo live reads — explicit operator scoping", () => {
  it("scopes loadClients to the operator's groomer_id", async () => {
    const { captures } = useLiveClient({
      clients: [
        { id: "c1", first_name: "Mary", last_name: "Jones", created_at: "2026-01-01" },
      ],
    });

    const clients = await loadClients();

    expect(captures).toHaveLength(1);
    expect(captures[0].table).toBe("clients");
    expect(captures[0].filters).toContainEqual({
      column: "groomer_id",
      value: "operator-1",
    });
    expect(clients).toHaveLength(1);
    expect(clients[0].id).toBe("c1");
  });

  it("scopes loadPets to the operator's groomer_id", async () => {
    const { captures } = useLiveClient({
      pets: [{ id: "p1", client_id: "c1", name: "Kiwi", created_at: "2026-01-01" }],
    });

    await loadPets();

    expect(captures[0].table).toBe("pets");
    expect(captures[0].filters).toContainEqual({
      column: "groomer_id",
      value: "operator-1",
    });
  });

  it("scopes loadAppointments to the operator's groomer_id", async () => {
    const { captures } = useLiveClient({
      appointments: [
        {
          id: "a1",
          client_id: "c1",
          pet_id: "p1",
          date: "2026-06-12",
          created_at: "2026-01-01",
        },
      ],
    });

    await loadAppointments();

    expect(captures[0].table).toBe("appointments");
    expect(captures[0].filters).toContainEqual({
      column: "groomer_id",
      value: "operator-1",
    });
  });

  it("scopes loadDayCloseoutOverrides to the operator's groomer_id", async () => {
    const { captures } = useLiveClient({
      day_closeout_overrides: [
        {
          id: "d1",
          date: "2026-06-12",
          location: "gina",
          final_payout: 100,
          note: "",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
      ],
    });

    await loadDayCloseoutOverrides();

    expect(captures[0].table).toBe("day_closeout_overrides");
    expect(captures[0].filters).toContainEqual({
      column: "groomer_id",
      value: "operator-1",
    });
  });

  it("loadDataset scopes every table and validates the session only once", async () => {
    const { captures } = useLiveClient({
      clients: [{ id: "c1", first_name: "Mary", created_at: "2026-01-01" }],
      pets: [{ id: "p1", client_id: "c1", name: "Kiwi", created_at: "2026-01-01" }],
      appointments: [
        { id: "a1", client_id: "c1", pet_id: "p1", date: "2026-06-12", created_at: "x" },
      ],
    });

    await loadDataset();

    expect([...captures.map((c) => c.table)].sort()).toEqual([
      "appointments",
      "clients",
      "pets",
    ]);
    for (const capture of captures) {
      expect(capture.filters).toContainEqual({
        column: "groomer_id",
        value: "operator-1",
      });
    }
    // Operator resolved once for the whole dataset, then threaded into each load.
    expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
  });
});

describe("repo live reads — fail closed when there is no session", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(null);
  });

  it("loadClients returns empty and issues no query", async () => {
    const { from } = useLiveClient({
      clients: [{ id: "c1", first_name: "Mary", created_at: "x" }],
    });

    expect(await loadClients()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it("loadPets and loadAppointments return empty and issue no query", async () => {
    const { from } = useLiveClient({
      pets: [{ id: "p1", client_id: "c1", name: "Kiwi", created_at: "x" }],
      appointments: [{ id: "a1", client_id: "c1", pet_id: "p1", date: "x", created_at: "x" }],
    });

    expect(await loadPets()).toEqual([]);
    expect(await loadAppointments()).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("loadDataset returns an empty dataset and issues no query", async () => {
    const { from } = useLiveClient({
      clients: [{ id: "c1", first_name: "Mary", created_at: "x" }],
    });

    expect(await loadDataset()).toEqual({
      clients: [],
      pets: [],
      appointments: [],
      vaccinations: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("loadDayCloseoutOverrideState returns empty-but-ready and issues no query", async () => {
    const { from } = useLiveClient({
      day_closeout_overrides: [
        { id: "d1", date: "x", location: "gina", note: "", created_at: "x", updated_at: "x" },
      ],
    });

    expect(await loadDayCloseoutOverrideState()).toEqual({ overrides: [], ready: true });
    expect(from).not.toHaveBeenCalled();
  });
});

describe("repo reads — fixtures mode bypasses the live client and session", () => {
  it("reads fixtures without creating a client or validating a session", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_LIVE_DATA", "off");

    const clients = await loadClients();

    expect(clients.length).toBeGreaterThan(0);
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });
});
