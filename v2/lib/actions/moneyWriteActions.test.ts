import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment, ClientRecord } from "@/lib/data/types";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_noStore: vi.fn(),
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
  checkGoogleCalendarAppointmentAvailability: vi.fn(),
  deleteAppointmentFromGoogleCalendar: vi.fn(),
  syncAppointmentToGoogleCalendar: vi.fn(),
}));

vi.mock("@/lib/operatorSettings.server", () => ({
  readOperatorSettings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/twilio", () => ({
  getTwilioConfig: vi.fn(() => ({ ok: false })),
  sendTwilioSms: vi.fn(),
  toTwilioPhone: vi.fn((phone: string) => phone),
}));

import { createBooking } from "./appointments";
import { markAppointmentPaid } from "./appointmentPayment";
import { saveDayCloseoutOverride } from "./dayCloseout";
import { editAppointment } from "./editAppointment";
import { logGroom } from "./grooms";
import { recordAuditEvent } from "@/lib/audit.server";
import { getClientRecord, loadAppointments } from "@/lib/data/repo";
import {
  checkGoogleCalendarAppointmentAvailability,
  syncAppointmentToGoogleCalendar,
} from "@/lib/googleCalendar.server";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

type SupabaseError = { message: string } | null;
type SupabaseResult = { data?: unknown; error: SupabaseError };

type SupabaseOperation = {
  table: string;
  action: "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  options?: unknown;
  filters: Array<{
    method: "eq" | "in";
    column: string;
    value: unknown;
  }>;
  select?: string;
};

type QueryBuilder = PromiseLike<SupabaseResult> & {
  delete: () => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, value: unknown[]) => QueryBuilder;
  insert: (payload: unknown) => QueryBuilder;
  select: (columns?: string) => QueryBuilder;
  single: () => Promise<SupabaseResult>;
  update: (payload: unknown) => QueryBuilder;
  upsert: (payload: unknown, options?: unknown) => QueryBuilder;
};

const supabaseOperations: SupabaseOperation[] = [];
let queuedResults: SupabaseResult[] = [];

const defaultSupabaseResult = (): SupabaseResult => ({ data: null, error: null });

function nextSupabaseResult(): SupabaseResult {
  return queuedResults.shift() ?? defaultSupabaseResult();
}

function queueSupabaseResult(result: SupabaseResult): void {
  queuedResults.push(result);
}

function makeQueryBuilder(table: string): QueryBuilder {
  const operation = {
    table,
    filters: [],
  } as Omit<SupabaseOperation, "action"> & Partial<Pick<SupabaseOperation, "action">>;

  const builder: QueryBuilder = {
    delete: () => {
      operation.action = "delete";
      supabaseOperations.push(operation as SupabaseOperation);
      return builder;
    },
    eq: (column, value) => {
      operation.filters.push({ method: "eq", column, value });
      return builder;
    },
    in: (column, value) => {
      operation.filters.push({ method: "in", column, value });
      return builder;
    },
    insert: (payload) => {
      operation.action = "insert";
      operation.payload = payload;
      supabaseOperations.push(operation as SupabaseOperation);
      return builder;
    },
    select: (columns = "*") => {
      operation.select = columns;
      return builder;
    },
    single: async () => nextSupabaseResult(),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(nextSupabaseResult()).then(onFulfilled, onRejected),
    update: (payload) => {
      operation.action = "update";
      operation.payload = payload;
      supabaseOperations.push(operation as SupabaseOperation);
      return builder;
    },
    upsert: (payload, options) => {
      operation.action = "upsert";
      operation.payload = payload;
      operation.options = options;
      supabaseOperations.push(operation as SupabaseOperation);
      return builder;
    },
  };
  return builder;
}

const supabaseClient = {
  from: vi.fn((table: string) => makeQueryBuilder(table)),
};

