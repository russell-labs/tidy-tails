"use server";

// Onboarding server action (WS3 — the front door).
//
// Takes a freshly-confirmed user with NO organization and, in one action,
// creates their org, their own owner membership, and a seeded settings row —
// after which currentOrgId() resolves and they can use the app. Follows the
// WS2.3 write pattern: the auth-aware session client (never service role),
// server-side validation, org_id carried on every tenant write.
//
// Self-serve org creation is gated by the tightly-scoped INSERT policies added
// in migration 0005 (org_self_create + membership_self_owner_insert): a user may
// create exactly one org stamped as themselves and exactly one OWNER membership
// for themselves in an org THEY created — never in anyone else's. "Exactly one
// org" is enforced race-safe at the database by the org_one_owner_per_user
// partial unique index; the currentOrgId() guard below is the fast path, not the
// guarantee.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentOrgId } from "@/lib/data/repo";
import { buildOrgSettings, normalizeOnboardingInput } from "@/lib/onboarding";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export type OnboardingState = { error: string } | null;

export async function createOrganization(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Idempotent: a user who already belongs to an org is already onboarded.
  // Never create a second org for them — send them into the app. This also
  // makes a re-submitted wizard a harmless no-op.
  if (await currentOrgId()) {
    revalidatePath("/", "layout");
    redirect("/");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "null"));
  } catch {
    return { error: "Something went wrong reading the form. Please try again." };
  }
  const parsed = normalizeOnboardingInput(raw);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const supabase = await createServerSupabase();
  // Generate the org id in app code: under per-org RLS the new org row is not
  // visible to its creator until their membership exists, so INSERT..RETURNING
  // would come back empty. Holding the id locally avoids that round-trip.
  const orgId = crypto.randomUUID();

  // 1. Org identity. with check (created_by = auth.uid()).
  const orgInsert = await supabase
    .from("organizations")
    .insert({ id: orgId, name: parsed.value.businessName, created_by: user.id });
  if (orgInsert.error) {
    return { error: "Couldn't create your business. Please try again in a moment." };
  }

  // 2. Owner membership. with check (self + owner + org_created_by_me). A racing
  //    double-submit that slipped past the guard above fails here on the partial
  //    unique index — the user keeps exactly one owner membership.
  const membershipInsert = await supabase
    .from("organization_memberships")
    .insert({ org_id: orgId, user_id: user.id, role: "owner" });
  if (membershipInsert.error) {
    // The org row created in (1) now has no members → invisible under RLS and
    // harmless. We do not attempt to delete it (no self-serve org delete) and do
    // not seed settings. A retry creates a fresh org + membership.
    return {
      error: "Couldn't finish setting up your business. Please try again in a moment.",
    };
  }

  // 3. Seed per-org settings. Membership now exists, so user_org_ids() resolves
  //    and this rides the standard org_settings_insert policy. Non-fatal: the
  //    user is already onboarded (org + membership exist), so a settings hiccup
  //    must not trap them on the wizard — they land in the app and can set
  //    details later (WS4 owns the settings surfaces).
  const seed = buildOrgSettings(parsed.value);
  await supabase.from("org_settings").insert({ org_id: orgId, ...seed });

  revalidatePath("/", "layout");
  redirect("/");
}
