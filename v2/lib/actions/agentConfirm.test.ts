import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointment, client, clientRecord, pet } from "@/lib/actions/actionTestSupport";
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

vi.mock("@/lib/writeGate", () => ({
  isAgentEnabled: vi.fn(() => true),
  isAgentWritesEnabled: vi.fn(() => true),
}));
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
  return { ...actual, getClientRecord: vi.fn(), loadDataset: vi.fn() };
});
vi.mock("./appointments", () => ({ createBooking: vi.fn() }));
vi.mock("./oneToOneBooking", () => ({ createOneToOneBooking: vi.fn() }));
vi.mock("./appointmentPayment", () => ({ markAppointmentPaid: vi.fn() }));
vi.mock("./grooms", () => ({ logGroom: vi.fn() }));
vi.mock("./intake", () => ({ saveIntake: vi.fn() }));
vi.mock("./pets", () => ({ addPet: vi.fn() }));
vi.mock("./editClient", () => ({ editClient: vi.fn() }));
vi.mock("./editPet", () => ({ editPet: vi.fn() }));
vi.mock("./editAppointment", () => ({
  editAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
  markAppointmentNoShow: vi.fn(),
}));
vi.mock("./deleteClient", () => ({ deleteClient: vi.fn() }));
vi.mock("./dayCloseout", () => ({ saveDayCloseoutOverride: vi.fn() }));
vi.mock("./reminders", () => ({ prepareReminder: vi.fn() }));
vi.mock("./inbox", () => ({ sendInboxSmsReply: vi.fn() }));

const { isAgentEnabled, isAgentWritesEnabled } = await import("@/lib/writeGate");
const { getCurrentUser } = await import("@/lib/supabase/server");
const { loadOrgSettings } = await import("@/lib/orgSettings.server");
const { getClientRecord, loadDataset } = await import("@/lib/data/repo");
const { createBooking } = await import("./appointments");
const { createOneToOneBooking } = await import("./oneToOneBooking");
const { markAppointmentPaid } = await import("./appointmentPayment");
const { logGroom } = await import("./grooms");
const { saveIntake } = await import("./intake");
const { addPet } = await import("./pets");
const { editClient } = await import("./editClient");
const { editPet } = await import("./editPet");
const { editAppointment, deleteAppointment, markAppointmentNoShow } = await import(
  "./editAppointment"
);
const { deleteClient } = await import("./deleteClient");
const { saveDayCloseoutOverride } = await import("./dayCloseout");
const { prepareReminder } = await import("./reminders");
const { sendInboxSmsReply } = await import("./inbox");
const { confirmAgentProposal } = await import("./agentConfirm");

const isAgentEnabledMock = vi.mocked(isAgentEnabled);
const isAgentWritesEnabledMock = vi.mocked(isAgentWritesEnabled);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const loadOrgSettingsMock = vi.mocked(loadOrgSettings);
const getClientRecordMock = vi.mocked(getClientRecord);
const loadDatasetMock = vi.mocked(loadDataset);

/** The org dataset the confirm action re-resolves household + pet ids from. */
function confirmDataset(overrides: {
  clients?: ReturnType<typeof client>[];
  pets?: ReturnType<typeof pet>[];
  appointments?: ReturnType<typeof appointment>[];
} = {}) {
  return {
    clients: overrides.clients ?? [client({ id: "client-1", first_name: "Mary", last_name: "Jones" })],
    pets: overrides.pets ?? [pet({ id: "pet-1", client_id: "client-1", name: "Kiwi" })],
    appointments: overrides.appointments ?? [],
    vaccinations: [],
  };
}
const createBookingMock = vi.mocked(createBooking);
const createOneToOneBookingMock = vi.mocked(createOneToOneBooking);
const markAppointmentPaidMock = vi.mocked(markAppointmentPaid);
const logGroomMock = vi.mocked(logGroom);
const saveIntakeMock = vi.mocked(saveIntake);
const addPetMock = vi.mocked(addPet);
const editClientMock = vi.mocked(editClient);
const editPetMock = vi.mocked(editPet);
const editAppointmentMock = vi.mocked(editAppointment);
const deleteAppointmentMock = vi.mocked(deleteAppointment);
const markAppointmentNoShowMock = vi.mocked(markAppointmentNoShow);
const deleteClientMock = vi.mocked(deleteClient);
const saveDayCloseoutOverrideMock = vi.mocked(saveDayCloseoutOverride);
const prepareReminderMock = vi.mocked(prepareReminder);
const sendInboxSmsReplyMock = vi.mocked(sendInboxSmsReply);

