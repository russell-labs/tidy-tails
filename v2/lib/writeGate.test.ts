import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isAddAppointmentWriteEnabled,
  isLogGroomWriteEnabled,
  isReminderSendEnabled,
  isAddPetWriteEnabled,
  isAddHouseholdWriteEnabled,
  isEditPetWriteEnabled,
  isEditClientWriteEnabled,
  isDeleteClientWriteEnabled,
  isEditAppointmentWriteEnabled,
  isDailyIncomeWriteEnabled,
  isGoogleCalendarSyncEnabled,
} from "./writeGate";

// The post-cutover write kill-switches. Each of v2's four write surfaces is
// gated by a PRIVATE, server-only env flag — deliberately not NEXT_PUBLIC_, so
// the value never reaches the browser bundle. These tests pin the contract:
// a surface is OFF unless its flag is the exact string "on". Default is OFF.

// (gate function, its env flag) for each write surface.
const SURFACES = [
  [
    "Add Appointment",
    isAddAppointmentWriteEnabled,
    "TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE",
  ],
  ["Log Groom", isLogGroomWriteEnabled, "TIDYTAILS_ENABLE_LOG_GROOM_WRITE"],
  ["Reminder send", isReminderSendEnabled, "TIDYTAILS_ENABLE_REMINDER_SEND"],
  ["Add Pet", isAddPetWriteEnabled, "TIDYTAILS_ENABLE_ADD_PET_WRITE"],
  ["Edit Pet", isEditPetWriteEnabled, "TIDYTAILS_ENABLE_EDIT_PET_WRITE"],
  ["Edit Client", isEditClientWriteEnabled, "TIDYTAILS_ENABLE_EDIT_CLIENT_WRITE"],
  [
    "Delete Client",
    isDeleteClientWriteEnabled,
    "TIDYTAILS_ENABLE_DELETE_CLIENT_WRITE",
  ],
  [
    "Edit Appointment",
    isEditAppointmentWriteEnabled,
    "TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE",
  ],
  [
    "Add Household",
    isAddHouseholdWriteEnabled,
    "TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE",
  ],
  [
    "Daily Income",
    isDailyIncomeWriteEnabled,
    "TIDYTAILS_ENABLE_DAILY_INCOME_WRITE",
  ],
  [
    "Google Calendar sync",
    isGoogleCalendarSyncEnabled,
    "TIDYTAILS_ENABLE_GOOGLE_CALENDAR_SYNC",
  ],
] as const;

// Values that must NOT enable a surface — falsey strings, near-misses, garbage,
// and case/whitespace variants of the safe value. Unset is covered separately.
const NON_ENABLING = [
  "",
  "false",
  "0",
  "off",
  "no",
  "true",
  "yes",
  "1",
  "enabled",
  "ON",
  "On",
  " on ",
  "on ",
  "garbage",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("write-gate kill-switches — default OFF, exact-match ON", () => {
  for (const [name, isEnabled, flag] of SURFACES) {
    describe(name, () => {
      it("is OFF when the flag is unset", () => {
        expect(isEnabled()).toBe(false);
      });

      it('is ON for the exact value "on"', () => {
        vi.stubEnv(flag, "on");
        expect(isEnabled()).toBe(true);
      });

      it.each(NON_ENABLING)(
        "is OFF for the non-enabling value %j",
        (value) => {
          vi.stubEnv(flag, value);
          expect(isEnabled()).toBe(false);
        },
      );
    });
  }
});

describe("write-gate isolation — one flag never enables another", () => {
  it("enabling Add Appointment leaves the other three OFF", () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE", "on");
    expect(isAddAppointmentWriteEnabled()).toBe(true);
    expect(isLogGroomWriteEnabled()).toBe(false);
    expect(isAddPetWriteEnabled()).toBe(false);
    expect(isEditPetWriteEnabled()).toBe(false);
    expect(isEditClientWriteEnabled()).toBe(false);
    expect(isDeleteClientWriteEnabled()).toBe(false);
    expect(isEditAppointmentWriteEnabled()).toBe(false);
    expect(isReminderSendEnabled()).toBe(false);
    expect(isAddHouseholdWriteEnabled()).toBe(false);
    expect(isDailyIncomeWriteEnabled()).toBe(false);
    expect(isGoogleCalendarSyncEnabled()).toBe(false);
  });

  it("enabling Log Groom leaves the other three OFF", () => {
    vi.stubEnv("TIDYTAILS_ENABLE_LOG_GROOM_WRITE", "on");
    expect(isLogGroomWriteEnabled()).toBe(true);
    expect(isAddAppointmentWriteEnabled()).toBe(false);
    expect(isAddPetWriteEnabled()).toBe(false);
    expect(isEditPetWriteEnabled()).toBe(false);
    expect(isEditClientWriteEnabled()).toBe(false);
    expect(isDeleteClientWriteEnabled()).toBe(false);
    expect(isEditAppointmentWriteEnabled()).toBe(false);
    expect(isReminderSendEnabled()).toBe(false);
    expect(isAddHouseholdWriteEnabled()).toBe(false);
    expect(isDailyIncomeWriteEnabled()).toBe(false);
    expect(isGoogleCalendarSyncEnabled()).toBe(false);
  });
});
