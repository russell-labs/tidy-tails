"use server";

import { redirect } from "next/navigation";
import {
  endImpersonation,
  isPlatformAdmin,
  startImpersonation,
} from "@/lib/admin/impersonation.server";
import { isAdminViewAsEnabled } from "@/lib/writeGate";

// TT-015 — server actions backing the /admin picker and the read-only banner's
// Exit. Both are inert unless the feature flag is on AND the caller is a
// platform admin (re-checked here AND asserted in the SECURITY DEFINER RPCs, so
// neither path trusts the app layer alone). These start/end a support session;
// they never write tenant data.

// Begin viewing a tenant org. Validates the flag + admin status, opens a
// time-boxed session, then drops into the app (now scoped to that org by the
// read pivot). On any failure it falls back to /admin rather than leaking.
export async function startImpersonationAction(formData: FormData): Promise<void> {
  if (!isAdminViewAsEnabled()) redirect("/");
  if (!(await isPlatformAdmin())) redirect("/");

  const orgId = String(formData.get("orgId") ?? "").trim();
  const reasonRaw = String(formData.get("reason") ?? "").trim();
  if (!orgId) redirect("/admin");

  const sessionId = await startImpersonation(orgId, reasonRaw || null);
  if (!sessionId) redirect("/admin");
  redirect("/");
}

// End the active support session and return to the org picker. Idempotent and
// safe to call when nothing is active.
export async function endImpersonationAction(): Promise<void> {
  await endImpersonation();
  redirect("/admin");
}