const BOOK: BookAppointmentProposal = {
  kind: "book_appointment",
  householdName: "Mary Jones",
  householdPhone: null,
  ownerName: "Mary Jones",
  petQueries: ["Kiwi"],
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
  isAgentWritesEnabledMock.mockReturnValue(true);
  getCurrentUserMock.mockResolvedValue({ id: "user-1" } as never);
  loadOrgSettingsMock.mockResolvedValue(DEFAULT_ORG_SETTINGS);
  loadDatasetMock.mockResolvedValue(confirmDataset() as never);
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

// TT-023: the model carries NAMES, not ids. The confirm action re-resolves the
// authoritative client_id + pet_id server-side from the org-scoped loader, so a
// fabricated/tampered/stale attribute can only ever resolve within THIS org (RLS)
// or fail safe — no write. (Tenancy itself is the RLS boundary, exercised by
// supabase/tests/cross_tenant_isolation.sql; these pin the confirm-path logic.)
describe("confirmAgentProposal — re-resolves ids from names server-side (no model id)", () => {
  it("books with the org's REAL ids resolved from the household + dog names", async () => {
    loadDatasetMock.mockResolvedValue(
      confirmDataset({
        clients: [client({ id: "real-7", first_name: "Mary", last_name: "Jones" })],
        pets: [pet({ id: "real-pet-9", client_id: "real-7", name: "Kiwi" })],
      }) as never,
    );
    createBookingMock.mockResolvedValue({ status: "saved", summary: { petName: "Kiwi" } } as never);
    await confirmAgentProposal(BOOK); // BOOK carries "Mary Jones"/"Kiwi" — no ids
    const form = createBookingMock.mock.calls[0][1] as FormData;
    expect(form.get("client_id")).toBe("real-7"); // resolved server-side, never from the model
    expect(form.get("pet_ids")).toBe("real-pet-9");
  });

  it("fails safe (no write) when the household name resolves to nothing in this org", async () => {
    loadDatasetMock.mockResolvedValue(
      confirmDataset({
        clients: [client({ id: "c-other", first_name: "Someone", last_name: "Else" })],
        pets: [],
      }) as never,
    );
    const result = await confirmAgentProposal(BOOK);
    expect(result.status).toBe("error");
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("an id-shaped attribute can't redirect the write — it's treated as a name and resolves nothing", async () => {
    // A tampered proposal carrying an id-looking household string still only ever
    // resolves against THIS org's data by name → matches nothing → no write.
    const tampered = { ...BOOK, householdName: "client-1" };
    loadDatasetMock.mockResolvedValue(confirmDataset() as never); // Mary Jones / Kiwi
    const result = await confirmAgentProposal(tampered);
    expect(result.status).toBe("error");
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("re-resolves the edit target household + dog + appointment from names", async () => {
    getClientRecordMock.mockResolvedValue(EDIT_APPT_RECORD);
    editAppointmentMock.mockResolvedValue({ status: "saved", summary: { petName: "Kiwi", ownerName: "Mary Jones" } } as never);
    const result = await confirmAgentProposal(EDIT_APPT_CHANGE); // names only
    expect(result.status).toBe("saved");
    const form = editAppointmentMock.mock.calls[0][1] as FormData;
    expect(form.get("client_id")).toBe("client-1"); // re-resolved from "Mary Jones"
    expect(form.get("appointment_id")).toBe("appt-1"); // re-resolved from pet + current date
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

// ---------------------------------------------------------------------------
// Phase 4 — every new proposal kind dispatches to its EXISTING gated action,
// with the right FormData and the agent-origin audit tag, and maps the action's
// state back. The model never reaches here — only Sam's confirm tap does.
// ---------------------------------------------------------------------------

import type {
  AddHouseholdProposal,
  AddPetProposal,
  DeleteHouseholdProposal,
  EditAppointmentProposal,
  EditHouseholdProposal,
  EditPetProposal,
  LogDailyIncomeProposal,
  SendTextProposal,
} from "@/lib/agent/proposals";

const ADD_HOUSEHOLD: AddHouseholdProposal = {
  kind: "add_household",
  ownerName: "Dana Reed",
  firstName: "Dana",
  lastName: "Reed",
  phone: "705-555-0190",
  secondaryContactName: null,
  secondaryCell: null,
  landline: null,
  email: "dana@example.com",
  address: null,
  notes: null,
  smsConsent: true,
  pet: {
    name: "Biscuit",
    breed: "Beagle",
    size: "medium",
    allergies: false,
    allergiesDetail: null,
    vaccinationState: "yes",
    vaccinationDetail: "Rabies current",
    dateOfBirth: null,
    groomingNotes: null,
    typicalFee: 72,
  },
};

const ADD_PET: AddPetProposal = {
  kind: "add_pet",
  clientId: "client-1",
  ownerName: "Mary Jones",
  name: "Maple",
  breed: "Poodle",
  size: "medium",
  allergies: true,
  allergiesDetail: "Chicken",
  groomingNotes: null,
  typicalFee: 82,
};

const EDIT_HOUSEHOLD: EditHouseholdProposal = {
  kind: "edit_household",
  clientId: "client-1",
  ownerName: "Mary Jones",
  firstName: "Mary",
  lastName: "Jones",
  phone: "705-555-7777",
  secondaryContactName: "Pat",
  secondaryCell: "705-555-0112",
  landline: null,
  email: "mary@example.com",
  address: "10 Main Street",
  notes: null,
  changes: ["phone → 705-555-7777"],
};

const EDIT_PET: EditPetProposal = {
  kind: "edit_pet",
  clientId: "client-1",
  petId: "pet-1",
  petName: "Kiwi",
  name: "Kiwi",
  breed: "Terrier",
  size: "small",
  color: "Black",
  dateOfBirth: null,
  allergies: true,
  allergiesDetail: "Oatmeal only",
  groomingNotes: "Use #5 blade",
  typicalFee: 75,
  changes: ["grooming notes → Use #5 blade"],
};

const EDIT_APPT_CHANGE: EditAppointmentProposal = {
  kind: "edit_appointment",
  mode: "reschedule_change",
  householdName: "Mary Jones",
  householdPhone: null,
  petQuery: "Kiwi",
  targetDate: "2026-07-20", // the visit's CURRENT date — re-resolves the id
  targetTimeSlot: "10:30am",
  ownerName: "Mary Jones",
  petName: "Kiwi",
  date: "2026-07-21", // the NEW date written
  timeSlot: "10:30am",
  serviceType: "full_groom",
  service: "Full groom",
  location: "gina",
  locationLabel: "Tidy Tails (Gina)",
  fee: 70,
  tip: null,
  paymentMethod: "cash",
  paymentStatus: "paid",
  notes: "Trim face",
  salonPayoutOverride: 18,
  changes: ["date → 2026-07-21"],
};

const EDIT_APPT_CANCEL: EditAppointmentProposal = {
  kind: "edit_appointment",
  mode: "cancel",
  householdName: "Mary Jones",
  householdPhone: null,
  petQuery: "Kiwi",
  targetDate: "2026-07-20",
  targetTimeSlot: "10:30am",
  ownerName: "Mary Jones",
  petName: "Kiwi",
  date: "2026-07-20",
  service: "Full groom",
};

const EDIT_APPT_NO_SHOW: EditAppointmentProposal = {
  kind: "edit_appointment",
  mode: "no_show",
  householdName: "Mary Jones",
  householdPhone: null,
  petQuery: "Kiwi",
  targetDate: "2026-07-20",
  targetTimeSlot: "10:30am",
  ownerName: "Mary Jones",
  petName: "Kiwi",
  date: "2026-07-20",
  service: "Full groom",
};

/** The org-scoped record the confirm action re-resolves the appointment id from. */
const EDIT_APPT_RECORD = clientRecord({
  client: { id: "client-1" },
  appointments: [
    appointment({
      id: "appt-1",
      client_id: "client-1",
      pet_id: "pet-1",
      date: "2026-07-20",
      time_slot: "10:30am",
      status: "booked",
      service: "Full groom",
    }),
  ],
});

const DELETE_HOUSEHOLD: DeleteHouseholdProposal = {
  kind: "delete_household",
  clientId: "client-1",
  ownerName: "Mary Jones",
  petNames: "Kiwi",
  petCount: 1,
  appointmentCount: 0,
  hasHistory: false,
};

const LOG_DAILY_INCOME: LogDailyIncomeProposal = {
  kind: "log_daily_income",
  date: "2026-07-12",
  location: "gina",
  locationLabel: "Tidy Tails (Gina)",
  finalPayout: 240,
  calculatedPayout: 168,
  note: "Paid by salon — kept 100%.",
  paidBySalon: true,
};

const SEND_REMINDER: SendTextProposal = {
  kind: "send_text",
  mode: "reminder",
  clientId: "client-1",
  petId: "pet-1",
  targetDate: "2026-07-20", // the visit's CURRENT date — re-resolves the id (matches EDIT_APPT_RECORD → appt-1)
  targetTimeSlot: "10:30am",
  recipientLabel: "Mary Jones",
  toNumber: "705-555-0101",
  context: "Full groom · Jul 12 · 9:00am",
  message: "Hi Mary, reminder Kiwi is booked Saturday 9am.",
};

const SEND_REPLY: SendTextProposal = {
  kind: "send_text",
  mode: "reply",
  smsId: "sms-1",
  recipientLabel: "Mary Jones",
  message: "Yes, 2pm works — see you then!",
};

describe("confirmAgentProposal — add household / pet", () => {
  it("dispatches add_household to saveIntake with owner + pet fields, agent-tagged", async () => {
    saveIntakeMock.mockResolvedValue({ status: "saved", summary: { ownerName: "Dana Reed" } } as never);
    const result = await confirmAgentProposal(ADD_HOUSEHOLD);
    expect(result.status).toBe("saved");
    const form = saveIntakeMock.mock.calls[0][1] as FormData;
    expect(form.get("first_name")).toBe("Dana");
    expect(form.get("phone")).toBe("705-555-0190");
    expect(form.get("pet_name")).toBe("Biscuit");
    expect(form.get("allergy_state")).toBe("no");
    expect(form.get("vaccination_state")).toBe("yes");
    expect(form.get("sms_consent")).toBe("on");
    expect(form.get("typical_fee")).toBe("72");
    expect(form.get("audit_source")).toBe("agent");
  });

  it("dispatches add_pet to addPet, agent-tagged", async () => {
    addPetMock.mockResolvedValue({ status: "saved", summary: { petName: "Maple", ownerName: "Mary Jones" } } as never);
    const result = await confirmAgentProposal(ADD_PET);
    expect(result.status).toBe("saved");
    const form = addPetMock.mock.calls[0][1] as FormData;
    expect(form.get("client_id")).toBe("client-1");
    expect(form.get("name")).toBe("Maple");
    expect(form.get("allergy_state")).toBe("yes");
    expect(form.get("allergies_detail")).toBe("Chicken");
    expect(form.get("audit_source")).toBe("agent");
  });
});

describe("confirmAgentProposal — edit household / pet", () => {
  it("dispatches edit_household to editClient with the full merged contact, agent-tagged", async () => {
    editClientMock.mockResolvedValue({ status: "saved", summary: { ownerName: "Mary Jones" } } as never);
    const result = await confirmAgentProposal(EDIT_HOUSEHOLD);
    expect(result.status).toBe("saved");
    const form = editClientMock.mock.calls[0][1] as FormData;
    expect(form.get("client_id")).toBe("client-1");
    expect(form.get("phone")).toBe("705-555-7777");
    expect(form.get("secondary_contact_name")).toBe("Pat");
    expect(form.get("audit_source")).toBe("agent");
  });

  it("dispatches edit_pet to editPet with the full merged profile, agent-tagged", async () => {
    editPetMock.mockResolvedValue({ status: "saved", summary: { petName: "Kiwi", ownerName: "Mary Jones" } } as never);
    const result = await confirmAgentProposal(EDIT_PET);
    expect(result.status).toBe("saved");
    const form = editPetMock.mock.calls[0][1] as FormData;
    expect(form.get("pet_id")).toBe("pet-1");
    expect(form.get("grooming_notes")).toBe("Use #5 blade");
    expect(form.get("allergy_state")).toBe("yes");
    expect(form.get("audit_source")).toBe("agent");
  });
});

describe("confirmAgentProposal — edit appointment", () => {
  beforeEach(() => {
    // Default: the visit is still on file, so re-resolution finds appt-1.
    getClientRecordMock.mockResolvedValue(EDIT_APPT_RECORD);
  });

  it("dispatches a reschedule/change to editAppointment with merged fields, agent-tagged", async () => {
    editAppointmentMock.mockResolvedValue({ status: "saved", summary: { petName: "Kiwi", ownerName: "Mary Jones" } } as never);
    const result = await confirmAgentProposal(EDIT_APPT_CHANGE);
    expect(result.status).toBe("saved");
    const form = editAppointmentMock.mock.calls[0][1] as FormData;
    expect(form.get("appointment_id")).toBe("appt-1"); // re-resolved server-side from pet + current date
    expect(form.get("date")).toBe("2026-07-21");
    expect(form.get("service_type")).toBe("full_groom");
    expect(form.get("location")).toBe("gina");
    expect(form.get("salon_payout_override")).toBe("18");
    expect(form.get("send_booking_update_text")).toBeFalsy(); // agent edit never auto-texts here
    expect(form.get("audit_source")).toBe("agent");
    expect(deleteAppointmentMock).not.toHaveBeenCalled();
  });

  it("dispatches a cancel to deleteAppointment, agent-tagged", async () => {
    deleteAppointmentMock.mockResolvedValue({ status: "deleted", summary: { petName: "Kiwi" }, message: "Removed." } as never);
    const result = await confirmAgentProposal(EDIT_APPT_CANCEL);
    expect(result.status).toBe("saved");
    const form = deleteAppointmentMock.mock.calls[0][1] as FormData;
    expect(form.get("appointment_id")).toBe("appt-1");
    expect(form.get("send_cancellation_text")).toBeFalsy(); // never auto-texts on an agent cancel
    expect(form.get("audit_source")).toBe("agent");
    expect(editAppointmentMock).not.toHaveBeenCalled();
  });

  it("dispatches a no-show to markAppointmentNoShow (not edit or delete), agent-tagged", async () => {
    markAppointmentNoShowMock.mockResolvedValue({ status: "saved", summary: { petName: "Kiwi", ownerName: "Mary Jones" } } as never);
    const result = await confirmAgentProposal(EDIT_APPT_NO_SHOW);
    expect(result.status).toBe("saved");
    expect(markAppointmentNoShowMock).toHaveBeenCalledTimes(1);
    const form = markAppointmentNoShowMock.mock.calls[0][1] as FormData;
    expect(form.get("client_id")).toBe("client-1");
    expect(form.get("appointment_id")).toBe("appt-1");
    expect(form.get("audit_source")).toBe("agent");
    expect(editAppointmentMock).not.toHaveBeenCalled();
    expect(deleteAppointmentMock).not.toHaveBeenCalled();
  });

  it("re-resolves the appointment id server-side — a tampered/stale tuple matching nothing writes nothing", async () => {
    getClientRecordMock.mockResolvedValue(
      clientRecord({
        client: { id: "client-1" },
        // The visit was moved/removed; nothing matches pet-1 on 2026-07-20.
        appointments: [appointment({ id: "appt-9", pet_id: "pet-1", client_id: "client-1", date: "2026-09-09" })],
      }),
    );
    const result = await confirmAgentProposal(EDIT_APPT_CANCEL);
    expect(result.status).toBe("error");
    expect(deleteAppointmentMock).not.toHaveBeenCalled();
    expect(editAppointmentMock).not.toHaveBeenCalled();
    expect(markAppointmentNoShowMock).not.toHaveBeenCalled();
  });

  it("re-resolves the RIGHT visit by time when the pet has two on the same date (no wrong write)", async () => {
    getClientRecordMock.mockResolvedValue(
      clientRecord({
        client: { id: "client-1" },
        appointments: [
          appointment({ id: "appt-am", pet_id: "pet-1", client_id: "client-1", date: "2026-07-20", time_slot: "10:00am", status: "booked" }),
          appointment({ id: "appt-pm", pet_id: "pet-1", client_id: "client-1", date: "2026-07-20", time_slot: "10:30am", status: "booked" }),
        ],
      }),
    );
    deleteAppointmentMock.mockResolvedValue({ status: "deleted", summary: { petName: "Kiwi" }, message: "Removed." } as never);
    // EDIT_APPT_CANCEL.targetTimeSlot is "10:30am" → must hit appt-pm, not appt-am.
    const result = await confirmAgentProposal(EDIT_APPT_CANCEL);
    expect(result.status).toBe("saved");
    const form = deleteAppointmentMock.mock.calls[0][1] as FormData;
    expect(form.get("appointment_id")).toBe("appt-pm");
  });
});

describe("confirmAgentProposal — delete household (destructive)", () => {
  it("dispatches to deleteClient, agent-tagged", async () => {
    deleteClientMock.mockResolvedValue({ status: "deleted", ownerName: "Mary Jones", message: "Deleted." } as never);
    const result = await confirmAgentProposal(DELETE_HOUSEHOLD);
    expect(result.status).toBe("saved");
    const form = deleteClientMock.mock.calls[0][1] as FormData;
    expect(form.get("client_id")).toBe("client-1");
    expect(form.get("audit_source")).toBe("agent");
  });

  it("passes a blocked (error) delete straight through without claiming success", async () => {
    deleteClientMock.mockResolvedValue({ status: "error", message: "This household has groom history and can't be deleted." } as never);
    const result = await confirmAgentProposal(DELETE_HOUSEHOLD);
    expect(result.status).toBe("error");
    expect(result.message).toContain("history");
  });
});

describe("confirmAgentProposal — log daily income", () => {
  it("dispatches to saveDayCloseoutOverride with the override fields, agent-tagged", async () => {
    saveDayCloseoutOverrideMock.mockResolvedValue({ status: "saved", message: "Day closeout saved." } as never);
    const result = await confirmAgentProposal(LOG_DAILY_INCOME);
    expect(result.status).toBe("saved");
    const form = saveDayCloseoutOverrideMock.mock.calls[0][1] as FormData;
    expect(form.get("date")).toBe("2026-07-12");
    expect(form.get("location")).toBe("gina");
    expect(form.get("final_payout")).toBe("240");
    expect(form.get("note")).toContain("salon");
    expect(form.get("audit_source")).toBe("agent");
  });
});

describe("confirmAgentProposal — send text (never auto-sends)", () => {
  it("dispatches a reminder to prepareReminder, re-resolving the appointment id server-side from pet + date", async () => {
    getClientRecordMock.mockResolvedValue(EDIT_APPT_RECORD);
    prepareReminderMock.mockResolvedValue({ status: "sent", summary: {} } as never);
    const result = await confirmAgentProposal(SEND_REMINDER);
    expect(result.status).toBe("saved");
    const form = prepareReminderMock.mock.calls[0][1] as FormData;
    expect(form.get("client_id")).toBe("client-1");
    expect(form.get("appointment_id")).toBe("appt-1"); // re-resolved server-side, not trusted from the client
    expect(form.get("to_number")).toBe("705-555-0101");
    expect(form.get("message")).toBe(SEND_REMINDER.message);
    expect(form.get("audit_source")).toBe("agent");
  });

  it("fails a reminder safe when the appointment can't be re-resolved (no send)", async () => {
    getClientRecordMock.mockResolvedValue(
      clientRecord({ client: { id: "client-1" }, appointments: [] }),
    );
    const result = await confirmAgentProposal(SEND_REMINDER);
    expect(result.status).toBe("error");
    expect(prepareReminderMock).not.toHaveBeenCalled();
  });

  it("dispatches a reply to sendInboxSmsReply with the sms_id + drafted message", async () => {
    sendInboxSmsReplyMock.mockResolvedValue({ status: "sent", message: "Reply sent." } as never);
    const result = await confirmAgentProposal(SEND_REPLY);
    expect(result.status).toBe("saved");
    const form = sendInboxSmsReplyMock.mock.calls[0][1] as FormData;
    expect(form.get("sms_id")).toBe("sms-1");
    expect(form.get("message")).toBe(SEND_REPLY.message);
  });

  it("does not call ANY send action just by constructing the proposal (send only on dispatch)", async () => {
    // Sanity: dispatch is the only path that calls a send action; a different kind never does.
    saveDayCloseoutOverrideMock.mockResolvedValue({ status: "saved", message: "ok" } as never);
    await confirmAgentProposal(LOG_DAILY_INCOME);
    expect(prepareReminderMock).not.toHaveBeenCalled();
    expect(sendInboxSmsReplyMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The assistant-WRITES kill switch (TIDYTAILS_ENABLE_AGENT_WRITES). This lets
// the write CODE deploy to prod while writes stay OFF — read-only assistant,
// decoupled from enabling execution. When it's off, confirmAgentProposal blocks
// EVERY proposal kind server-side BEFORE dispatching to any gated action — so
// even with every per-action write gate on, the assistant cannot write. The
// model/UI may still propose/render; only EXECUTION is blocked.
// ---------------------------------------------------------------------------

describe("confirmAgentProposal — assistant-writes kill switch (TIDYTAILS_ENABLE_AGENT_WRITES off)", () => {
  // Every proposal kind paired with the gated action it would otherwise dispatch to.
  const EVERY_KIND: ReadonlyArray<readonly [string, Parameters<typeof confirmAgentProposal>[0], () => unknown]> = [
    ["book_appointment", BOOK, () => createBookingMock],
    ["book_appointment (1:1)", { ...BOOK, location: "Home Studio", durationMinutes: 90 }, () => createOneToOneBookingMock],
    ["add_tip", TIP, () => markAppointmentPaidMock],
    ["log_groom", LOG, () => logGroomMock],
    ["add_household", ADD_HOUSEHOLD, () => saveIntakeMock],
    ["add_pet", ADD_PET, () => addPetMock],
    ["edit_household", EDIT_HOUSEHOLD, () => editClientMock],
    ["edit_pet", EDIT_PET, () => editPetMock],
    ["edit_appointment (change)", EDIT_APPT_CHANGE, () => editAppointmentMock],
    ["edit_appointment (cancel)", EDIT_APPT_CANCEL, () => deleteAppointmentMock],
    ["delete_household", DELETE_HOUSEHOLD, () => deleteClientMock],
    ["log_daily_income", LOG_DAILY_INCOME, () => saveDayCloseoutOverrideMock],
    ["send_text (reminder)", SEND_REMINDER, () => prepareReminderMock],
    ["send_text (reply)", SEND_REPLY, () => sendInboxSmsReplyMock],
  ];

  it.each(EVERY_KIND)(
    "blocks %s with status 'gated' and dispatches to NO gated action",
    async (_name, proposal, getActionMock) => {
      isAgentWritesEnabledMock.mockReturnValue(false);
      // The completed-groom lookup (for add_tip) would also be a pre-dispatch step;
      // the block happens before it, so nothing — not even the read — runs.
      getClientRecordMock.mockResolvedValue(
        clientRecord({
          appointments: [
            appointment({ id: "appt-done", pet_id: "pet-1", date: "2026-06-10", status: "completed", price: 50 }),
          ],
        }),
      );

      const result = await confirmAgentProposal(proposal);

      expect(result.status).toBe("gated");
      expect(getActionMock()).not.toHaveBeenCalled();
    },
  );

  it("blocks BEFORE any gated action even when EVERY per-action write gate is on (deploy ≠ enabled)", async () => {
    // The kill switch is the master block: per-action gates being on is irrelevant.
    isAgentWritesEnabledMock.mockReturnValue(false);
    const result = await confirmAgentProposal(BOOK);
    expect(result.status).toBe("gated");
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(createOneToOneBookingMock).not.toHaveBeenCalled();
  });

  it("does not even re-resolve the groom (no read) for add_tip when writes are off", async () => {
    isAgentWritesEnabledMock.mockReturnValue(false);
    const result = await confirmAgentProposal(TIP);
    expect(result.status).toBe("gated");
    expect(getClientRecordMock).not.toHaveBeenCalled();
    expect(markAppointmentPaidMock).not.toHaveBeenCalled();
  });

  it("with the kill switch ON, behaves exactly as today (dispatches the write)", async () => {
    isAgentWritesEnabledMock.mockReturnValue(true);
    createBookingMock.mockResolvedValue({
      status: "saved",
      summary: { petName: "Kiwi", ownerName: "Mary Jones" },
    } as never);
    const result = await confirmAgentProposal(BOOK);
    expect(result.status).toBe("saved");
    expect(createBookingMock).toHaveBeenCalledTimes(1);
  });
});
