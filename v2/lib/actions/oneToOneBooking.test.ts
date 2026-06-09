import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeOrgSettings } from "@/lib/orgSettings";
import { createSupabaseHarness, form } from "./actionTestSupport";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit.server", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/data/repo", () => ({
  dataMode: vi.fn(),
  getClientRecord: vi.fn(),
  loadAppointments: vi.fn(),
  requireOrgId: vi.fn(),
}));
vi.mock("@/lib/orgSettings.server", () => ({ loadOrgSettings: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/writeGate", () => ({ isAddAppointmentWriteEnabled: vi.fn() }));

import { createOneToOneBooking } from "./oneToOneBooking";
import {
  dataMode,
  getClientRecord,
  loadAppointments,
  requireOrgId,
} from "@/lib/data/repo";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isAddAppointmentWriteEnabled } from "@/lib/writeGate";

const supabase = createSupabaseHarness();
const ORG = normalizeOrgSettings({
  scheduling_style: "one_to_one",
  settings: { locations: [{ name: "Gina's", address: "60 Olive Crescent" }] },
});

function bookingForm(overrides: Record<string, string> = {}): FormData {
  return form({
    client_id: "c1",
    pet_id: "p1",
    date: "2026-06-20",
    time_slot: "10:00am",
    service_type: "full_groom",
    location: "Gina's",
    duration_minutes: "90",
    fee: "85",
    notes: "",
    ...overrides,
  });
}

function record() {
  return {
    client: { id: "c1", first_name: "Cara", last_name: "Lee" },
    pets: [{ id: "p1", client_id: "c1", name: "Biscuit" }],
    appointments: [],
  };
}

beforeEach(() => {
  supabase.reset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as Awaited<
    ReturnType<typeof getCurrentUser>
  >);
  vi.mocked(dataMode).mockReturnValue("live");
  vi.mocked(loadOrgSettings).mockResolvedValue(ORG);
  vi.mocked(getClientRecord).mockResolvedValue(
    record() as unknown as Awaited<ReturnType<typeof getClientRecord>>,
  );
  vi.mocked(loadAppointments).mockResolvedValue([]);
  vi.mocked(requireOrgId).mockResolvedValue("org-1");
  vi.mocked(isAddAppointmentWriteEnabled).mockReturnValue(true);
  vi.mocked(createServerSupabase).mockResolvedValue(
    supabase.client as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
  );
});

describe("createOneToOneBooking", () => {
  it("persists the block with duration_minutes and org_id when the gate is on", async () => {
    supabase.queueResult({ data: { id: "appt-1" }, error: null });
    const result = await createOneToOneBooking({ status: "idle" }, bookingForm());

    expect(result.status).toBe("saved");
    const inserts = supabase.operations.filter((o) => o.action === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("appointments");
    expect(inserts[0].payload).toMatchObject({
      client_id: "c1",
      pet_id: "p1",
      date: "2026-06-20",
      time_slot: "10:00am",
      service_type: "full_groom",
      location: "Gina's",
      duration_minutes: 90,
      status: "booked",
      org_id: "org-1",
    });
  });

  it("uses the location ADDRESS in the customer-facing summary", async () => {
    supabase.queueResult({ data: { id: "appt-1" }, error: null });
    const result = await createOneToOneBooking({ status: "idle" }, bookingForm());
    if (result.status !== "saved") throw new Error("expected saved");
    expect(result.summary.location).toBe("60 Olive Crescent");
  });

  it("rejects a location that is not one of the org's locations (server-authoritative)", async () => {
    const result = await createOneToOneBooking(
      { status: "idle" },
      bookingForm({ location: "Some Other Shop" }),
    );
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.errors.location).toBeTruthy();
    expect(supabase.operations).toHaveLength(0);
  });

  it("rejects a block that overlaps an existing appointment on that day", async () => {
    vi.mocked(loadAppointments).mockResolvedValue([
      {
        id: "x",
        date: "2026-06-20",
        time_slot: "10:30am",
        duration_minutes: 60,
        status: "booked",
        client_id: "c9",
        pet_id: "p9",
      } as never,
    ]);
    const result = await createOneToOneBooking({ status: "idle" }, bookingForm());
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.formError).toMatch(/overlaps/i);
    expect(supabase.operations).toHaveLength(0);
  });

  it("returns gated and writes nothing when the write flag is off", async () => {
    vi.mocked(isAddAppointmentWriteEnabled).mockReturnValue(false);
    const result = await createOneToOneBooking({ status: "idle" }, bookingForm());
    expect(result.status).toBe("gated");
    expect(supabase.operations).toHaveLength(0);
  });

  it("is a dry-run in fixtures mode", async () => {
    vi.mocked(dataMode).mockReturnValue("fixtures");
    const result = await createOneToOneBooking({ status: "idle" }, bookingForm());
    expect(result.status).toBe("demo");
    expect(supabase.operations).toHaveLength(0);
  });

  it("rejects a pet not owned by the client", async () => {
    const result = await createOneToOneBooking(
      { status: "idle" },
      bookingForm({ pet_id: "p999" }),
    );
    expect(result.status).toBe("error");
    expect(supabase.operations).toHaveLength(0);
  });
});
