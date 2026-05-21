import { NextResponse } from "next/server";
import {
  buildInboundSmsInsert,
  buildTwilioWebhookResponse,
  matchClientByPhone,
  parseTwilioInboundForm,
} from "@/lib/inboundSms";
import { mapClientRow, type Row } from "@/lib/data/live";
import { createServiceSupabase } from "@/lib/supabase/service";
import {
  getTwilioWebhookAuthToken,
  validateTwilioRequestSignature,
} from "@/lib/twilio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function twiml(status = 200) {
  return new NextResponse(buildTwilioWebhookResponse(), {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function configuredGroomerId(): string | null {
  const value = process.env.TIDYTAILS_OPERATOR_USER_ID?.trim();
  return value || null;
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
    return twiml(403);
  }

  const groomerId = configuredGroomerId();
  if (!groomerId) return twiml(500);

  const parsed = parseTwilioInboundForm(form);
  if (!parsed.ok) return twiml(400);

  let supabase: ReturnType<typeof createServiceSupabase>;
  try {
    supabase = createServiceSupabase();
  } catch {
    return twiml(500);
  }
  const { data: clientRows, error: clientError } = await supabase
    .from("clients")
    .select("*");
  if (clientError) return twiml(500);

  const clients = ((clientRows ?? []) as Row[]).map(mapClientRow);
  const match = matchClientByPhone(clients, parsed.value.from);
  const insert = buildInboundSmsInsert({
    message: parsed.value,
    groomerId,
    match,
  });

  const { error: insertError } = await supabase.from("sms_messages").upsert(insert, {
    onConflict: "twilio_message_sid",
    ignoreDuplicates: true,
  });
  if (insertError) return twiml(500);

  // Future reply-agent seam: pass a generated response into
  // buildTwilioWebhookResponse(reply) when Tidy Tails is ready to auto-reply.
  return twiml();
}
