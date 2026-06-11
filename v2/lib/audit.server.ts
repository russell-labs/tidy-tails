import { unstable_noStore as noStore } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import {
  buildAuditEventInsert,
  mapAuditEventRow,
  type AuditEvent,
  type AuditEventInput,
} from "@/lib/audit";
import { dataMode, liveReadScope, requireOrgId } from "@/lib/data/repo";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export async function recordAuditEvent(
  input: Omit<AuditEventInput, "actorId">,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  try {
    // audit_events is a tenant table — stamp the operator's org so the row is
    // visible under per-org RLS. requireOrgId throws if the operator has no org;
    // the surrounding catch keeps audit non-blocking (a missing audit row must
    // never break the primary action) and ensures we never write a null org_id.
    const orgId = await requireOrgId();
    const supabase = await createServerSupabase();
    await supabase.from("audit_events").insert({
      ...buildAuditEventInsert({
        ...input,
        actorId: user.id,
      }),
      org_id: orgId,
    });
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

  // Scope by liveReadScope: the signed-in operator normally, or the impersonated
  // org while a platform admin holds an active session (TT-015) — support needs
  // the tenant's activity trail. Fail closed with no scope.
  const scope = await liveReadScope();
  if (!scope) return [];

  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("audit_events")
      .select("*")
      .eq(scope.column, scope.value)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []).map(mapAuditEventRow);
  } catch {
    return [];
  }
}