const getCurrentUserMock = vi.mocked(getCurrentUser);
const createServerSupabaseMock = vi.mocked(createServerSupabase);
const getClientRecordMock = vi.mocked(getClientRecord);
const loadAppointmentsMock = vi.mocked(loadAppointments);
const readOperatorSettingsMock = vi.mocked(readOperatorSettings);
const checkGoogleCalendarAppointmentAvailabilityMock = vi.mocked(
  checkGoogleCalendarAppointmentAvailability,
);
const syncAppointmentToGoogleCalendarMock = vi.mocked(syncAppointmentToGoogleCalendar);
const recordAuditEventMock = vi.mocked(recordAuditEvent);

function isoDate(offsetDays = 0): string {
  const today = new Date();
  const date = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays),
  );
  return date.toISOString().slice(0, 10);
}

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt-1",
    client_id: "client-1",
    pet_id: "pet-1",
    date: isoDate(14),
    time_slot: "10:30am",
    service: "Full groom",
    price: 70,
    tip: null,
    notes: null,
    status: "booked",
    location: "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function clientRecord(
  overrides: {
    appointments?: Appointment[];
    pets?: ClientRecord["pets"];
  } = {},
): ClientRecord {
  const pets =
    overrides.pets ??
    [
      {
        id: "pet-1",
        client_id: "client-1",
        name: "Kiwi",
        breed: "Terrier",
        color: "Black",
        sex: "F",
        date_of_birth: null,
        allergies: false,
        allergies_detail: null,
        grooming_notes: null,
        typical_fee: 70,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
  return {
    client: {
      id: "client-1",
      first_name: "Mary",
      last_name: "Jones",
      phone: "7055550100",
      alt_contact: null,
      email: "mary@example.com",
      address: null,
      notes: null,
      sms_consent: false,
      sms_consent_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    pets,
    appointments: overrides.appointments ?? [appointment()],
  };
}

function appointmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "appt-1",
    client_id: "client-1",
    pet_id: "pet-1",
    date: isoDate(14),
    time_slot: "10:30am",
    service_type: "full_groom",
    fee: 80,
    tip: 12,
    notes: "Fresh trim [payment:interac; payment_status:paid]",
    status: "booked",
    location: "annette",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function expectNoSupabaseWrites(): void {
  expect(createServerSupabaseMock).not.toHaveBeenCalled();
  expect(supabaseOperations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  supabaseOperations.length = 0;
  queuedResults = [];

  vi.stubEnv("NEXT_PUBLIC_USE_LIVE_DATA", "on");
  getCurrentUserMock.mockResolvedValue({
    id: "operator-1",
  } as Awaited<ReturnType<typeof getCurrentUser>>);
  createServerSupabaseMock.mockResolvedValue(
    supabaseClient as unknown as Awaited<ReturnType<typeof createServerSupabase>>,
  );
  getClientRecordMock.mockResolvedValue(clientRecord());
  loadAppointmentsMock.mockResolvedValue([]);
  readOperatorSettingsMock.mockResolvedValue({
    locationSettings: {
      gina: {
        displayName: "Tidy Tails (Gina)",
        customerAddress: "60 Olive Crescent, Orillia",
        payoutType: "percent",
        salonKeepsPercent: 30,
        dailyRate: null,
      },
      annette: {
        displayName: "Tidy Tails (Annette)",
        customerAddress: "290 Millard Street, Orillia",
        payoutType: "percent",
        salonKeepsPercent: 35,
        dailyRate: null,
      },
    },
  } as Awaited<ReturnType<typeof readOperatorSettings>>);
  checkGoogleCalendarAppointmentAvailabilityMock.mockResolvedValue({
    status: "available",
    message: "Calendar is available.",
  });
  syncAppointmentToGoogleCalendarMock.mockResolvedValue({
    status: "synced",
    message: "Calendar event synced.",
  });
});

describe("markAppointmentPaid", () => {
  it("writes payment status and tip allocation when the edit-appointment gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE", "on");
    getClientRecordMock.mockResolvedValue(
      clientRecord({
        appointments: [
          appointment({
            price: 70,
            notes: "Coat notes",
          }),
        ],
      }),
    );

    const result = await markAppointmentPaid(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        payment_method: "interac",
        paid_amount: "85",
      }),
    );

    expect(result).toMatchObject({
      status: "saved",
      petLabel: "Kiwi",
    });
    expect(supabaseOperations).toEqual([
      {
        table: "appointments",
        action: "update",
        payload: {
          notes: "Coat notes [payment:interac; payment_status:paid]",
          tip: 15,
          net: 85,
        },
        filters: [
          { method: "eq", column: "id", value: "appt-1" },
          { method: "eq", column: "client_id", value: "client-1" },
        ],
      },
    ]);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "appointment.updated",
        metadata: expect.objectContaining({
          paymentMethod: "interac",
          paymentStatus: "paid",
          paidAmount: 85,
          tip: 15,
        }),
      }),
    );
  });

  it("returns gated and writes nothing when the edit-appointment gate is not exactly on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE", "true");

    const result = await markAppointmentPaid(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        payment_method: "cash",
        paid_amount: "70",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoSupabaseWrites();
  });

  it("returns an auth error and writes nothing when there is no operator user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await markAppointmentPaid(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        payment_method: "cash",
        paid_amount: "70",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoSupabaseWrites();
  });

  it("returns validation feedback and writes nothing for invalid payment input", async () => {
    const result = await markAppointmentPaid(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        payment_method: "cash",
        paid_amount: "not money",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter the amount they paid.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoSupabaseWrites();
  });
});

