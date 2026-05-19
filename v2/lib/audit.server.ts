import { unstable_noStore as noStore } from "next/cache";
import {
  buildAuditEventInsert,
  mapAuditEventRow,
  type AuditEvent,
  type AuditEventInput,
} from "@/lib/audit";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export async function recordAuditEvent(
  input: Omit<AuditEventInput, "actorId">,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  try {
    const supabase = await createServerSupabase();
    await supabase.from("audit_events").insert(
      buildAuditEventInsert({
        ...input,
        actorId: user.id,
      }),
    );
  } catch {
    // Activity logging is operational evidence, not the primary action.
    // A missing table, transient network issue, or policy problem must never
    // prevent Sam from booking, editing, exporting, or sending a message.
  }
}

export async function loadRecentAuditEvents(limit = 20): Promise<AuditEvent[]> {
  noStore();
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []).map(mapAuditEventRow);
  } catch {
    return [];
  }
}
