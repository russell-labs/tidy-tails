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
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []).map(mapSmsMessageRow);
  } catch {
    return [];
  }
}
