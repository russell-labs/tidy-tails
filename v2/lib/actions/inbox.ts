"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { buildOutboundSmsInsert, mapSmsMessageRow } from "@/lib/inboundSms";
import { buildSmsHandledUpdate, validateInboxReplyInput } from "@/lib/inboxReply";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getTwilioConfig, sendTwilioSms, toTwilioPhone } from "@/lib/twilio";
import { isReminderSendEnabled } from "@/lib/writeGate";

export type InboxActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent"; message: string }
  | { status: "handled"; message: string };

export async function markSmsHandled(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session ended. Sign in again." };

  const smsId = String(formData.get("sms_id") ?? "").trim();
  if (!smsId) return { status: "error", message: "Choose a customer reply first." };

  const supabase = await createServerSupabase();
  await supabase
    .from("sms_messages")
    .update(buildSmsHandledUpdate(new Date().toISOString()))
    .eq("id", smsId)
    .eq("groomer_id", user.id);

  await recordAuditEvent({
    eventType: "sms.handled",
    summary: "Marked a customer text as handled.",
    metadata: { channel: "sms", smsMessageId: smsId },
  });

  revalidatePath("/inbox");
  return { status: "handled", message: "Marked handled." };
}

export async function sendInboxSmsReply(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session ended. Sign in again." };

  const validation = validateInboxReplyInput({
    smsId: String(formData.get("sms_id") ?? ""),
    message: String(formData.get("message") ?? ""),
  });
  if (!validation.ok) return { status: "error", message: validation.error };

  if (!isReminderSendEnabled()) {
    return { status: "error", message: "SMS sending is switched off. No text was sent." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("sms_messages")
    .select("*")
    .eq("id", validation.value.smsId)
    .eq("groomer_id", user.id)
    .single();

  if (error || !data) {
    return { status: "error", message: "That customer text could not be found." };
  }

  const inbound = mapSmsMessageRow(data);
  if (inbound.direction !== "inbound") {
    return { status: "error", message: "Replies can only be sent to inbound customer texts." };
  }

  const to = toTwilioPhone(inbound.from_phone);
  if (!to) {
    return { status: "error", message: "That phone number is not textable." };
  }

  const twilioConfig = getTwilioConfig();
  if (!twilioConfig.ok) {
    return { status: "error", message: "Twilio is not configured. No text was sent." };
  }

  const sendResult = await sendTwilioSms(twilioConfig.value, {
    to,
    body: validation.value.message,
  });
  if (!sendResult.ok) return { status: "error", message: sendResult.message };

  if (inbound.client_id) {
    await supabase.from("sms_messages").insert(
      buildOutboundSmsInsert({
        clientId: inbound.client_id,
        groomerId: user.id,
        from: twilioConfig.value.fromNumber,
        to,
        body: validation.value.message,
        messageSid: sendResult.sid,
      }),
    );
  } else {
    await supabase.from("sms_messages").insert({
      groomer_id: user.id,
      client_id: null,
      direction: "outbound",
      from_phone: twilioConfig.value.fromNumber,
      to_phone: to,
      body: validation.value.message,
      twilio_message_sid: sendResult.sid,
      status: "sent",
      match_status: inbound.match_status ?? "unmatched",
      sent_at: new Date().toISOString(),
    });
  }

  await supabase
    .from("sms_messages")
    .update(buildSmsHandledUpdate(new Date().toISOString()))
    .eq("id", validation.value.smsId)
    .eq("groomer_id", user.id);

  await recordAuditEvent({
    eventType: "sms.sent",
    clientId: inbound.client_id,
    summary: "Sent an Inbox reply text.",
    metadata: { channel: "sms", smsMessageId: validation.value.smsId },
  });
  await recordAuditEvent({
    eventType: "sms.handled",
    clientId: inbound.client_id,
    summary: "Handled a customer text by replying.",
    metadata: { channel: "sms", smsMessageId: validation.value.smsId },
  });

  revalidatePath("/inbox");
  if (inbound.client_id) revalidatePath(`/clients/${inbound.client_id}`);
  return { status: "sent", message: "Reply sent." };
}
