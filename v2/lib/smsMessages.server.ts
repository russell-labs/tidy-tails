import { unstable_noStore as noStore } from "next/cache";
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
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("sms_messages")
      .select("*")
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

async function refreshOutboundDeliveryStatuses(
  messages: SmsMessage[],
): Promise<SmsMessage[]> {
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
