// Server-only reader (and the weekday-schedule writer) for the current org's
// settings (WS4a — first reader of the org_settings table). The reader is
// fail-safe: it returns the batched default whenever there is no live data, no
// org membership, no row, or any read error — so Sam (whose cutover org has no
// org_settings row) and fixtures/e2e always resolve to batched, and a one_to_one
// org is opt-in via a real row. The writer (writeWeekdayLocations) is the first
// app writer of this table outside onboarding and only ever touches the
// additive weekday_locations column.

import { currentOrgId, dataMode } from "./data/repo";
import {
  DEFAULT_ORG_SETTINGS,
  normalizeOrgSettings,
  type OrgSettings,
  type WeekdayLocations,
} from "./orgSettings";
import { createServerSupabase } from "./supabase/server";

export async function loadOrgSettings(): Promise<OrgSettings> {
  if (dataMode() !== "live") return DEFAULT_ORG_SETTINGS;
  const orgId = await currentOrgId();
  if (!orgId) return DEFAULT_ORG_SETTINGS;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("org_settings")
    .select("scheduling_style, settings, weekday_locations")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return DEFAULT_ORG_SETTINGS;
  return normalizeOrgSettings(
    data as {
      scheduling_style?: unknown;
      settings?: unknown;
      weekday_locations?: unknown;
    },
  );
}

// Persist the org's recurring weekday location schedule. Writes ONLY the
// weekday_locations column (the other org_settings columns are left untouched),
// upserting on org_id so a brand-new org with no settings row still gets one —
// this rides the existing per-org RLS (org_settings_insert / _update scoped to
// user_org_ids()), so a caller can only ever write their own org's row. Returns
// false (a no-op) when there is no live data mode or no resolvable org, so
// fixtures/e2e never attempt a write. The value is normalized through the same
// pure normalizer the reader uses, so only well-formed weekday -> location
// entries are stored.
export async function writeWeekdayLocations(
  weekdayLocations: WeekdayLocations,
): Promise<boolean> {
  if (dataMode() !== "live") return false;
  const orgId = await currentOrgId();
  if (!orgId) return false;
  const normalized = normalizeOrgSettings({
    weekday_locations: weekdayLocations,
  }).weekdayLocations;
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("org_settings")
    .upsert(
      {
        org_id: orgId,
        weekday_locations: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
  return !error;
}
