import { unstable_noStore as noStore } from "next/cache";
import { currentGroomerId, dataMode, liveReadScope } from "@/lib/data/repo";
import { activeImpersonation } from "@/lib/admin/impersonation.server";
import { FIXTURE_SMS_MESSAGES } from "@/lib/data/fixtures";
import {
  buildTwilioStatusUpdate,
  mapSmsMessageRow,
  type SmsMessage,
} from "@/lib/inboundSms";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { fetchTwilioSmsStatus, getTwilioConfig } from "@/lib/twilio";

export async function loadRecentSmsMessages(limit = 12): Promise<SmsMessage[]> {
  noStore();
  if (dataMode() !== "live") {
    return recentFixtureSmsMessages(limit);
  }

  // Scope by liveReadScope: the signed-in operator normally, or the impersonated
  // org while a platform admin holds an active session (TT-015). sms_messages is
  // SENSITIVE (bodies are PII) but in support scope, read-only. Fail closed with
  // no scope. The per-client reads below stay client_id-filtered (still
  // RLS-scoped, so they resolve to the impersonated org's client while viewing).
  const scope = await liveReadScope();
  if (!scope) return [];

  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("sms_messages")
      .select("*")
      .eq(scope.column, scope.value)
      .neq("status", "hidden")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return refreshOutboundDeliveryStatuses((data ?? []).map(mapSmsMessageRow));
  } catch {
    return [];
  }
}

export async function loadClientSmsMessages(
  clientId: string,
  limit = 10,
): Promise<SmsMessage[]> {
  noStore();
  if (dataMode() !== "live") {
    return recentFixtureSmsMessages(limit).filter(
      (message) => message.client_id === clientId,
    );
  }

  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("sms_messages")
      .select("*")
      .eq("client_id", clientId)
      .neq("status", "hidden")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return refreshOutboundDeliveryStatuses((data ?? []).map(mapSmsMessageRow));
  } catch {
    return [];
  }
}

export async function hasClientOutboundSms(clientId: string): Promise<boolean> {
  noStore();
  if (dataMode() !== "live") {
    return FIXTURE_SMS_MESSAGES.some(
      (message) =>
        message.client_id === clientId &&
        message.direction === "outbound" &&
        message.status === "sent",
    );
  }

  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("sms_messages")
      .select("id")
      .eq("client_id", clientId)
      .eq("direction", "outbound")
      .eq("status", "sent")
      .limit(1);
    if (error) return false;
    return Boolean(data?.length);
  } catch {
    return false;
  }
}

function recentFixtureSmsMessages(limit: number): SmsMessage[] {
  return [...FIXTURE_SMS_MESSAGES]
    .sort(
      (a, b) =>
        Date.parse(b.received_at ?? b.sent_at ?? b.created_at) -
        Date.parse(a.received_at ?? a.sent_at ?? a.created_at),
    )
    .slice(0, limit);
}

async function refreshOutboundDeliveryStatuses(
  messages: SmsMessage[],
): Promise<SmsMessage[]> {
  // READ-ONLY CONTRACT (TT-015): the status refresh persists via a service-role
  // client that BYPASSES RLS — the one service-role write reachable from an
  // interactive read path. While impersonating, a support view must not write
  // ANY tenant row, so skip the refresh entirely and return stored statuses.
  // (It is also naturally inert — the write below is scoped to the admin's own
  // groomer_id, which owns no rows — but suppressing it makes read-only explicit
  // rather than relying on an empty match.)
  if (await activeImpersonation()) return messages;

  const candidates = messages
    .filter(
      (message) =>
        message.direction === "outbound" &&
        message.twilio_message_sid &&
        ["queued", "sending", "sent"].includes(message.status.toLowerCase()),
    )
    .slice(0, 10);
  if (candidates.length === 0) return messages;

  const config = getTwilioConfig();
  if (!config.ok) return messages;

  // The status-refresh persistence uses a service-role client, which BYPASSES
  // RLS — so the operator scope must be explicit. Fail closed: with no session,
  // refresh nothing (a service-role write is precisely how data would cross
  // tenants under multi-tenancy). In practice this path is only reached from
  // authenticated reads, so this is defense in depth.
  const groomerId = await currentGroomerId();
  if (!groomerId) return messages;

  let serviceSupabase: ReturnType<typeof createServiceSupabase> | null = null;
  const statusById = new Map<string, string>();
  for (const message of candidates) {
    const sid = message.twilio_message_sid;
    if (!sid) continue;
    const result = await fetchTwilioSmsStatus(config.value, sid);
    if (!result.ok) continue;
    const patch = buildTwilioStatusUpdate({
      messageSid: sid,
      status: result.status,
      to: message.to_phone,
      from: message.from_phone,
    });
    if (patch.status === message.status) continue;
    statusById.set(message.id, patch.status);
    try {
      serviceSupabase ??= createServiceSupabase();
      await serviceSupabase
        .from("sms_messages")
        .update(patch)
        .eq("id", message.id)
        .eq("groomer_id", groomerId)
        .eq("direction", "outbound");
    } catch {
      // The UI can still show the refreshed status for this request even if
      // persistence is temporarily unavailable.
    }
  }

  if (statusById.size === 0) return messages;
  return messages.map((message) => ({
    ...message,
    status: statusById.get(message.id) ?? message.status,
  }));
}
