"use server";

// Agentic layer — the confirm-and-execute action (Phase 3).
//
// This is the ONLY place an agent-initiated write happens, and it runs only on
// Sam's explicit confirm tap. The model never reaches here: it produces an
// AgentProposal (resolved + validated, but unsaved), the UI renders it as a
// confirm card, and a Confirm tap calls this action with that proposal. Cancel
// calls nothing, so nothing is written.
//
// Defense in depth:
//   - Re-checks the master agent gate (TIDYTAILS_ENABLE_AGENT) and a signed-in
//     operator, so this endpoint can't be POSTed when the feature is dark.
//   - Validates the proposal kind at the trust boundary (the proposal round-trips
//     through the client; an unknown shape is rejected, not coerced).
//   - Dispatches to the EXISTING gated server action for the kind, which is the
//     real authority: it re-validates ownership, enforces its own
//     TIDYTAILS_ENABLE_*_WRITE kill-switch (gate off → "gated", nothing saved),
//     runs the same math Sam's screens run, and audits the write. We add an
//     `audit_source=agent` field so the audit row is marked agent-originated.
//   - For a tip we RE-RESOLVE the target appointment id server-side from the
//     proposal's pet + date, so a client-tampered id can't redirect the write.
//
// No service-role client is imported; every gated action runs in the operator's
// session, so RLS + the org_id guard still bound the write to this org.

import { isAgentEnabled } from "@/lib/writeGate";
import { getCurrentUser } from "@/lib/supabase/server";
import { getClientRecord } from "@/lib/data/repo";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import {
  PROPOSAL_KINDS,
  type AddHouseholdProposal,
  type AddPetProposal,
  type AddTipProposal,
  type AgentProposal,
  type BookAppointmentProposal,
  type DeleteHouseholdProposal,
  type EditAppointmentProposal,
  type EditHouseholdProposal,
  type EditPetProposal,
  type LogDailyIncomeProposal,
  type LogGroomProposal,
  type SendTextProposal,
} from "@/lib/agent/proposals";
import { createBooking, type BookingState } from "./appointments";
import {
  createOneToOneBooking,
  type OneToOneBookingState,
} from "./oneToOneBooking";
import {
  markAppointmentPaid,
  type AppointmentPaymentState,
} from "./appointmentPayment";
import { logGroom, type GroomState } from "./grooms";
import { saveIntake, type IntakeState } from "./intake";
import { addPet, type AddPetState } from "./pets";
import { editClient, type EditClientState } from "./editClient";
import { editPet, type EditPetState } from "./editPet";
import {
  deleteAppointment,
  editAppointment,
  markAppointmentNoShow,
  type DeleteAppointmentState,
  type EditAppointmentState,
  type NoShowAppointmentState,
} from "./editAppointment";
import { deleteClient, type DeleteClientState } from "./deleteClient";
import { saveDayCloseoutOverride, type DayCloseoutState } from "./dayCloseout";
import { prepareReminder, type ReminderState } from "./reminders";
import { sendInboxSmsReply, type InboxActionState } from "./inbox";

export type AgentConfirmResult = {
  status: "saved" | "gated" | "error";
  message: string;
};

const GENERIC_ERROR = "That action couldn't be completed. Nothing was saved.";

/** The form field that marks a gated write as agent-originated for the audit row. */
const AGENT_SOURCE_FIELD = "audit_source";
const AGENT_SOURCE_VALUE = "agent";

function setMoney(form: FormData, field: string, value: number | null): void {
  form.set(field, value == null ? "" : String(value));
}