describe("saveDayCloseoutOverride", () => {
  it("upserts the payout override payload when the day-closeout gate is on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_DAY_CLOSEOUT_WRITE", "on");

    const result = await saveDayCloseoutOverride(
      { status: "idle" },
      form({
        date: isoDate(0),
        location: "gina",
        final_payout: "85.50",
        calculated_payout: "84.63",
        note: "Rounded cash closeout",
      }),
    );

    expect(result).toEqual({
      status: "saved",
      message: "Day closeout saved.",
    });
    expect(supabaseOperations).toHaveLength(1);
    expect(supabaseOperations[0]).toMatchObject({
      table: "day_closeout_overrides",
      action: "upsert",
      payload: {
        date: isoDate(0),
        location: "gina",
        final_payout: 85.5,
        calculated_payout: 84.63,
        note: "Rounded cash closeout",
        groomer_id: "operator-1",
      },
      options: {
        onConflict: "groomer_id,date,location",
      },
      filters: [],
    });
    expect(supabaseOperations[0].payload).toEqual(
      expect.objectContaining({
        updated_at: expect.any(String),
      }),
    );
  });

  it("returns gated and writes nothing when the day-closeout gate is not exactly on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_DAY_CLOSEOUT_WRITE", "true");
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE", "true");

    const result = await saveDayCloseoutOverride(
      { status: "idle" },
      form({
        date: isoDate(0),
        location: "annette",
        final_payout: "60",
        calculated_payout: "58",
        note: "Rounded at close",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoSupabaseWrites();
  });

  it("returns an auth error and writes nothing when there is no operator user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await saveDayCloseoutOverride(
      { status: "idle" },
      form({
        date: isoDate(0),
        location: "gina",
        final_payout: "85.50",
        calculated_payout: "84.63",
        note: "Rounded cash closeout",
      }),
    );

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expectNoSupabaseWrites();
  });

  it("returns field errors and writes nothing for invalid closeout input", async () => {
    const result = await saveDayCloseoutOverride(
      { status: "idle" },
      form({
        date: "tomorrow",
        location: "mobile",
        final_payout: "-1",
        calculated_payout: "nope",
        note: " ",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: {
        date: expect.any(String),
        location: expect.any(String),
        final_payout: expect.any(String),
        calculated_payout: expect.any(String),
        note: expect.any(String),
      },
    });
    expectNoSupabaseWrites();
  });
});

