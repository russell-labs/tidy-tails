"use server";

// Reminder Prep — the "prepare an appointment reminder text" action.
//
// IMPORTANT: this action does NOT send anything in this ship, and it never
// sends automatically in ANY ship. Like the M2 booking, Log Groom, and Add
// Household actions it runs the COMPLETE flow (auth re-check, validation,
// draft construction) and then, instead of dispatching, returns a result:
//   - fixture mode → a "demo" dry-run: no text is sent.
//   - live mode    → the send gate is CLOSED. Reminder sending turns on only
//     after the Ship 2.2b RLS cutover. Until then this action refuses to send.
//
// HARD PRODUCT RULE — true now and after the cutover: the app PREPARES a
// reminder; Sam reviews and explicitly confirms every SMS in-app. No automatic,
// no batch, no background sending — ever. There is deliberately no Twilio call
// and no automations_log write here.

import { dataMode, getClientRecord } from "@/lib/data/repo";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  buildReminderDraft,
  pickReminderAppointment,
  validateReminderInput,
  type ReminderErrors,
} from "@/lib/reminders";
import { fullName } from "@/lib/format";

// A human-readable echo of the prepared reminder — for the review/result screens.
export type ReminderSummary = {
  ownerName: string;
  phone: string;
  petName: string | null;
  appointmentDate: string | null; // ISO; null = no upcoming appointment
  message: string;
};

export type ReminderState =
  | { status: "idle" }
  | { status: "error"; errors: ReminderErrors; formError?: string }
  | { status: "demo"; summary: ReminderSummary }
  | { status: "gated"; summary: ReminderSummary; message: string };

export async function prepareReminder(
  _prev: ReminderState,
  formData: FormData,
): Promise<ReminderState> {
  // Defense-in-depth: the proxy gates every route, but a server action is its
  // own POST endpoint — re-verify the operator before doing anything.
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    };
  }

  const clientId = String(formData.get("client_id") ?? "");
  const rawMessage = String(formData.get("message") ?? "");

  // Re-fetch the household: the recipient phone and the appointment context
  // come from server-trusted data, never from the form. Only the message text
  // is operator-supplied.
  const record = await getClientRecord(clientId);
  if (!record) {
    return {
      status: "error",
      errors: {},
      formError: "That client could not be found. Nothing was prepared.",
    };
  }

  const upcoming = pickReminderAppointment(record.appointments);
  const petName = upcoming
    ? (record.pets.find((p) => p.id === upcoming.pet_id)?.name ?? null)
    : null;

  const validation = validateReminderInput({
    phone: record.client.phone,
    message: rawMessage,
  });
  if (!validation.ok) {
    // A phone error means the client has no usable number on file — not
    // something the operator can fix from the message form, so surface it as a
    // banner rather than a field error.
    const formError = validation.errors.phone
      ? "This client has no valid phone number on file, so a reminder can't be prepared."
      : undefined;
    return { status: "error", errors: validation.errors, formError };
  }

  // The inert, confirmation-required draft — proven shape, never auto-sent.
  const draft = buildReminderDraft(validation.value);

  const summary: ReminderSummary = {
    ownerName: fullName(record.client.first_name, record.client.last_name),
    phone: draft.to,
    petName,
    appointmentDate: upcoming?.date ?? null,
    message: draft.message,
  };

  if (dataMode() === "fixtures") {
    // Dry-run — the flow ran end to end; fixtures are demo data, nothing sent.
    return { status: "demo", summary };
  }

  // Live mode: send gate CLOSED. When it lifts (Ship 2.2b cutover), a confirmed
  // send invokes the `send-sms` edge function and logs an automations_log row —
  // but ONLY in response to this explicit, per-message operator confirmation.
  // The gate authorizes the capability; it never authorizes an automatic send.
  //   const supabase = await createServerSupabase();
  //   await supabase.functions.invoke("send-sms",
  //     { body: { to: draft.to, message: draft.message } });
  //   await supabase.from("automations_log").insert(
  //     { client_id: clientId, type: "reminder", channel: "sms", message: draft.message });
  return {
    status: "gated",
    summary,
    message:
      "Live reminder sending isn't switched on yet — it turns on after the " +
      "Ship 2.2b security cutover. No text was sent.",
  };
}
