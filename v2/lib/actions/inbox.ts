"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit.server";
import { buildOutboundSmsInsert, mapSmsMessageRow } from "@/lib/inboundSms";
import {
  buildSmsHandledUpdate,
  validateClientSmsInput,
  validateInboxReplyInput,
} from "@/lib/inboxReply";
import { isExistingHouseholdForPlatformIntro } from "@/lib/messageCenterTemplates";
import { getClientRecord, requireOrgId } from "@/lib/data/repo";
import { resolveHouseholdSendNumber } from "@/lib/householdNumbers";
import type { ClientRecord } from "@/lib/data/types";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { getTwilioConfig, sendTwilioSms, toTwilioPhone } from "@/lib/twilio";
import { isReminderSendEnabled } from "@/lib/writeGate";

export type InboxActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent"; message: string }
  | { status: "handled"; message: string }
  | { status: "hidden"; message: string };

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

export async function hideSmsMessage(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session ended. Sign in again." };

  const smsId = String(formData.get("sms_id") ?? "").trim();
  if (!smsId) return { status: "error", message: "Choose a customer text first." };

  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("sms_messages")
    .select("client_id")
    .eq("id", smsId)
    .eq("groomer_id", user.id)
    .single();

  await supabase
    .from("sms_messages")
    .update({
      status: "hidden",
      handled_at: new Date().toISOString(),
    })
    .eq("id", smsId)
    .eq("groomer_id", user.id);

  await recordAuditEvent({
    eventType: "sms.hidden",
    clientId: typeof data?.client_id === "string" ? data.client_id : null,
    summary: "Hid a customer text from the normal conversation view.",
    metadata: { channel: "sms", smsMessageId: smsId },
  });

  revalidatePath("/inbox");
  if (typeof data?.client_id === "string") revalidatePath(`/clients/${data.client_id}`);
  return { status: "hidden", message: "Text hidden." };
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

  const orgId = await requireOrgId();
  if (inbound.client_id) {
    await supabase.from("sms_messages").insert({
      ...buildOutboundSmsInsert({
        clientId: inbound.client_id,
        groomerId: user.id,
        from: twilioConfig.value.fromNumber,
        to,
        body: validation.value.message,
        messageSid: sendResult.sid,
      }),
      org_id: orgId,
    });
  } else {
    await supabase.from("sms_messages").insert({
      groomer_id: user.id,
      org_id: orgId,
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

export async function sendClientSmsMessage(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session ended. Sign in again." };

  const validation = validateClientSmsInput({
    clientId: String(formData.get("client_id") ?? ""),
    message: String(formData.get("message") ?? ""),
  });
  if (!validation.ok) return { status: "error", message: validation.error };

  if (!isReminderSendEnabled()) {
    return { status: "error", message: "SMS sending is switched off. No text was sent." };
  }

  const record = await getClientRecord(validation.value.clientId);
  if (!record) return { status: "error", message: "That household could not be found." };

  // TT-007: the operator may pick which household number to text. The server is
  // authoritative — the chosen number must be on this household and textable.
  const chosenNumber = resolveHouseholdSendNumber(
    record.client,
    formData.get("to_number")?.toString(),
  );
  if (!chosenNumber.ok) {
    return {
      status: "error",
      message:
        chosenNumber.reason === "not_textable"
          ? "That number can't receive texts. Pick a mobile number."
          : "That number isn't on this household. No text was sent.",
    };
  }

  const to = toTwilioPhone(chosenNumber.value);
  if (!to) {
    return { status: "error", message: "That household phone number is not textable." };
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

  const orgId = await requireOrgId();
  const supabase = await createServerSupabase();
  const { error: insertError } = await supabase.from("sms_messages").insert({
    ...buildOutboundSmsInsert({
      clientId: record.client.id,
      groomerId: user.id,
      from: twilioConfig.value.fromNumber,
      to,
      body: validation.value.message,
      messageSid: sendResult.sid,
    }),
    org_id: orgId,
  });

  await recordAuditEvent({
    eventType: "sms.sent",
    clientId: record.client.id,
    summary: "Sent a customer text from the household conversation.",
    metadata: { channel: "sms", source: "client_conversation" },
  });

  revalidatePath("/inbox");
  revalidatePath(`/clients/${record.client.id}`);
  if (insertError) {
    return {
      status: "sent",
      message: "Text sent, but the conversation history could not be updated.",
    };
  }
  return { status: "sent", message: "Text sent." };
}

export async function sendMessageCenterSmsMessage(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your session ended. Sign in again." };

  const clientId = String(formData.get("client_id") ?? "").trim();
  const replySmsId = String(formData.get("reply_sms_id") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const templateKey = String(formData.get("template_key") ?? "").trim();

  if (!message) return { status: "error", message: "Write a text before sending." };
  if (message.length > 480) {
    return { status: "error", message: "Keep customer texts under 480 characters." };
  }
  if (!clientId && !replySmsId) {
    return { status: "error", message: "Choose a message thread first." };
  }
  if (!isReminderSendEnabled()) {
    return { status: "error", message: "SMS sending is switched off. No text was sent." };
  }

  const supabase = await createServerSupabase();
  const twilioConfig = getTwilioConfig();
  if (!twilioConfig.ok) {
    return { status: "error", message: "Twilio is not configured. No text was sent." };
  }

  let to: string | null = null;
  let outboundClientId: string | null = null;
  let replyMessageClientId: string | null = null;
  let outboundRecord: ClientRecord | null = null;

  if (replySmsId) {
    const { data } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("id", replySmsId)
      .eq("groomer_id", user.id)
      .single();

    if (!data) return { status: "error", message: "That customer text could not be found." };
    const replyMessage = mapSmsMessageRow(data);
    if (replyMessage.direction !== "inbound") {
      return { status: "error", message: "Choose an inbound customer reply first." };
    }
    replyMessageClientId = replyMessage.client_id;
    to = toTwilioPhone(replyMessage.from_phone);
  }

  if (clientId) {
    const record = await getClientRecord(clientId);
    if (!record) return { status: "error", message: "That household could not be found." };
    outboundRecord = record;
    outboundClientId = record.client.id;
    to = toTwilioPhone(record.client.phone);
  }

  if (templateKey === "first_platform") {
    if (!outboundClientId) {
      return { status: "error", message: "Choose a household before sending the first-platform text." };
    }
    if (outboundRecord && !isExistingHouseholdForPlatformIntro(outboundRecord.client, outboundRecord.appointments)) {
      return {
        status: "error",
        message: "The first-platform text is only for existing households.",
      };
    }
    const { data: existingFirstPlatformEvents, error: firstPlatformCheckError } = await supabase
      .from("audit_events")
      .select("id")
      .eq("client_id", outboundClientId)
      .eq("event_type", "sms.sent")
      .contains("metadata", { templateKey: "first_platform" })
      .limit(1);
    if (firstPlatformCheckError) {
      return {
        status: "error",
        message: "Could not verify first-platform text history. No text was sent.",
      };
    }
    if (existingFirstPlatformEvents?.length) {
      return {
        status: "error",
        message: "The first-platform text has already been sent to this household.",
      };
    }
  }

  if (!to) return { status: "error", message: "That phone number is not textable." };

  const sendResult = await sendTwilioSms(twilioConfig.value, { to, body: message });
  if (!sendResult.ok) return { status: "error", message: sendResult.message };

  const orgId = await requireOrgId();
  if (outboundClientId) {
    await supabase.from("sms_messages").insert({
      ...buildOutboundSmsInsert({
        clientId: outboundClientId,
        groomerId: user.id,
        from: twilioConfig.value.fromNumber,
        to,
        body: message,
        messageSid: sendResult.sid,
      }),
      org_id: orgId,
    });
  } else {
    await supabase.from("sms_messages").insert({
      groomer_id: user.id,
      org_id: orgId,
      client_id: null,
      direction: "outbound",
      from_phone: twilioConfig.value.fromNumber,
      to_phone: to,
      body: message,
      twilio_message_sid: sendResult.sid,
      status: "sent",
      match_status: "unmatched",
      sent_at: new Date().toISOString(),
    });
  }

  if (replySmsId) {
    await supabase
      .from("sms_messages")
      .update(buildSmsHandledUpdate(new Date().toISOString()))
      .eq("id", replySmsId)
      .eq("groomer_id", user.id);
  }

  const auditClientId = outboundClientId ?? replyMessageClientId;
  await recordAuditEvent({
    eventType: "sms.sent",
    clientId: auditClientId,
    summary: "Sent a customer text from the message center.",
    metadata: {
      channel: "sms",
      source: "message_center",
      smsMessageId: replySmsId || undefined,
      templateKey: templateKey || undefined,
    },
  });
  if (replySmsId) {
    await recordAuditEvent({
      eventType: "sms.handled",
      clientId: auditClientId,
      summary: "Handled a customer text by replying from the message center.",
      metadata: { channel: "sms", smsMessageId: replySmsId },
    });
  }

  revalidatePath("/inbox");
  if (outboundClientId) revalidatePath(`/clients/${outboundClientId}`);
  return { status: "sent", message: "Text sent." };
}
