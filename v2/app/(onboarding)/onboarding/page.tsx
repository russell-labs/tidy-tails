import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { currentOrgId, dataMode } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Set up your business" };

// WS3 Slice B: a confirmed user with no organization lands here and the wizard
// creates their org + owner membership and seeds per-org settings. A user who
// already has an org is bounced into the app (the (app) gate routes them here
// only while org-less, so this guards a direct visit or a just-completed setup).
export default async function OnboardingPage() {
  if (dataMode() === "live" && (await currentOrgId())) {
    redirect("/");
  }

  return <OnboardingWizard />;
}