describe("editAppointment", () => {
  it("updates fee, tip, payment, location, and payout override when the edit gate is on", async () => {
    const editDate = isoDate(14);
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE", "on");
    getClientRecordMock.mockResolvedValue(
      clientRecord({
        appointments: [
          appointment({
            date: editDate,
            time_slot: "10:30am",
            service: "Full groom",
            price: 70,
            tip: 5,
            notes: "Old notes",
          }),
        ],
      }),
    );
    queueSupabaseResult({
      data: appointmentRow({
        date: editDate,
        fee: 80,
        tip: 12,
        notes:
          "Fresh trim [salon_payout:18] [payment:interac; payment_status:paid]",
      }),
      error: null,
    });

    const result = await editAppointment(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        date: editDate,
        time_slot: "10:30am",
        service_type: "full_groom",
        location: "annette",
        fee: "80",
        tip: "12",
        payment_method: "interac",
        payment_status: "paid",
        notes: "Fresh trim",
        salon_payout_override: "18",
      }),
    );

    expect(result).toMatchObject({
      status: "saved",
      summary: {
        fee: 80,
        tip: 12,
        paymentMethod: "interac",
        paymentStatus: "paid",
        location: "290 Millard Street, Orillia",
      },
    });
    expect(supabaseOperations).toEqual([
      {
        table: "appointments",
        action: "update",
        payload: {
          date: editDate,
          time_slot: "10:30am",
          service_type: "full_groom",
          location: "annette",
          fee: 80,
          tip: 12,
          net: 92,
          notes:
            "Fresh trim [salon_payout:18] [payment:interac; payment_status:paid]",
        },
        filters: [
          { method: "eq", column: "client_id", value: "client-1" },
          { method: "eq", column: "id", value: "appt-1" },
        ],
        select: "*",
      },
    ]);
    expect(syncAppointmentToGoogleCalendarMock).toHaveBeenCalledOnce();
  });

  it("returns gated and writes nothing when the edit gate is not exactly on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE", "yes");

    const result = await editAppointment(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        date: isoDate(14),
        time_slot: "10:30am",
        service_type: "full_groom",
        location: "gina",
        fee: "70",
        tip: "5",
        payment_method: "cash",
        payment_status: "paid",
        notes: "Trim face",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoSupabaseWrites();
  });

  it("returns an auth error and writes nothing when there is no operator user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await editAppointment(
      { status: "idle" },
      form({
        client_id: "client-1",
        appointment_id: "appt-1",
        date: isoDate(14),
        time_slot: "10:30am",
        service_type: "full_groom",
        location: "gina",
        fee: "70",
        tip: "5",
        payment_method: "cash",
        payment_status: "paid",
        notes: "Trim face",
      }),
    );

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoSupabaseWrites();
  });

  it("returns field errors and writes nothing for invalid edit input", async () => {
    const result = await editAppointment(
      { status: "idle" },
      form({
        client_id: "",
        appointment_id: "",
        date: "not-a-date",
        time_slot: "10:30am",
        service_type: "spa",
        location: "mobile",
        fee: "-1",
        tip: "-2",
        payment_method: "cheque",
        payment_status: "maybe",
        notes: "Trim face",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: {
        client_id: expect.any(String),
        appointment_id: expect.any(String),
        date: expect.any(String),
        service_type: expect.any(String),
        location: expect.any(String),
        fee: expect.any(String),
        tip: expect.any(String),
        payment_method: expect.any(String),
        payment_status: expect.any(String),
      },
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoSupabaseWrites();
  });
});

describe("createBooking", () => {
  it("inserts the appointment booking payload when the add-appointment gate is on", async () => {
    const bookingDate = isoDate(21);
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE", "on");
    queueSupabaseResult({
      data: [
        appointmentRow({
          id: "new-appt-1",
          date: bookingDate,
          fee: 72.5,
          tip: null,
          notes: "Use blue bow [salon_payout:15]",
          status: "booked",
          location: "gina",
        }),
      ],
      error: null,
    });

    const result = await createBooking(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        date: bookingDate,
        time_slot: "11:00am",
        service_type: "full_groom",
        location: "gina",
        fee: "72.50",
        notes: "Use blue bow",
        salon_payout_override: "15",
      }),
    );

    expect(result).toMatchObject({
      status: "saved",
      summary: {
        fee: 72.5,
        location: "60 Olive Crescent, Orillia",
      },
    });
    expect(supabaseOperations).toEqual([
      {
        table: "appointments",
        action: "insert",
        payload: [
          {
            client_id: "client-1",
            pet_id: "pet-1",
            date: bookingDate,
            time_slot: "11:00am",
            service_type: "full_groom",
            location: "gina",
            fee: 72.5,
            notes: "Use blue bow [salon_payout:15]",
            status: "booked",
          },
        ],
        filters: [],
        select: "*",
      },
    ]);
    expect(checkGoogleCalendarAppointmentAvailabilityMock).toHaveBeenCalledWith({
      date: bookingDate,
      timeSlot: "11:00am",
      service: "Full groom",
    });
    expect(syncAppointmentToGoogleCalendarMock).toHaveBeenCalledOnce();
  });

  it("returns gated and writes nothing when the add-appointment gate is not exactly on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE", "ON");

    const result = await createBooking(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        date: isoDate(21),
        time_slot: "11:00am",
        service_type: "full_groom",
        location: "gina",
        fee: "72.50",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expect(loadAppointmentsMock).not.toHaveBeenCalled();
    expectNoSupabaseWrites();
  });

  it("returns an auth error and writes nothing when there is no operator user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await createBooking(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        date: isoDate(21),
        time_slot: "11:00am",
        service_type: "full_groom",
        location: "gina",
        fee: "72.50",
      }),
    );

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoSupabaseWrites();
  });

  it("returns field errors and writes nothing for invalid booking input", async () => {
    const result = await createBooking(
      { status: "idle" },
      form({
        client_id: "",
        pet_id: "",
        date: "not-a-date",
        time_slot: "",
        service_type: "",
        fee: "-1",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: {
        client_id: expect.any(String),
        pet_id: expect.any(String),
        date: expect.any(String),
        time_slot: expect.any(String),
        service_type: expect.any(String),
        fee: expect.any(String),
      },
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoSupabaseWrites();
  });
});

describe("logGroom", () => {
  it("updates the matching booked appointment with completed groom money when the log-groom gate is on", async () => {
    const groomDate = isoDate(-1);
    vi.stubEnv("TIDYTAILS_ENABLE_LOG_GROOM_WRITE", "on");
    getClientRecordMock.mockResolvedValue(
      clientRecord({
        appointments: [
          appointment({
            id: "booked-appt-1",
            date: groomDate,
            status: "booked",
          }),
        ],
      }),
    );

    const result = await logGroom(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        date: groomDate,
        service_type: "full_groom",
        fee: "70",
        tip: "10",
        payment_method: "interac",
        payment_status: "paid",
        notes: "Matting behind ears",
      }),
    );

    expect(result).toMatchObject({
      status: "saved",
      summary: {
        fee: 70,
        tip: 10,
        paymentMethod: "interac",
        paymentStatus: "paid",
      },
    });
    expect(supabaseOperations).toEqual([
      {
        table: "appointments",
        action: "update",
        payload: {
          client_id: "client-1",
          pet_id: "pet-1",
          date: groomDate,
          service_type: "full_groom",
          fee: 70,
          tip: 10,
          net: 80,
          notes: "Matting behind ears [payment:interac; payment_status:paid]",
          status: "completed",
        },
        filters: [
          { method: "eq", column: "id", value: "booked-appt-1" },
          { method: "eq", column: "client_id", value: "client-1" },
        ],
      },
    ]);
  });

  it("returns gated and writes nothing when the log-groom gate is not exactly on", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_LOG_GROOM_WRITE", "1");

    const result = await logGroom(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        date: isoDate(-1),
        service_type: "full_groom",
        fee: "70",
        tip: "10",
        payment_method: "cash",
        payment_status: "paid",
      }),
    );

    expect(result).toMatchObject({ status: "gated" });
    expectNoSupabaseWrites();
  });

  it("returns an auth error and writes nothing when there is no operator user", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await logGroom(
      { status: "idle" },
      form({
        client_id: "client-1",
        pet_id: "pet-1",
        date: isoDate(-1),
        service_type: "full_groom",
        fee: "70",
        tip: "10",
        payment_method: "cash",
        payment_status: "paid",
      }),
    );

    expect(result).toEqual({
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoSupabaseWrites();
  });

  it("returns field errors and writes nothing for invalid groom input", async () => {
    const result = await logGroom(
      { status: "idle" },
      form({
        client_id: "",
        pet_id: "",
        date: isoDate(1),
        service_type: "spa",
        fee: "-1",
        tip: "-2",
        payment_method: "cheque",
        payment_status: "maybe",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      errors: {
        client_id: expect.any(String),
        pet_id: expect.any(String),
        date: expect.any(String),
        service_type: expect.any(String),
        fee: expect.any(String),
        tip: expect.any(String),
        payment_method: expect.any(String),
        payment_status: expect.any(String),
      },
    });
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expectNoSupabaseWrites();
  });
});

