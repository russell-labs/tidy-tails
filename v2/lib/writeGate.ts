// Server-side write kill-switches for the post-cutover write flips.
//
// Each of v2's write/send/sync surfaces — Add Appointment, Log Groom, Add Pet,
// Edit Pet, Edit Client, Edit Appointment, Day Closeout, Reminder send, Add
// Household, and Google Calendar sync — is gated by a PRIVATE, server-only
// environment flag. The flag
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

/** Edit Pet live writes — `TIDYTAILS_ENABLE_EDIT_PET_WRITE`. */
export function isEditPetWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_EDIT_PET_WRITE);
}

/** Edit Client live writes — `TIDYTAILS_ENABLE_EDIT_CLIENT_WRITE`. */
export function isEditClientWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_EDIT_CLIENT_WRITE);
}

/** Delete Household (client) live writes — `TIDYTAILS_ENABLE_DELETE_CLIENT_WRITE`. */
export function isDeleteClientWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_DELETE_CLIENT_WRITE);
}

/** Edit Appointment live writes — `TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE`. */
export function isEditAppointmentWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_EDIT_APPOINTMENT_WRITE);
}

/** Day closeout payout override writes — `TIDYTAILS_ENABLE_DAY_CLOSEOUT_WRITE`. */
export function isDayCloseoutWriteEnabled(): boolean {
  return (
    isFlagEnabled(process.env.TIDYTAILS_ENABLE_DAY_CLOSEOUT_WRITE) ||
    isEditAppointmentWriteEnabled()
  );
}

/** Add Household live writes — `TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE`. */
export function isAddHouseholdWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_ADD_HOUSEHOLD_WRITE);
}

/** Google Calendar event sync — `TIDYTAILS_ENABLE_GOOGLE_CALENDAR_SYNC`. */
export function isGoogleCalendarSyncEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_GOOGLE_CALENDAR_SYNC);
}

/**
 * Admin "view-as" / support impersonation — `TIDYTAILS_ENABLE_ADMIN_VIEW_AS`.
 *
 * Not a write surface: view-as is read-only at the DB layer (TT-015). It reuses
 * the same exact-match, default-off, server-only flag semantics so the entire
 * feature — /admin, the impersonation RPCs' app entry points, the banner, and
 * the read pivot — is inert unless this flag is exactly "on".
 */
export function isAdminViewAsEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_ADMIN_VIEW_AS);
}
