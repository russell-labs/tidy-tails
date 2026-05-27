import { unstable_noStore as noStore } from "next/cache";
import { mapSmsMessageRow, type SmsMessage } from "@/lib/inboundSms";
import { createServerSupabase } from "@/lib/supabase/server";

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
    return (data ?? []).map(mapSmsMessageRow);
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
    return (data ?? []).map(mapSmsMessageRow);
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
