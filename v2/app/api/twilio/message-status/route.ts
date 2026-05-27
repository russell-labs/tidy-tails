import { NextResponse } from "next/server";
import {
  buildTwilioStatusUpdate,
  parseTwilioStatusCallbackForm,
} from "@/lib/inboundSms";
import { createServiceSupabase } from "@/lib/supabase/service";
import {
  getTwilioWebhookAuthToken,
  validateTwilioRequestSignature,
} from "@/lib/twilio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function empty(status = 204) {
  return new NextResponse(null, { status });
}

export async function POST(request: Request) {
  const body = await request.text();
  const form = new URLSearchParams(body);
  const authToken = getTwilioWebhookAuthToken();
  const signature = request.headers.get("x-twilio-signature");

  if (
    !authToken ||
    !validateTwilioRequestSignature({
      url: request.url,
      params: form,
      signature,
      authToken,
    })
  ) {
    return empty(403);
  }

  const parsed = parseTwilioStatusCallbackForm(form);
  if (!parsed.ok) return empty(400);

  let supabase: ReturnType<typeof createServiceSupabase>;
  try {
    supabase = createServiceSupabase();
  } catch {
    return empty(500);
  }

  const { error } = await supabase
    .from("sms_messages")
    .update(buildTwilioStatusUpdate(parsed.value))
    .eq("twilio_message_sid", parsed.value.messageSid)
    .eq("direction", "outbound");

  if (error) return empty(500);
  return empty();
}
