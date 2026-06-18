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
  isFeedbackAlertEnabled,
  isAgentEnabled,
  isAgentWritesEnabled,
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
  [
    "Feedback alert",
    isFeedbackAlertEnabled,
    "TIDYTAILS_ENABLE_FEEDBACK_ALERT",
  ],
  [
    "Agent Writes",
    isAgentWritesEnabled,
    "TIDYTAILS_ENABLE_AGENT_WRITES",
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
    expect(isFeedbackAlertEnabled()).toBe(false);
    expect(isAgentWritesEnabled()).toBe(false);
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

describe("agent feature gate — default OFF, exact-match ON", () => {
  it("is OFF when the flag is unset", () => {
    expect(isAgentEnabled()).toBe(false);
  });

  it('is ON for the exact value "on"', () => {
    vi.stubEnv("TIDYTAILS_ENABLE_AGENT", "on");
    expect(isAgentEnabled()).toBe(true);
  });

  it.each(NON_ENABLING)("is OFF for the non-enabling value %j", (value) => {
    vi.stubEnv("TIDYTAILS_ENABLE_AGENT", value);
    expect(isAgentEnabled()).toBe(false);
  });

  it("does not turn on when any write surface is enabled", () => {
    vi.stubEnv("TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE", "on");
    vi.stubEnv("TIDYTAILS_ENABLE_DAILY_INCOME_WRITE", "on");
    expect(isAgentEnabled()).toBe(false);
  });
});

describe("agent WRITES kill-switch — decoupled from deploy and from the per-action gates", () => {
  it("is OFF when the flag is unset (writes default off, even with the code deployed)", () => {
    expect(isAgentWritesEnabled()).toBe(false);
  });

  it('is ON only for the exact value "on"', () => {
    vi.stubEnv("TIDYTAILS_ENABLE_AGENT_WRITES", "on");
    expect(isAgentWritesEnabled()).toBe(true);
  });

  it("is independent of the per-action write gates: turning them ALL on does not enable agent writes", () => {
    for (const [, , flag] of SURFACES) {
      if (flag !== "TIDYTAILS_ENABLE_AGENT_WRITES") vi.stubEnv(flag, "on");
    }
    expect(isAgentWritesEnabled()).toBe(false);
  });

  it("is independent of the agent feature gate: enabling agent writes does not enable any per-action gate", () => {
    vi.stubEnv("TIDYTAILS_ENABLE_AGENT_WRITES", "on");
    expect(isAgentWritesEnabled()).toBe(true);
    expect(isAddAppointmentWriteEnabled()).toBe(false);
    expect(isLogGroomWriteEnabled()).toBe(false);
    expect(isReminderSendEnabled()).toBe(false);
    expect(isDeleteClientWriteEnabled()).toBe(false);
    expect(isDailyIncomeWriteEnabled()).toBe(false);
    expect(isAgentEnabled()).toBe(false);
  });
});
