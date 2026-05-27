import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DataModeBanner } from "@/components/DataModeBanner";

// Authenticated shell. Mobile keeps the phone-width cockpit; larger screens
// get enough width for operational panes like the message center.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas md:max-w-3xl lg:max-w-4xl">
      <DataModeBanner />
      <AppHeader />
      <div className="flex-1 pad-bottom-nav">{children}</div>
      <BottomNav />
    </div>
  );
}
