import { requireOrgId } from "@/lib/data/repo";
import { buildOutboundSmsInsert } from "@/lib/inboundSms";
import { createServerSupabase } from "@/lib/supabase/server";
import { getTwilioConfig, sendTwilioSms, toTwilioPhone } from "@/lib/twilio";
import { isReminderSendEnabled } from "@/lib/writeGate";

export type CustomerSmsSendResult = {
  status: "skipped" | "sent" | "gated" | "failed";
  message: string;
};

/**
 * Send a customer SMS through the gated Twilio path and record it in the
 * `sms_messages` ledger. `label` names the kind of text in every status
 * message — e.g. `label: "Booking update"` yields "Booking update text sent to
 * the customer." This consolidates the previously near-identical
 * `sendAppointmentText` (booking update / cancellation) and `sendBookingText`
 * (booking confirmation) helpers. The caller computes the message `body`; this
 * helper does not build copy.
 */
export async function sendCustomerSms({
  clientId,
  groomerId,
  to,
  body,
  label,
}: {
  clientId: string;
  groomerId: string;
  to: string;
  body: string;
  label: string;
}): Promise<CustomerSmsSendResult> {
  if (!isReminderSendEnabled()) {
    return {
      status: "gated",
      message: `${label} text was not sent because SMS sending is switched off.`,
    };
  }
  const twilioConfig = getTwilioConfig();
  if (!twilioConfig.ok) {
    return {
      status: "failed",
      message: `${label} text was not sent because Twilio is not configured.`,
    };
  }
  const normalizedPhone = toTwilioPhone(to);
  if (!normalizedPhone) {
    return {
      status: "failed",
      message: `${label} text was not sent because the customer phone number is not textable.`,
    };
  }
  const result = await sendTwilioSms(twilioConfig.value, {
    to: normalizedPhone,
    body,
  });
  if (!result.ok) {
    return {
      status: "failed",
      message: `${result.message} ${label} text was not sent.`,
    };
  }
  const orgId = await requireOrgId();
  const supabase = await createServerSupabase();
  await supabase.from("sms_messages").insert({
    ...buildOutboundSmsInsert({
      clientId,
      groomerId,
      from: twilioConfig.value.fromNumber,
      to: normalizedPhone,
      body,
      messageSid: result.sid,
    }),
    org_id: orgId,
  });
  return { status: "sent", message: `${label} text sent to the customer.` };
}
