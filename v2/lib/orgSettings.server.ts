// Server-only reader for the current org's settings (WS4a — first reader of the
// org_settings table). Fail-safe: returns the batched default whenever there is
// no live data, no org membership, no row, or any read error — so Sam (whose
// cutover org has no org_settings row) and fixtures/e2e always resolve to
// batched, and a one_to_one org is opt-in via a real row.

import { dataMode, effectiveOrgId } from "./data/repo";
import {
  DEFAULT_ORG_SETTINGS,
  normalizeOrgSettings,
  type OrgSettings,
} from "./orgSettings";
import { createServerSupabase } from "./supabase/server";

export async function loadOrgSettings(): Promise<OrgSettings> {
  if (dataMode() !== "live") return DEFAULT_ORG_SETTINGS;
  // Display read, so it follows the effective (view-as-aware) org. org_settings
  // IS in the TT-015 admin-read OR-term scope, so while impersonating this
  // returns the tenant's real scheduling style + economics (not the batched
  // default) — a faithful support view.
  const orgId = await effectiveOrgId();
  if (!orgId) return DEFAULT_ORG_SETTINGS;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("org_settings")
    .select("scheduling_style, settings")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return DEFAULT_ORG_SETTINGS;
  return normalizeOrgSettings(
    data as { scheduling_style?: unknown; settings?: unknown },
  );
}
