"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { dataMode, getClientRecord } from "@/lib/data/repo";
import { buildOutboundSmsInsert } from "@/lib/inboundSms";
import {
  validateReadyPickupInput,
  type ReadyPickupErrors,
} from "@/lib/readyPickup";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getTwilioConfig, sendTwilioSms, toTwilioPhone } from "@/lib/twilio";
import { isReminderSendEnabled } from "@/lib/writeGate";
import { fullName } from "@/lib/format";

export type ReadyPickupSummary = {
  ownerName: string;
  petName: string;
  phone: string;
  message: string;
};

export type ReadyPickupState =
  | { status: "idle" }
  | { status: "error"; errors: ReadyPickupErrors; formError?: string }
  | { status: "demo"; summary: ReadyPickupSummary }
  | { status: "gated"; summary: ReadyPickupSummary; message: string }
  | { status: "sent"; summary: ReadyPickupSummary; logWarning?: string };

export async function sendReadyPickupText(
  _prev: ReadyPickupState,
  formData: FormData,
): Promise<ReadyPickupState> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      errors: {},
      formError: "Your session ended. Sign in again.",
    };
  }

  const clientId = String(formData.get("client_id") ?? "");
  const petId = String(formData.get("pet_id") ?? "");
  const rawMessage = String(formData.get("message") ?? "");

  const record = await getClientRecord(clientId);
  if (!record) {
    return {
      status: "error",
      errors: {},
      formError: "That client could not be found. No text was sent.",
    };
  }

  const pet = record.pets.find((candidate) => candidate.id === petId);
  if (!pet) {
    return {
      status: "error",
      errors: {},
      formError: "That pet is not on this household. No text was sent.",
    };
  }

  const validation = validateReadyPickupInput({
    phone: record.client.phone,
    message: rawMessage,
  });
  if (!validation.ok) {
    const formError = validation.errors.phone
      ? "This client has no valid phone number on file, so a pickup text can't be sent."
      : undefined;
    return { status: "error", errors: validation.errors, formError };
  }

  const summary: ReadyPickupSummary = {
    ownerName: fullName(record.client.first_name, record.client.last_name),
    petName: pet.name,
    phone: validation.value.phone,
    message: validation.value.message,
  };

  if (dataMode() === "fixtures") return { status: "demo", summary };

  if (!isReminderSendEnabled()) {
    return {
      status: "gated",
      summary,
      message: "SMS sending is switched off. No pickup text was sent.",
    };
  }

  const twilioConfig = getTwilioConfig();
  if (!twilioConfig.ok) {
    return {
      status: "error",
      errors: {},
      formError: "Twilio is not configured. No pickup text was sent.",
    };
  }

  const to = toTwilioPhone(validation.value.phone);
  if (!to) {
    return {
      status: "error",
      errors: {},
      formError: "This client's phone number is not textable. No pickup text was sent.",
    };
  }

  const sendResult = await sendTwilioSms(twilioConfig.value, {
    to,
    body: validation.value.message,
  });
  if (!sendResult.ok) {
    return {
      status: "error",
      errors: {},
      formError: `${sendResult.message} No pickup text was sent.`,
    };
  }

  const supabase = await createServerSupabase();
  const { error: smsLogError } = await supabase.from("sms_messages").insert(
    buildOutboundSmsInsert({
      clientId,
      groomerId: user.id,
      from: twilioConfig.value.fromNumber,
      to,
      body: validation.value.message,
      messageSid: sendResult.sid,
    }),
  );

  await recordAuditEvent({
    eventType: "sms.sent",
    clientId,
    petId,
    summary: `Sent ready-for-pickup text for ${pet.name} to ${summary.ownerName}.`,
    metadata: { channel: "sms", kind: "ready_for_pickup" },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/pets/${petId}`);
  return {
    status: "sent",
    summary,
    logWarning: smsLogError
      ? "The text was sent, but the SMS log could not be recorded."
      : undefined,
  };
}
