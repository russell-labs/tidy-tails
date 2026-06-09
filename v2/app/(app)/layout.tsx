import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DataModeBanner } from "@/components/DataModeBanner";
import { SentryOrgTag } from "@/components/SentryOrgTag";
import { ONBOARDING_PATH } from "@/lib/authRouting";
import { dataMode } from "@/lib/data/repo";
import { applyServerOrgTag } from "@/lib/sentryTenant.server";

// Authenticated shell. Mobile keeps the phone-width cockpit; larger screens
// get enough width for operational panes like the message center.
//
// WS3 membership gate: on the live multi-tenant path, a signed-in user with no
// organization is routed to onboarding to create one. This is routing only —
// the data layer fails closed and per-org RLS enforces isolation regardless.
// Fixtures/E2E mode has no org concept, so the gate is skipped there.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve the org once (reusing the existing membership seam) AND tag this
  // server request's Sentry scope with it — one call, fail-safe. The same org_id
  // gates the onboarding redirect and is carried onto the browser scope via
  // <SentryOrgTag>. Fixtures/E2E has no org concept, so org stays null and tags
  // nothing. org_id only — no PII.
  const orgId = dataMode() === "live" ? await applyServerOrgTag() : null;
  if (dataMode() === "live" && !orgId) {
    redirect(ONBOARDING_PATH);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas md:max-w-3xl lg:max-w-4xl">
      <SentryOrgTag orgId={orgId} />
      <DataModeBanner />
      <AppHeader />
      <div className="flex-1 pad-bottom-nav">{children}</div>
      <BottomNav />
    </div>
  );
}
