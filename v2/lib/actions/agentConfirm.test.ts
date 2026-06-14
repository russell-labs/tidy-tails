import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointment, clientRecord } from "@/lib/actions/actionTestSupport";
import { DEFAULT_ORG_SETTINGS } from "@/lib/orgSettings";
import type {
  AddTipProposal,
  BookAppointmentProposal,
  LogGroomProposal,
} from "@/lib/agent/proposals";

// confirmAgentProposal is the ONLY write entry for the agent. It re-checks the
// agent gate + auth, then dispatches the proposal to the EXISTING gated action
// (which re-validates ownership, its own write gate, and audits). We mock the
// gated actions to assert: the right one is called, the FormData is correct,
// the agent-origin audit tag is set, and the action's state maps cleanly.

vi.mock("@/lib/writeGate", () => ({ isAgentEnabled: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/orgSettings.server", () => ({
  loadOrgSettings: vi.fn(async () => DEFAULT_ORG_SETTINGS),
}));
vi.mock("@/lib/data/repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/data/repo")>(
    "@/lib/data/repo",
  );
  return { ...actual, getClientRecord: vi.fn() };
});
vi.mock("./appointments", () => ({ createBooking: vi.fn() }));
vi.mock("./oneToOneBooking", () => ({ createOneToOneBooking: vi.fn() }));
vi.mock("./appointmentPayment", () => ({ markAppointmentPaid: vi.fn() }));
vi.mock("./grooms", () => ({ logGroom: vi.fn() }));

const { isAgentEnabled } = await import("@/lib/writeGate");
const { getCurrentUser } = await import("@/lib/supabase/server");
const { loadOrgSettings } = await import("@/lib/orgSettings.server");
const { getClientRecord } = await import("@/lib/data/repo");
const { createBooking } = await import("./appointments");
const { createOneToOneBooking } = await import("./oneToOneBooking");
const { markAppointmentPaid } = await import("./appointmentPayment");
const { logGroom } = await import("./grooms");
const { confirmAgentProposal } = await import("./agentConfirm");

const isAgentEnabledMock = vi.mocked(isAgentEnabled);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const loadOrgSettingsMock = vi.mocked(loadOrgSettings);
const getClientRecordMock = vi.mocked(getClientRecord);
const createBookingMock = vi.mocked(createBooking);
const createOneToOneBookingMock = vi.mocked(createOneToOneBooking);
const markAppointmentPaidMock = vi.mocked(markAppointmentPaid);
const logGroomMock = vi.mocked(logGroom);

const BOOK: BookAppointmentProposal = {
  kind: "book_appointment",
  clientId: "client-1",
  ownerName: "Mary Jones",
  petIds: ["pet-1"],
  petNames: "Kiwi",
  date: "2026-07-11",
  timeSlot: "10:00am",
  serviceType: "full_groom",
  service: "Full groom",
  fee: 50,
  location: "gina",
  locationLabel: "Tidy Tails (Gina)",
  durationMinutes: null,
};

const TIP: AddTipProposal = {
  kind: "add_tip",
  clientId: "client-1",
  petId: "pet-1",
  petName: "Kiwi",
  ownerName: "Mary Jones",
  appointmentDate: "2026-06-10",
  service: "Full groom",
  fee: 50,
  currentTip: 0,
  addedTip: 5,
  newTip: 5,
  paidAmount: 55,
  paymentMethod: "interac",
};

const LOG: LogGroomProposal = {
  kind: "log_groom",
  clientId: "client-1",
  petId: "pet-1",
  petName: "Kiwi",
  ownerName: "Mary Jones",
  date: "2026-06-12",
  serviceType: "bath_only",
  service: "Bath only",
  fee: 35,
  tip: 10,
  paymentMethod: "cash",
  paymentStatus: "paid",
  notes: "Used #4 blade",
};

beforeEach(() => {
  vi.clearAllMocks();
  isAgentEnabledMock.mockReturnValue(true);
  getCurrentUserMock.mockResolvedValue({ id: "user-1" } as never);
  loadOrgSettingsMock.mockResolvedValue(DEFAULT_ORG_SETTINGS);
});