/** Perform the write Sam just confirmed. The model never calls this — only her tap does. */
export async function confirmAgentProposal(
  proposal: AgentProposal,
): Promise<AgentConfirmResult> {
  // Master gate + request scope — same guard as every other agent entry point.
  if (!isAgentEnabled()) {
    return { status: "error", message: "The assistant isn't available." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      message: "Your session ended. Sign in again to confirm.",
    };
  }

  // Trust boundary: the proposal came back through the client. Only act on a
  // known kind; the gated action re-validates everything else.
  if (!proposal || !(PROPOSAL_KINDS as readonly string[]).includes(proposal.kind)) {
    return { status: "error", message: GENERIC_ERROR };
  }

  try {
    switch (proposal.kind) {
      case "book_appointment":
        return await confirmBooking(proposal);
      case "add_tip":
        return await confirmAddTip(proposal);
      case "log_groom":
        return await confirmLogGroom(proposal);
      case "add_household":
        return await confirmAddHousehold(proposal);
      case "add_pet":
        return await confirmAddPet(proposal);
      case "edit_household":
        return await confirmEditHousehold(proposal);
      case "edit_pet":
        return await confirmEditPet(proposal);
      case "edit_appointment":
        return await confirmEditAppointment(proposal);
      case "delete_household":
        return await confirmDeleteHousehold(proposal);
      case "log_daily_income":
        return await confirmLogDailyIncome(proposal);
      case "send_text":
        return await confirmSendText(proposal);
    }
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}

/** boolean|null allergy flag → the form's yes/no/unknown choice. */
function allergyChoice(allergies: boolean | null): string {
  return allergies === true ? "yes" : allergies === false ? "no" : "unknown";
}

function setOptional(form: FormData, field: string, value: string | null): void {
  form.set(field, value ?? "");
}

async function confirmBooking(
  proposal: BookAppointmentProposal,
): Promise<AgentConfirmResult> {
  const org = await loadOrgSettings();
  const form = new FormData();
  form.set("client_id", proposal.clientId);
  form.set("date", proposal.date);
  form.set("time_slot", proposal.timeSlot);
  form.set("service_type", proposal.serviceType);
  setMoney(form, "fee", proposal.fee);
  if (proposal.location) form.set("location", proposal.location);
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  if (org.schedulingStyle === "one_to_one") {
    form.set("pet_id", proposal.petIds[0] ?? "");
    form.set("duration_minutes", String(proposal.durationMinutes ?? ""));
    const state = await createOneToOneBooking({ status: "idle" }, form);
    return mapOneToOneState(state);
  }

  // Batched surface: one row per pet (comma-separated ids), no customer text.
  form.set("pet_ids", proposal.petIds.join(","));
  const state = await createBooking({ status: "idle" }, form);
  return mapBookingState(state);
}

async function confirmAddTip(
  proposal: AddTipProposal,
): Promise<AgentConfirmResult> {
  // Re-resolve the appointment id server-side from the proposal's pet + date so
  // we never trust a client-supplied id. Must still be a completed groom.
  const record = await getClientRecord(proposal.clientId);
  const target = record?.appointments.find(
    (appointment) =>
      appointment.pet_id === proposal.petId &&
      appointment.date === proposal.appointmentDate &&
      appointment.status === "completed",
  );
  if (!record || !target) {
    return {
      status: "error",
      message: "That groom couldn't be found anymore. Nothing was saved.",
    };
  }

  const form = new FormData();
  form.set("client_id", proposal.clientId);
  form.set("appointment_id", target.id);
  form.set("payment_method", proposal.paymentMethod);
  form.set("paid_amount", String(proposal.paidAmount));
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  const state = await markAppointmentPaid({ status: "idle" }, form);
  return mapPaymentState(state);
}

async function confirmLogGroom(
  proposal: LogGroomProposal,
): Promise<AgentConfirmResult> {
  const form = new FormData();
  form.set("client_id", proposal.clientId);
  form.set("pet_id", proposal.petId);
  form.set("date", proposal.date);
  form.set("service_type", proposal.serviceType);
  setMoney(form, "fee", proposal.fee);
  setMoney(form, "tip", proposal.tip);
  form.set("payment_method", proposal.paymentMethod);
  form.set("payment_status", proposal.paymentStatus);
  if (proposal.notes) form.set("notes", proposal.notes);
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  const state = await logGroom({ status: "idle" }, form);
  return mapGroomState(state);
}

// --- state → confirm-result mappers ----------------------------------------
// Each gated action returns its own State union; collapse to the small result
// the confirm card understands, preserving the action's own gated/error copy.

function mapBookingState(state: BookingState): AgentConfirmResult {
  switch (state.status) {
    case "saved":
      return { status: "saved", message: `Booked ${state.summary.petName}.` };
    case "gated":
      return { status: "gated", message: state.message };
    case "demo":
      return { status: "gated", message: "Demo mode — nothing was saved." };
    case "error":
      return {
        status: "error",
        message: state.formError ?? firstError(state.errors) ?? GENERIC_ERROR,
      };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function mapOneToOneState(state: OneToOneBookingState): AgentConfirmResult {
  switch (state.status) {
    case "saved":
      return { status: "saved", message: `Booked ${state.summary.petName}.` };
    case "gated":
      return { status: "gated", message: state.message };
    case "demo":
      return { status: "gated", message: "Demo mode — nothing was saved." };
    case "error":
      return {
        status: "error",
        message: state.formError ?? firstError(state.errors) ?? GENERIC_ERROR,
      };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function mapPaymentState(state: AppointmentPaymentState): AgentConfirmResult {
  switch (state.status) {
    case "saved":
      return { status: "saved", message: state.message };
    case "gated":
      return { status: "gated", message: state.message };
    case "demo":
      return { status: "gated", message: "Demo mode — nothing was saved." };
    case "error":
      return { status: "error", message: state.message };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function mapGroomState(state: GroomState): AgentConfirmResult {
  switch (state.status) {
    case "saved":
      return { status: "saved", message: `Logged groom for ${state.summary.petName}.` };
    case "gated":
      return { status: "gated", message: state.message };
    case "demo":
      return { status: "gated", message: "Demo mode — nothing was saved." };
    case "error":
      return {
        status: "error",
        message: state.formError ?? firstError(state.errors) ?? GENERIC_ERROR,
      };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

// --- Phase 4 dispatchers ----------------------------------------------------

async function confirmAddHousehold(
  proposal: AddHouseholdProposal,
): Promise<AgentConfirmResult> {
  const form = new FormData();
  form.set("first_name", proposal.firstName);
  form.set("last_name", proposal.lastName);
  form.set("phone", proposal.phone);
  setOptional(form, "secondary_contact_name", proposal.secondaryContactName);
  setOptional(form, "secondary_cell", proposal.secondaryCell);
  setOptional(form, "landline", proposal.landline);
  setOptional(form, "email", proposal.email);
  setOptional(form, "address", proposal.address);
  setOptional(form, "notes", proposal.notes);
  if (proposal.smsConsent) form.set("sms_consent", "on");
  form.set("pet_name", proposal.pet.name);
  setOptional(form, "breed", proposal.pet.breed);
  setOptional(form, "size", proposal.pet.size);
  form.set("allergy_state", allergyChoice(proposal.pet.allergies));
  setOptional(form, "allergies_detail", proposal.pet.allergiesDetail);
  form.set("vaccination_state", proposal.pet.vaccinationState);
  setOptional(form, "vaccination_detail", proposal.pet.vaccinationDetail);
  setOptional(form, "date_of_birth", proposal.pet.dateOfBirth);
  setOptional(form, "grooming_notes", proposal.pet.groomingNotes);
  setMoney(form, "typical_fee", proposal.pet.typicalFee);
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  const state = await saveIntake({ status: "idle" }, form);
  return mapSummaryState(state, `Added ${proposal.ownerName}.`);
}

async function confirmAddPet(proposal: AddPetProposal): Promise<AgentConfirmResult> {
  const form = new FormData();
  form.set("client_id", proposal.clientId);
  form.set("name", proposal.name);
  setOptional(form, "breed", proposal.breed);
  setOptional(form, "size", proposal.size);
  form.set("allergy_state", allergyChoice(proposal.allergies));
  setOptional(form, "allergies_detail", proposal.allergiesDetail);
  setOptional(form, "grooming_notes", proposal.groomingNotes);
  setMoney(form, "typical_fee", proposal.typicalFee);
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  const state = await addPet({ status: "idle" }, form);
  return mapSummaryState(state, `Added ${proposal.name} to ${proposal.ownerName}.`);
}

async function confirmEditHousehold(
  proposal: EditHouseholdProposal,
): Promise<AgentConfirmResult> {
  const form = new FormData();
  form.set("client_id", proposal.clientId);
  form.set("first_name", proposal.firstName);
  form.set("last_name", proposal.lastName);
  form.set("phone", proposal.phone);
  setOptional(form, "secondary_contact_name", proposal.secondaryContactName);
  setOptional(form, "secondary_cell", proposal.secondaryCell);
  setOptional(form, "landline", proposal.landline);
  setOptional(form, "email", proposal.email);
  setOptional(form, "address", proposal.address);
  setOptional(form, "notes", proposal.notes);
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  const state = await editClient({ status: "idle" }, form);
  return mapSummaryState(state, `Updated ${proposal.ownerName}.`);
}

async function confirmEditPet(proposal: EditPetProposal): Promise<AgentConfirmResult> {
  const form = new FormData();
  form.set("client_id", proposal.clientId);
  form.set("pet_id", proposal.petId);
  form.set("name", proposal.name);
  setOptional(form, "breed", proposal.breed);
  setOptional(form, "size", proposal.size);
  setOptional(form, "color", proposal.color);
  setOptional(form, "date_of_birth", proposal.dateOfBirth);
  form.set("allergy_state", allergyChoice(proposal.allergies));
  setOptional(form, "allergies_detail", proposal.allergiesDetail);
  setOptional(form, "grooming_notes", proposal.groomingNotes);
  setMoney(form, "typical_fee", proposal.typicalFee);
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  const state = await editPet({ status: "idle" }, form);
  return mapSummaryState(state, `Updated ${proposal.petName}.`);
}

async function confirmEditAppointment(
  proposal: EditAppointmentProposal,
): Promise<AgentConfirmResult> {
  if (proposal.mode === "cancel") {
    const form = new FormData();
    form.set("client_id", proposal.clientId);
    form.set("appointment_id", proposal.appointmentId);
    // No send_cancellation_text and no group scope: an agent cancel never
    // auto-texts the customer and only ever touches the one resolved visit.
    form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);
    return await runCancelAppointment(form, `Cancelled ${proposal.petName}'s visit.`);
  }

  if (proposal.mode === "no_show") {
    const form = new FormData();
    form.set("client_id", proposal.clientId);
    form.set("appointment_id", proposal.appointmentId);
    form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);
    const state = await markAppointmentNoShow({ status: "idle" }, form);
    return mapNoShowAppointmentState(state, `Marked ${proposal.petName} as a no-show.`);
  }

  const form = new FormData();
  form.set("client_id", proposal.clientId);
  form.set("appointment_id", proposal.appointmentId);
  form.set("date", proposal.date);
  form.set("time_slot", proposal.timeSlot);
  form.set("service_type", proposal.serviceType);
  form.set("location", proposal.location);
  setMoney(form, "fee", proposal.fee);
  setMoney(form, "tip", proposal.tip);
  form.set("payment_method", proposal.paymentMethod);
  form.set("payment_status", proposal.paymentStatus);
  setOptional(form, "notes", proposal.notes);
  setMoney(form, "salon_payout_override", proposal.salonPayoutOverride);
  // No send_booking_update_text: an agent edit never auto-texts the customer.
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  const state = await editAppointment({ status: "idle" }, form);
  return mapSummaryState(state, `Updated ${proposal.petName}'s visit.`);
}

/**
 * deleteAppointment redirect()s on success (which throws a Next redirect signal
 * in the server-action runtime). The chat surface stays put — it does not want
 * to navigate — so we swallow that specific signal and report success; any other
 * throw is a real failure.
 */
async function runCancelAppointment(
  form: FormData,
  savedMessage: string,
): Promise<AgentConfirmResult> {
  try {
    const state = await deleteAppointment({ status: "idle" }, form);
    return mapDeleteAppointmentState(state, savedMessage);
  } catch (error) {
    if (isNextRedirect(error)) {
      return { status: "saved", message: savedMessage };
    }
    throw error;
  }
}

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

async function confirmDeleteHousehold(
  proposal: DeleteHouseholdProposal,
): Promise<AgentConfirmResult> {
  const form = new FormData();
  form.set("client_id", proposal.clientId);
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  const state = await deleteClient({ status: "idle" }, form);
  return mapDeleteClientState(state, `Deleted ${proposal.ownerName}.`);
}

async function confirmLogDailyIncome(
  proposal: LogDailyIncomeProposal,
): Promise<AgentConfirmResult> {
  const form = new FormData();
  form.set("date", proposal.date);
  form.set("location", proposal.location);
  form.set("final_payout", String(proposal.finalPayout));
  form.set("calculated_payout", String(proposal.calculatedPayout));
  setOptional(form, "note", proposal.note);
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);

  const state = await saveDayCloseoutOverride({ status: "idle" }, form);
  return mapDayCloseoutState(state);
}

async function confirmSendText(
  proposal: SendTextProposal,
): Promise<AgentConfirmResult> {
  // Nothing is sent until here — Sam's confirm tap is what calls the gated send
  // action. The card already showed her the exact wording.
  if (proposal.mode === "reply") {
    const form = new FormData();
    form.set("sms_id", proposal.smsId);
    form.set("message", proposal.message);
    form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);
    const state = await sendInboxSmsReply({ status: "idle" }, form);
    return mapInboxState(state, `Replied to ${proposal.recipientLabel}.`);
  }

  const form = new FormData();
  form.set("client_id", proposal.clientId);
  form.set("appointment_id", proposal.appointmentId);
  form.set("to_number", proposal.toNumber);
  form.set("message", proposal.message);
  form.set(AGENT_SOURCE_FIELD, AGENT_SOURCE_VALUE);
  const state = await prepareReminder({ status: "idle" }, form);
  return mapReminderState(state, `Texted ${proposal.recipientLabel}.`);
}

// --- state → confirm-result mappers (Phase 4) -------------------------------

/** For the saved/gated/demo/error summary states (intake, pets, edits). */
function mapSummaryState(
  state:
    | IntakeState
    | AddPetState
    | EditClientState
    | EditPetState
    | EditAppointmentState,
  savedMessage: string,
): AgentConfirmResult {
  switch (state.status) {
    case "saved":
      return { status: "saved", message: savedMessage };
    case "gated":
      return { status: "gated", message: state.message };
    case "demo":
      return { status: "gated", message: "Demo mode — nothing was saved." };
    case "error":
      return {
        status: "error",
        message: state.formError ?? firstError(state.errors) ?? GENERIC_ERROR,
      };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function mapDeleteClientState(
  state: DeleteClientState,
  savedMessage: string,
): AgentConfirmResult {
  switch (state.status) {
    case "deleted":
      return { status: "saved", message: savedMessage };
    case "gated":
      return { status: "gated", message: state.message };
    case "demo":
      return { status: "gated", message: "Demo mode — nothing was deleted." };
    case "error":
      return { status: "error", message: state.message };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function mapDeleteAppointmentState(
  state: DeleteAppointmentState,
  savedMessage: string,
): AgentConfirmResult {
  switch (state.status) {
    case "deleted":
      return { status: "saved", message: savedMessage };
    case "gated":
      return { status: "gated", message: state.message ?? "Nothing was changed." };
    case "demo":
      return { status: "gated", message: "Demo mode — nothing was changed." };
    case "error":
      return { status: "error", message: state.message };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function mapNoShowAppointmentState(
  state: NoShowAppointmentState,
  savedMessage: string,
): AgentConfirmResult {
  switch (state.status) {
    case "saved":
      return { status: "saved", message: savedMessage };
    case "gated":
      return { status: "gated", message: state.message };
    case "demo":
      return { status: "gated", message: "Demo mode — nothing was changed." };
    case "error":
      return { status: "error", message: state.message };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function mapDayCloseoutState(state: DayCloseoutState): AgentConfirmResult {
  switch (state.status) {
    case "saved":
      return { status: "saved", message: state.message };
    case "gated":
      return { status: "gated", message: state.message };
    case "demo":
      return { status: "gated", message: "Demo mode — nothing was saved." };
    case "error":
      return {
        status: "error",
        message: state.formError ?? firstError(state.errors) ?? GENERIC_ERROR,
      };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function mapReminderState(
  state: ReminderState,
  savedMessage: string,
): AgentConfirmResult {
  switch (state.status) {
    case "sent":
      return { status: "saved", message: savedMessage };
    case "gated":
      return { status: "gated", message: state.message };
    case "demo":
      return { status: "gated", message: "Demo mode — no text was sent." };
    case "error":
      return {
        status: "error",
        message: state.formError ?? firstError(state.errors) ?? GENERIC_ERROR,
      };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function mapInboxState(
  state: InboxActionState,
  savedMessage: string,
): AgentConfirmResult {
  switch (state.status) {
    case "sent":
      return { status: "saved", message: savedMessage };
    case "error":
      return { status: "error", message: state.message };
    default:
      return { status: "error", message: GENERIC_ERROR };
  }
}

function firstError(errors: Record<string, string | undefined>): string | undefined {
  return Object.values(errors).find((value) => typeof value === "string");
}
