import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentOrgId, dataMode } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Set up your business" };

// WS3 Slice A: placeholder. A confirmed user with no organization lands here.
// The multi-step wizard that creates the org + owner membership and seeds per-org
// settings is Slice B. A user who already has an org is bounced into the app.
export default async function OnboardingPage() {
  if (dataMode() === "live" && (await currentOrgId())) {
    redirect("/");
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-[0_18px_60px_rgba(28,27,34,0.10)]">
      <div className="border-b border-line bg-white px-6 pb-6 pt-7 text-center sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Tidy Tails
        </p>
        <h1 className="mt-2 text-xl font-semibold text-ink">
          Let&rsquo;s set up your business
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          You&rsquo;re signed in, but you don&rsquo;t have a business yet. The
          setup wizard that creates your organization is coming next.
        </p>
      </div>
      <div className="px-6 py-6 text-sm leading-6 text-ink-soft sm:px-8">
        <p>
          This is a placeholder for the WS3 onboarding wizard. It will capture
          your business name, scheduling style, locations, and economics, then
          create your organization and drop you on your first screen.
        </p>
      </div>
    </div>
  );
}
