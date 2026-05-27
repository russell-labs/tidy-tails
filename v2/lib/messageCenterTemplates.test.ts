import { describe, expect, it } from "vitest";
import type { AuditEvent } from "./audit";
import type { Appointment, Client, Pet } from "./data/types";
import {
  buildFirstPlatformSentClientIds,
  getMessageTemplateAvailability,
  isExistingHouseholdForPlatformIntro,
  renderMessageCenterTemplate,
} from "./messageCenterTemplates";
import {
  DEFAULT_SCHEDULE_CALIBRATION,
  DEFAULT_LOCATION_SETTINGS,
  type OperatorSettings,
} from "./operatorSettings";

const settings: OperatorSettings = {
  bookingConfirmationTemplate:
    "Hi [first name], booking confirmed for [pet name]: [service] on [date] at [time] at [location].",
  firstPlatformTextTemplate:
    "Hi [first name], new number for [pet name] on [date] at [time].",
  appointmentReminderTemplate: "Reminder for [pet name] on [date] at [time].",
  rebookReminderTemplate: "Hi [first name], should we book [pet name]?",
  readyPickupTemplate: "Hi [first name], [pet name] is ready.",
  lapsedThresholdDays: 90,
  scheduleCalibration: DEFAULT_SCHEDULE_CALIBRATION,
  locationSettings: DEFAULT_LOCATION_SETTINGS,
};

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    first_name: "Maya",
    last_name: "Cole",
    phone: "705-555-0101",
    alt_contact: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-05-01T10:00:00Z",
    ...overrides,
  };
}

function pet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: "pet-1",
    client_id: "client-1",
    name: "Kiwi",
    breed: null,
    color: null,
    sex: null,
    date_of_birth: null,
    allergies: false,
    allergies_detail: null,
    grooming_notes: null,
    typical_fee: null,
    created_at: "2026-05-01T10:00:00Z",
    ...overrides,
  };
}

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appointment-1",
    client_id: "client-1",
    pet_id: "pet-1",
    date: "2026-06-01",
    time_slot: "10:00 a.m.",
    service: "Full groom",
    price: null,
    tip: null,
    notes: null,
    status: null,
    location: "gina",
    google_calendar_id: null,
    google_event_id: null,
    google_sync_status: null,
    google_sync_error: null,
    google_synced_at: null,
    created_at: "2026-05-20T10:00:00Z",
    ...overrides,
  };
}

function audit(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    id: "audit-1",
    actor_id: "sam",
    event_type: "sms.sent",
    client_id: "client-1",
    pet_id: null,
    appointment_id: null,
    summary: "Sent SMS",
    metadata: {},
    created_at: "2026-05-20T10:00:00Z",
    ...overrides,
  };
}

describe("renderMessageCenterTemplate", () => {
  it("injects saved message templates with household, pet, and appointment placeholders", () => {
    expect(
      renderMessageCenterTemplate({
        key: "booking_confirmation",
        settings,
        client: client(),
        pets: [pet()],
        appointments: [appointment()],
      }),
    ).toBe(
      "Hi Maya, booking confirmed for Kiwi: Full groom on Jun 1, 2026 at 10:00 a.m. at 60 Olive Crescent, Orillia.",
    );
  });

  it("uses humane fallbacks when a thread has no pet or appointment context", () => {
    expect(
      renderMessageCenterTemplate({
        key: "appointment_reminder",
        settings,
        client: client({ first_name: "" }),
        pets: [],
        appointments: [],
      }),
    ).toBe("Reminder for your dog on soon at the scheduled time.");
  });
});

describe("first platform template eligibility", () => {
  it("detects households that already received the first-platform template", () => {
    const sent = buildFirstPlatformSentClientIds([
      audit({
        client_id: "client-1",
        metadata: { templateKey: "first_platform", source: "message_center" },
      }),
      audit({
        id: "audit-2",
        client_id: "client-2",
        metadata: { templateKey: "appointment_reminder" },
      }),
    ]);

    expect(sent.has("client-1")).toBe(true);
    expect(sent.has("client-2")).toBe(false);
  });

  it("only offers first-platform text to existing households that have not received it", () => {
    const existingClient = client({ created_at: "2026-05-01T10:00:00Z" });
    const newClient = client({ created_at: "2026-06-01T10:00:00Z" });

    expect(
      isExistingHouseholdForPlatformIntro(existingClient, [], new Date("2026-05-24T00:00:00Z")),
    ).toBe(true);
    expect(
      isExistingHouseholdForPlatformIntro(newClient, [], new Date("2026-05-24T00:00:00Z")),
    ).toBe(false);
    expect(
      getMessageTemplateAvailability({
        key: "first_platform",
        isExistingHousehold: true,
        firstPlatformAlreadySent: false,
      }),
    ).toEqual({ disabled: false });
    expect(
      getMessageTemplateAvailability({
        key: "first_platform",
        isExistingHousehold: true,
        firstPlatformAlreadySent: true,
      }),
    ).toEqual({ disabled: true, reason: "Already sent to this household." });
    expect(
      getMessageTemplateAvailability({
        key: "first_platform",
        isExistingHousehold: false,
        firstPlatformAlreadySent: false,
      }),
    ).toEqual({ disabled: true, reason: "Only for existing households." });
  });
});
