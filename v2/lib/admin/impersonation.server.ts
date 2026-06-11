// TT-015 — Admin "view-as" / support impersonation (server-only).
//
// This module is the app-layer face of the read-only-at-the-DB impersonation
// design. Its security-load-bearing property: when the feature flag is OFF,
// every export returns its inert value on the FIRST line, so behaviour is
// byte-identical to a build without this feature. When ON, all real
// authorization still rests on the DB (the SECURITY DEFINER RPCs assert
// is_platform_admin(); the SELECT OR-term is empty for non-admins). Nothing
// here grants access on its own.
//
// IMPORTANT: this file must NOT import from lib/data/repo.ts — repo imports
// activeImpersonation() from here to build the read scope, so importing repo
// back would create a cycle. The live-data check is inlined for that reason.
//
// Server-only: import from Server Components / server actions, never client code.

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { isAdminViewAsEnabled } from "@/lib/writeGate";

// Inlined to avoid a repo.ts import cycle (see file header). Mirrors
// repo.dataMode()'s live check exactly.
function isLiveData(): boolean {
  return process.env.NEXT_PUBLIC_USE_LIVE_DATA === "on";
}

export type ActiveImpersonation = {
  sessionId: string;
  orgId: string;
  orgName: string;
  /** ISO timestamp the session auto-expires (DB time-box, ≤30 min). */
  expiresAt: string;
};

export type AdminOrg = {
  id: string;
  name: string;
  createdAt: string;
};

// Is the caller a platform admin? Flag off / fixtures / no session => false on
// the first line, with NO DB call. The DB is the source of truth
// (is_platform_admin RPC); a true here only means "the allowlist contains this
// uid".
export async function isPlatformAdmin(): Promise<boolean> {
  if (!isAdminViewAsEnabled()) return false;
  if (!isLiveData()) return false;
  if (!(await getCurrentUser())) return false;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return data === true;
}

// The caller's active impersonation session (org name resolved via the SECURITY
// DEFINER context RPC, so the admin's lack of membership doesn't hide the org).
// null — with NO DB call — when the flag is off, not live, or no session; null
// after the RPC when there is no active session. This is on every live read path
// via liveReadScope(); the flag-off short-circuit keeps that path zero-cost.
export async function activeImpersonation(): Promise<ActiveImpersonation | null> {
  if (!isAdminViewAsEnabled()) return null; // flag off: identical to pre-feature
  if (!isLiveData()) return null;
  if (!(await getCurrentUser())) return null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("admin_active_impersonation");
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as {
    session_id: string;
    target_org_id: string;
    org_name: string;
    expires_at: string;
  };
  return {
    sessionId: row.session_id,
    orgId: row.target_org_id,
    orgName: row.org_name,
    expiresAt: row.expires_at,
  };
}

// Begin a (single-active, 30-min) impersonation session for the target org.
// Returns the new session id, or null if the flag is off or the RPC rejected
// (e.g. caller is not a platform admin — the RPC asserts is_platform_admin()).
export async function startImpersonation(
  orgId: string,
  reason: string | null,
): Promise<string | null> {
  if (!isAdminViewAsEnabled()) return null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("admin_start_impersonation", {
    p_org: orgId,
    p_reason: reason,
  });
  if (error) return null;
  return typeof data === "string" ? data : null;
}

// End the caller's active session(s). Idempotent; inert when the flag is off.
export async function endImpersonation(): Promise<void> {
  if (!isAdminViewAsEnabled()) return;
  const supabase = await createServerSupabase();
  await supabase.rpc("admin_end_impersonation");
}

// Convenience for write actions' read-only guard (defense in depth + legibility:
// RLS + requireOrgId already block the write; this returns the action's own
// "nothing saved" shape instead of a thrown error). true only while a session is
// active (and the flag is on).
export async function isImpersonating(): Promise<boolean> {
  return (await activeImpersonation()) !== null;
}

// Orgs the /admin picker can choose from. Admin-only at the DB (admin_list_orgs
// returns nothing unless is_platform_admin()); [] when the flag is off.
export async function listOrgsForAdmin(): Promise<AdminOrg[]> {
  if (!isAdminViewAsEnabled()) return [];
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("admin_list_orgs");
  if (error || !Array.isArray(data)) return [];
  return (data as Array<{ id: string; name: string; created_at: string }>).map(
    (r) => ({ id: r.id, name: r.name, createdAt: r.created_at }),
  );
}
