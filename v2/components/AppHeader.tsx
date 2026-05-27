import Link from "next/link";
import { loadNotificationCount } from "@/lib/notifications.server";
import { RefreshButton } from "./RefreshButton";

// Compact brand mark for the authenticated shell — a small, work-focused strip
// so every screen reads as Tidy Tails without crowding the task. The full logo
// lives on the login screen; in-app this is just the mark plus wordmark.
export async function AppHeader() {
  const notificationCount = await loadNotificationCount();
  const notificationLabel =
    notificationCount > 0
      ? `${notificationCount} notifications`
      : "Notifications";

  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
      <Link href="/" className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-6 w-6" />
        <span className="text-sm font-semibold tracking-tight text-ink">
          Tidy Tails
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href="/inbox"
          aria-label={notificationLabel}
          className="relative rounded-full p-2 text-ink-soft active:bg-brand-soft active:text-brand"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.27 21a2 2 0 0 0 3.46 0" />
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          </svg>
          {notificationCount > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-warn px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          ) : null}
        </Link>
        <RefreshButton />
        <Link
          href="/settings"
          aria-label="Settings"
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-canvas text-brand shadow-sm active:bg-brand-soft"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-5 w-5" />
          <svg
            className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface p-0.5 text-ink-soft"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