describe("confirmAgentProposal — gate & auth", () => {
  it("refuses and writes nothing when the agent feature is off", async () => {
    isAgentEnabledMock.mockReturnValue(false);
    const result = await confirmAgentProposal(BOOK);
    expect(result.status).toBe("error");
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("refuses when there is no signed-in operator", async () => {
    getCurrentUserMock.mockResolvedValue(null as never);
    const result = await confirmAgentProposal(BOOK);
    expect(result.status).toBe("error");
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown proposal kind without calling any action", async () => {
    const result = await confirmAgentProposal({ kind: "wipe_db" } as never);
    expect(result.status).toBe("error");
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(markAppointmentPaidMock).not.toHaveBeenCalled();
    expect(logGroomMock).not.toHaveBeenCalled();
  });
});

describe("confirmAgentProposal — booking", () => {
  it("dispatches a batched booking to createBooking, tagged agent-originated", async () => {
    createBookingMock.mockResolvedValue({
      status: "saved",
      summary: { petName: "Kiwi", ownerName: "Mary Jones" },
    } as never);

    const result = await confirmAgentProposal(BOOK);

    expect(result.status).toBe("saved");
    expect(createBookingMock).toHaveBeenCalledTimes(1);
    const form = createBookingMock.mock.calls[0][1] as FormData;
    expect(form.get("client_id")).toBe("client-1");
    expect(form.get("pet_ids")).toBe("pet-1");
    expect(form.get("date")).toBe("2026-07-11");
    expect(form.get("time_slot")).toBe("10:00am");
    expect(form.get("service_type")).toBe("full_groom");
    expect(form.get("location")).toBe("gina");
    expect(form.get("fee")).toBe("50");
    expect(form.get("audit_source")).toBe("agent");
    // P3 never sends a customer text on an agent booking.
    expect(form.get("send_booking_text")).toBeFalsy();
  });

  it("dispatches a 1:1 booking to createOneToOneBooking with location + duration", async () => {
    loadOrgSettingsMock.mockResolvedValue({
      ...DEFAULT_ORG_SETTINGS,
      schedulingStyle: "one_to_one",
    });
    createOneToOneBookingMock.mockResolvedValue({
      status: "saved",
      summary: { petName: "Kiwi" },
    } as never);

    const result = await confirmAgentProposal({
      ...BOOK,
      location: "Home Studio",
      durationMinutes: 90,
    });

    expect(result.status).toBe("saved");
    expect(createBookingMock).not.toHaveBeenCalled();
    const form = createOneToOneBookingMock.mock.calls[0][1] as FormData;
    expect(form.get("pet_id")).toBe("pet-1");
    expect(form.get("location")).toBe("Home Studio");
    expect(form.get("duration_minutes")).toBe("90");
    expect(form.get("audit_source")).toBe("agent");
  });

  it("passes a gated state straight through (nothing saved)", async () => {
    createBookingMock.mockResolvedValue({
      status: "gated",
      summary: {},
      message: "Booking writes aren't switched on yet. Nothing was saved.",
    } as never);
    const result = await confirmAgentProposal(BOOK);
    expect(result.status).toBe("gated");
    expect(result.message).toContain("Nothing was saved");
  });
});

describe("confirmAgentProposal — add tip", () => {
  it("re-resolves the completed groom server-side and marks it paid with the new total", async () => {
    getClientRecordMock.mockResolvedValue(
      clientRecord({
        appointments: [
          appointment({
            id: "appt-done",
            pet_id: "pet-1",
            date: "2026-06-10",
            status: "completed",
            price: 50,
          }),
        ],
      }),
    );
    markAppointmentPaidMock.mockResolvedValue({
      status: "saved",
      petLabel: "Kiwi",
      message: "Marked Kiwi paid.",
    } as never);

    const result = await confirmAgentProposal(TIP);

    expect(result.status).toBe("saved");
    const form = markAppointmentPaidMock.mock.calls[0][1] as FormData;
    expect(form.get("appointment_id")).toBe("appt-done"); // resolved server-side, not trusted from the client
    expect(form.get("paid_amount")).toBe("55");
    expect(form.get("payment_method")).toBe("interac");
    expect(form.get("audit_source")).toBe("agent");
  });

  it("errors without calling the action when the groom can't be re-resolved", async () => {
    getClientRecordMock.mockResolvedValue(
      clientRecord({ appointments: [appointment({ status: "booked" })] }),
    );
    const result = await confirmAgentProposal(TIP);
    expect(result.status).toBe("error");
    expect(markAppointmentPaidMock).not.toHaveBeenCalled();
  });
});

describe("confirmAgentProposal — log groom", () => {
  it("dispatches to logGroom with the groom fields and notes, tagged agent-originated", async () => {
    logGroomMock.mockResolvedValue({
      status: "saved",
      summary: { petName: "Kiwi", ownerName: "Mary Jones" },
    } as never);

    const result = await confirmAgentProposal(LOG);

    expect(result.status).toBe("saved");
    const form = logGroomMock.mock.calls[0][1] as FormData;
    expect(form.get("client_id")).toBe("client-1");
    expect(form.get("pet_id")).toBe("pet-1");
    expect(form.get("date")).toBe("2026-06-12");
    expect(form.get("service_type")).toBe("bath_only");
    expect(form.get("fee")).toBe("35");
    expect(form.get("tip")).toBe("10");
    expect(form.get("payment_method")).toBe("cash");
    expect(form.get("payment_status")).toBe("paid");
    expect(form.get("notes")).toBe("Used #4 blade");
    expect(form.get("audit_source")).toBe("agent");
  });
});
