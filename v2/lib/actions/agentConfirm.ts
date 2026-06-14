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
  type AddTipProposal,
  type AgentProposal,
  type BookAppointmentProposal,
  type LogGroomProposal,
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
    }
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
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

function firstError(errors: Record<string, string | undefined>): string | undefined {
  return Object.values(errors).find((value) => typeof value === "string");
}
