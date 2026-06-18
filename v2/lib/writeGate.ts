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

/** Daily income (lump-sum rented-chair) live writes — `TIDYTAILS_ENABLE_DAILY_INCOME_WRITE`. */
export function isDailyIncomeWriteEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_DAILY_INCOME_WRITE);
}

/** Google Calendar event sync — `TIDYTAILS_ENABLE_GOOGLE_CALENDAR_SYNC`. */
export function isGoogleCalendarSyncEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_GOOGLE_CALENDAR_SYNC);
}

/**
 * Owner feedback-alert SMS — `TIDYTAILS_ENABLE_FEEDBACK_ALERT`.
 *
 * Gates the ONE new outbound in the feedback path: a best-effort SMS to Russell
 * (TIDYTAILS_OWNER_ALERT_PHONE) when Sam gives the assistant a thumbs-down. It is
 * a "send," so it follows the same default-OFF, exact-"on" contract as every
 * write/send gate above — OFF, the thumbs-down is only logged (today's behavior),
 * never texted. Independent of every other gate.
 */
export function isFeedbackAlertEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_FEEDBACK_ALERT);
}

// Feature-visibility gate (NOT a write surface).
//
// The agentic layer (Phase 1) is a READ-ONLY natural-language assistant. It
// registers no write/send tools, so there is no data to kill-switch — this flag
// only governs whether the assistant surface is reachable at all. It follows
// the exact same `"on"`-means-on, default-OFF, server-only contract as the
// write gates above so a flip stays a Vercel env change, never a code edit, and
// so the whole feature is dark until Russell turns it on for Sam first.

/** Agentic assistant surface (read-only, Phase 1) — `TIDYTAILS_ENABLE_AGENT`. */
export function isAgentEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_AGENT);
}

// Assistant-WRITES master kill-switch — `TIDYTAILS_ENABLE_AGENT_WRITES`.
//
// Decouples DEPLOY from ENABLING writes: the assistant's write code can ship to
// prod while every agent-initiated write stays OFF, so the assistant runs
// read-only (propose/confirm-card may still render in demo/read-only) until this
// flag is explicitly flipped. confirmAgentProposal checks it up front and refuses
// to dispatch to ANY gated action when it's off — so even with every per-action
// write gate on, the assistant cannot write unless this is on too. It is
// INDEPENDENT of both the per-action write gates and the agent feature gate, and
// follows the same `"on"`-means-on, default-OFF, server-only contract.
export function isAgentWritesEnabled(): boolean {
  return isFlagEnabled(process.env.TIDYTAILS_ENABLE_AGENT_WRITES);
}