describe("createBooking — SMS consent gate (WS0)", () => {
  function bookingForm(overrides: Record<string, string> = {}) {
    return form({
      client_id: "client-1",
      pet_id: "pet-1",
      pet_ids: "pet-1",
      date: isoDate(21),
      time_slot: "11:00am",
      service_type: "full_groom",
      location: "gina",
      fee: "72.50",
      send_booking_text: "on",
      booking_message: "Hi, you're booked.",
      customer_phone: "7055550100",
      ...overrides,
    });
  }

  it("blocks the text when the client has not consented and none is captured", async () => {
    getClientRecordMock.mockResolvedValue(clientRecord()); // sms_consent: false

    const result = await createBooking({ status: "idle" }, bookingForm());

    expect(result).toMatchObject({
      status: "error",
      errors: { sms_consent: expect.any(String) },
    });
    // Gate runs before any write/send — nothing was persisted.
    expectNoSupabaseWrites();
  });

  it("allows the text when consent is already on file (behavior unchanged)", async () => {
    const record = clientRecord();
    getClientRecordMock.mockResolvedValue({
      ...record,
      client: { ...record.client, sms_consent: true },
    });

    // Write flag off -> the flow reaches `gated`, proving the gate let it
    // through (no sms_consent error).
    const result = await createBooking({ status: "idle" }, bookingForm());

    expect(result.status).toBe("gated");
    expect(
      (result as { errors?: { sms_consent?: string } }).errors?.sms_consent,
    ).toBeUndefined();
  });

  it("records consent on the client when it is captured at booking", async () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE", "on");
    getClientRecordMock.mockResolvedValue(clientRecord()); // not consented
    queueSupabaseResult({ data: null, error: null }); // clients consent update
    queueSupabaseResult({
      data: [appointmentRow({ id: "a1", date: isoDate(21) })],
      error: null,
    }); // appointment insert

    const result = await createBooking(
      { status: "idle" },
      bookingForm({ sms_consent: "on" }),
    );

    expect(result.status).toBe("saved");
    const clientsUpdate = supabaseOperations.find(
      (op) => op.table === "clients" && op.action === "update",
    );
    expect(clientsUpdate?.payload).toMatchObject({ sms_consent: true });
    expect(
      (clientsUpdate?.payload as { sms_consent_at?: unknown }).sms_consent_at,
    ).toEqual(expect.any(String));
  });
});
