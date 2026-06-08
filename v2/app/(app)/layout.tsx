import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DataModeBanner } from "@/components/DataModeBanner";
import { ONBOARDING_PATH } from "@/lib/authRouting";
import { currentOrgId, dataMode } from "@/lib/data/repo";

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
  if (dataMode() === "live" && !(await currentOrgId())) {
    redirect(ONBOARDING_PATH);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas md:max-w-3xl lg:max-w-4xl">
      <DataModeBanner />
      <AppHeader />
      <div className="flex-1 pad-bottom-nav">{children}</div>
      <BottomNav />
    </div>
  );
}
