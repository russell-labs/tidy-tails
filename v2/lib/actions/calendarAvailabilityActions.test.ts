import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointment,
  clientRecord,
  createSupabaseHarness,
  form,
  isoDate,
} from "./actionTestSupport";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/audit.server", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/data/repo", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/data/repo")>("@/lib/data/repo");
  return {
    ...actual,
    getClientRecord: vi.fn(),
    loadAppointments: vi.fn(),
  };
});

vi.mock("@/lib/googleCalendar.server", () => ({
  disconnectGoogleCalendar: vi.fn(),
  readGoogleCalendarBusyBlocksForDate: vi.fn(),
  repairGoogleCalendarDropOffDurations: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { updateAppointmentWorkflow } from "./appointmentWorkflow";
import { checkBookingAvailability } from "./availability";
import {
  disconnectGoogleCalendarAction,
  repairCalendarDurationsAction,
} from "./googleCalendar";
import { getClientRecord, loadAppointments } from "@/lib/data/repo";
import {
  disconnectGoogleCalendar,
  readGoogleCalendarBusyBlocksForDate,
  repairGoogleCalendarDropOffDurations,
} from "@/lib/googleCalendar.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

const supabase = createSupabaseHarness();
const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const getClientRecordMock = vi.mocked(getClientRecord);
const loadAppointmentsMock = vi.mocked(loadAppointments);
const disconnectGoogleCalendarMock = vi.mocked(disconnectGoogleCalendar);
const readGoogleCalendarBusyBlocksForDateMock = vi.mocked(
  readGoogleCalendarBusyBlocksForDate,
);
const repairGoogleCalendarDropOffDurationsMock = vi.mocked(
  repairGoogleCalendarDropOffDurations,
);

function expectNoWrites(): void {
  expect(createServerSupabaseMock).not.toHaveBeenCalled();
  expect(supabase.operations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  supabase.reset();
  vi.stubEnv("NEXT_PUBLIC_USE_LIVE_DATA", "on");

  createServerSupabaseMock.mockResolvedValue(
    supabase.client as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
  );
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
  getClientRecordMock.mockResolvedValue(
    clientRecord({
      appointments: [appointment({ notes: "Started calm" })],
    }),
  );
  loadAppointmentsMock.mockResolvedValue([]);
  readGoogleCalendarBusyBlocksForDateMock.mockResolvedValue({
    status: "disabled",
    message: "Google Calendar availability is switched off.",
    busy: [],
  });
  repairGoogleCalendarDropOffDurationsMock.mockResolvedValue({
    status: "repaired",
    message: "Updated 1 calendar event to 15-minute drop-off windows.",
    scanned: 2,
    updated: 1,
    alreadyCorrect: 1,
    skipped: 0,
    failed: 0,
    details: [],
  });
});

describe("updateAppointmentWorkflow", () => {
  it("updates the appointment workflow marker when the edit-appointment gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE", "on");

    const result = await updateAppointmentWorkflow(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        workflow_status: "ready_pickup",
      }),
    );

    expect(result).toEqual({
      status: "saved",
      label: "Ready",
      message: "Marked Ready.",
    });
    expect(supabase.operations).toEqual([
      {
        table: "appointments",
        action: "update",
        payload: { notes: "Started calm [workflow:ready_pickup]" },
        filters: [
          { method: "eq", column: "id", value: "appt-1" },
          { method: "eq", column: "client_id", value: "client-1" },
        ],
        orders: [],
      },
    ]);
  });

  it("returns gated and writes nothing when the edit-appointment gate is off", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE", "yes");

    const result = await updateAppointmentWorkflow(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        workflow_status: "ready_pickup",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoWrites();
  });

  it("returns an auth error and writes nothing without an operator", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await updateAppointmentWorkflow(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        workflow_status: "ready_pickup",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it("returns validation feedback and writes nothing when workflow details are invalid", async () => {
    const result = await updateAppointmentWorkflow(
      { status: "idle" },
      form({
        client_id: "",
        appointment_id: "",
        workflow_status: "done",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Missing workflow details.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe("checkBookingAvailability", () => {
  it("returns calendar-aware slots for Tidy Tails bookings plus Google busy blocks", async () => {
    const date = isoDate(7);
    loadAppointmentsMock.mockResolvedValue([
      appointment({
        id: "booked-appt",
        date,
        time_slot: "10:30am",
      }),
    ]);
    readGoogleCalendarBusyBlocksForDateMock.mockResolvedValue({
      status: "ready",
      message:
        "Google Calendar events marked Busy are blocked. Events marked Free are left open.",
      busy: [
        {
          start: `${date}T09:00:00-04:00`,
          end: `${date}T09:15:00-04:00`,
        },
      ],
    });

    const result = await checkBookingAvailability({
      date,
      service_type: "full_groom",
    });

    expect(result.status).toBe("ready");
    expect(result.slots.find((slot) => slot.time === "9:00am")).toMatchObject({
      available: false,
      source: "google",
    });
    expect(result.slots.find((slot) => slot.time === "10:30am")).toMatchObject({
      available: false,
      source: "tidy_tails",
    });
  });

  it("returns idle and does not read appointments or Google Calendar for invalid dates", async () => {
    const result = await checkBookingAvailability({
      date: "next Tuesday",
      service_type: "full_groom",
    });

    expect(result).toEqual({
      status: "idle",
      message: "Choose a date to check availability.",
      slots: [],
    });
    expect(loadAppointmentsMock).not.toHaveBeenCalled();
    expect(readGoogleCalendarBusyBlocksForDateMock).not.toHaveBeenCalled();
  });
});

describe("googleCalendar actions", () => {
  it("disconnects Google Calendar through the server helper and redirects to settings", async () => {
    await expect(disconnectGoogleCalendarAction()).rejects.toThrow(
      "redirect:/settings?calendar=disconnected",
    );

    expect(disconnectGoogleCalendarMock).toHaveBeenCalledOnce();
  });

  it("redirects to an error URL when the disconnect helper reports an auth failure", async () => {
    disconnectGoogleCalendarMock.mockRejectedValue(
      new Error("Sign in before disconnecting Google Calendar."),
    );

    await expect(disconnectGoogleCalendarAction()).rejects.toThrow(
      "redirect:/settings?calendar=error&message=Sign%20in%20before%20disconnecting%20Google%20Calendar.",
    );
  });

  it("returns duration repair counts from the mocked calendar repair helper", async () => {
    const result = await repairCalendarDurationsAction({ status: "idle" });

    expect(result).toEqual({
      status: "done",
      message: "Updated 1 calendar event to 15-minute drop-off windows.",
      scanned: 2,
      updated: 1,
      alreadyCorrect: 1,
      skipped: 0,
      failed: 0,
    });
    expect(repairGoogleCalendarDropOffDurationsMock).toHaveBeenCalledOnce();
  });

  it("returns an error when the mocked repair helper is gated or unavailable", async () => {
    repairGoogleCalendarDropOffDurationsMock.mockResolvedValue({
      status: "disabled",
      message: "Google Calendar sync is switched off.",
    });

    const result = await repairCalendarDurationsAction({ status: "idle" });

    expect(result).toEqual({
      status: "error",
      message: "Google Calendar sync is switched off.",
    });
  });
});
