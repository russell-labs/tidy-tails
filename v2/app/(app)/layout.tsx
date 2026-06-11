import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DataModeBanner } from "@/components/DataModeBanner";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { SentryOrgTag } from "@/components/SentryOrgTag";
import {
  activeImpersonation,
  isPlatformAdmin,
} from "@/lib/admin/impersonation.server";
import { ONBOARDING_PATH } from "@/lib/authRouting";
import { dataMode } from "@/lib/data/repo";
import { applyServerOrgTag } from "@/lib/sentryTenant.server";
import { tagSentryOrg } from "@/lib/sentryTenant";

// Authenticated shell. Mobile keeps the phone-width cockpit; larger screens
// get enough width for operational panes like the message center.
//
// Membership gate (WS3) + admin view-as branch (TT-015). On the live path the
// first question is "is a platform admin impersonating a tenant?":
//   1. impersonating  -> render the shell scoped to the impersonated org, with a
//      persistent read-only banner. (The data layer pivots reads to that org;
//      writes still fail closed — the admin has no membership.)
//   2. else, normal operator with a membership -> render as their own org.
//   3. else, no membership -> a platform admin goes to /admin to pick an org;
//      everyone else goes to onboarding to create one.
// Fixtures/E2E mode has no org concept, so the whole gate is skipped there.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let orgId: string | null = null;
  let impersonating: { orgName: string; expiresAt: string } | null = null;

  if (dataMode() === "live") {
    const impersonation = await activeImpersonation();
    if (impersonation) {
      // Tag this request's Sentry scope with the impersonated org so support-
      // session errors are attributed to the org being viewed (org_id only — no
      // PII). currentOrgId() would be null here (admin has no membership), so we
      // tag the effective org directly.
      orgId = impersonation.orgId;
      tagSentryOrg(orgId);
      impersonating = {
        orgName: impersonation.orgName,
        expiresAt: impersonation.expiresAt,
      };
    } else {
      // Resolve the operator's own org once and tag Sentry with it.
      orgId = await applyServerOrgTag();
      if (!orgId) {
        // No membership. A platform admin manages tenants from /admin; a normal
        // signed-in user with no org is routed to onboarding to create one.
        if (await isPlatformAdmin()) redirect("/admin");
        redirect(ONBOARDING_PATH);
      }
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas md:max-w-3xl lg:max-w-4xl">
      <SentryOrgTag orgId={orgId} />
      {impersonating && (
        <ImpersonationBanner
          orgName={impersonating.orgName}
          expiresAt={impersonating.expiresAt}
        />
      )}
      <DataModeBanner />
      <AppHeader />
      <div className="flex-1 pad-bottom-nav">{children}</div>
      <BottomNav />
    </div>
  );
}
