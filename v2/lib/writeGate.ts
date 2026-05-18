// Server-side write kill-switches for the post-cutover write flips.
//
// Each of v2's write surfaces — Add Appointment, Log Groom, Add Pet,
// Reminder send, Add Household — is gated by a PRIVATE, server-only environment flag. The flag
// names are deliberately NOT prefixed `NEXT_PUBLIC_`, so their values never
// reach the browser bundle: a flip is a server-side decision only.
//
// Default is OFF. A surface is enabled only when its flag is the EXACT string
// "on" — unset, empty, "false", "0", "off", "true", "ON", " on ", or any other
// value all read as OFF. Exact-match is intentional: a write kill-switch must
// fail safe, so anything ambiguous stays OFF.
//
// Enabling a surface  = set its flag to "on" in the Vercel project env, redeploy.
// Disabling a surface = unset the flag (or set anything else), redeploy.
// Neither is a code change — see _reports/2026-05-18-ship-2.2b-write-flip-plan.md.
//
// Server-only: import from server actions / Server Components, never client code.

// The one value that enables a write surface. Exact, case-sensitive, no trim.
const ENABLED = "on";

function isFlagEnabled(value: string | undefined): boolean {
  return value === ENABLED;
}

/** Add Appointment live writes — `TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE`. */
export function isAddAppointmentWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_ADD_APPOINTMENT_WRITE);
}

/** Log Groom live writes — `TIDYTAILS_ENABLE_LOG_GROOM_WRITE`. */
export function isLogGroomWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_LOG_GROOM_WRITE);
}

/** Reminder SMS send — `TIDYTAILS_ENABLE_REMINDER_SEND`. */
export function isReminderSendEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_REMINDER_SEND);
}

/** Add Pet live writes — `TIDYTAILS_ENABLE_ADD_PET_WRITE`. */
export function isAddPetWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_ADD_PET_WRITE);
}

/** Add Household live writes — `TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE`. */
export function isAddHouseholdWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE);
}
