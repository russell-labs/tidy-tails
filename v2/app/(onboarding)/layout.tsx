// Onboarding shell. Lives OUTSIDE the (app) group so the (app) membership gate
// can redirect an org-less user here without looping. Requires a session (the
// proxy enforces that) but NOT a membership — this is where one is created.
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 py-8 sm:px-6 sm:py-10">
      <div className="w-full max-w-[34rem]">{children}</div>
    </main>
  );
}
