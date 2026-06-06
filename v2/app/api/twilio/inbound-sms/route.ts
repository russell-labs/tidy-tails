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

// This webhook is session-less and writes with the service-role client, which
// BYPASSES RLS — so per-org RLS will not force org_id here the way it does on
// the authenticated server actions. We must stamp it ourselves or the inbound
// row would be silently orphaned outside the operator's org (invisible to Sam's
// org-gated Inbox after cutover). Derive the org from the configured operator's
// membership; fail closed (the caller returns 500, so Twilio retries) rather
// than writing a null org_id.
async function configuredOrgId(
  supabase: ReturnType<typeof createServiceSupabase>,
  groomerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("org_id")
    .eq("user_id", groomerId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { org_id: string } | null)?.org_id ?? null;
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

  // Resolve the operator's org before any write so the inbound row carries it.
  const orgId = await configuredOrgId(supabase, groomerId);
  if (!orgId) return twiml(500);

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

  const { error: insertError } = await supabase
    .from("sms_messages")
    .upsert(
      { ...insert, org_id: orgId },
      { onConflict: "twilio_message_sid", ignoreDuplicates: true },
    );
  if (insertError) return twiml(500);

  // Future reply-agent seam: pass a generated response into
  // buildTwilioWebhookResponse(reply) when Tidy Tails is ready to auto-reply.
  return twiml();
}
