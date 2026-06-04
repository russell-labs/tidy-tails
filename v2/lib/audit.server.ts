import { unstable_noStore as noStore } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import {
  buildAuditEventInsert,
  mapAuditEventRow,
  type AuditEvent,
  type AuditEventInput,
} from "@/lib/audit";
import { dataMode } from "@/lib/data/repo";
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
  } catch (error) {
    // Activity logging is operational evidence, not the primary action.
    // A missing table, transient network issue, or policy problem must never
    // prevent Sam from booking, editing, exporting, or sending a message.
    console.error("Failed to record audit event", error);
    if (process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }
}

export async function loadRecentAuditEvents(limit = 20): Promise<AuditEvent[]> {
  noStore();
  if (dataMode() !== "live") return [];

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
