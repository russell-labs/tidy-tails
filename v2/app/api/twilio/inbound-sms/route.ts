import { NextResponse } from "next/server";
import {
  buildInboundSmsInsert,
  buildTwilioWebhookResponse,
  matchClientByPhone,
  parseTwilioInboundForm,
} from "@/lib/inboundSms";
import { mapClientRow, type Row } from "@/lib/data/live";
import { createServiceSupabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function twiml(status = 200) {
  return new NextResponse(buildTwilioWebhookResponse(), {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function configuredSecret(): string | null {
  const value = process.env.TIDYTAILS_TWILIO_WEBHOOK_SECRET?.trim();
  return value || null;
}

function configuredGroomerId(): string | null {
  const value = process.env.TIDYTAILS_OPERATOR_USER_ID?.trim();
  return value || null;
}

export async function POST(request: Request) {
  const secret = configuredSecret();
  const url = new URL(request.url);
  if (!secret || url.searchParams.get("secret") !== secret) {
    return twiml(403);
  }

  const groomerId = configuredGroomerId();
  if (!groomerId) return twiml(500);

  const body = await request.text();
  const parsed = parseTwilioInboundForm(new URLSearchParams(body));
  if (!parsed.ok) return twiml(400);

  const supabase = createServiceSupabase();
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

  return twiml();
}
