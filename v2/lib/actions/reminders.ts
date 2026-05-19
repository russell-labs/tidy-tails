"use server";

// Reminder Prep / Send — the "prepare an appointment reminder text" action.
//
// IMPORTANT: this action never sends automatically. Like the M2 booking, Log
// Groom, and Add Household actions it runs the COMPLETE flow (auth re-check,
// validation, draft construction) and then:
//   - fixture mode → a "demo" dry-run: no text is sent.
//   - live mode    → sends only when TIDYTAILS_ENABLE_REMINDER_SEND is exactly
//     "on" and private Twilio env vars are present. Otherwise it returns gated.
//
// HARD PRODUCT RULE — true now and after the cutover: the app PREPARES a
// reminder; Sam reviews and explicitly confirms every SMS in-app. No automatic,
// no batch, no background sending — ever. This server action is reachable only
// from the explicit "Confirm & send" submit.

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { dataMode, getClientRecord } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isReminderSendEnabled } from "@/lib/writeGate";
import {
  buildReminderDraft,
  pickReminderAppointment,
  validateReminderInput,
  type ReminderErrors,
} from "@/lib/reminders";
import { getTwilioConfig, sendTwilioSms, toTwilioPhone } from "@/lib/twilio";
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
  | { status: "gated"; summary: ReminderSummary; message: string }
  | { status: "sent"; summary: ReminderSummary; logWarning?: string };

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

  // Live mode. The send gate authorizes the capability; it never authorizes an
  // automatic send. This code path only runs after the operator submits the
  // review step's "Confirm & send" button.
  if (!isReminderSendEnabled()) {
    return {
      status: "gated",
      summary,
      message: "Reminder sending isn't switched on yet. No text was sent.",
    };
  }

  const twilioConfig = getTwilioConfig();
  if (!twilioConfig.ok) {
    return {
      status: "error",
      errors: {},
      formError:
        "Reminder sending is enabled, but Twilio is not configured. No text was sent.",
    };
  }

  const to = toTwilioPhone(draft.to);
  if (!to) {
    return {
      status: "error",
      errors: {},
      formError:
        "This client's phone number is not in a format Twilio can text. No text was sent.",
    };
  }

  const sendResult = await sendTwilioSms(twilioConfig.value, {
    to,
    body: draft.message,
  });
  if (!sendResult.ok) {
    return {
      status: "error",
      errors: {},
      formError: `${sendResult.message} No text was sent.`,
    };
  }

  const supabase = await createServerSupabase();
  const { error: logError } = await supabase.from("automations_log").insert({
    client_id: clientId,
    type: "reminder",
    channel: "sms",
    message: draft.message,
    status: "sent",
    sent_at: new Date().toISOString(),
  });

  revalidatePath(`/clients/${clientId}`);
  await recordAuditEvent({
    eventType: "sms.sent",
    clientId,
    summary: `Sent reminder text to ${summary.ownerName}.`,
    metadata: { channel: "sms", date: summary.appointmentDate },
  });
  return {
    status: "sent",
    summary,
    logWarning: logError
      ? "The text was sent, but the send log could not be recorded."
      : undefined,
  };
}
