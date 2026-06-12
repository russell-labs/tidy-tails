"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  detectInstallPlatform,
  INSTALL_PROMPT_DISMISSED_KEY,
  shouldShowInstallPrompt,
} from "@/lib/installPrompt";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

// One-time, dismissible "install the app" coach mark (M2). iOS has no
// install API, so it gets Share → Add to Home Screen instructions; Android
// and desktop Chromium get a real Install button driven by the captured
// beforeinstallprompt event. Renders nothing once installed (standalone),
// after dismissal, or during SSR/hydration. Tenant-neutral by construction.

// Client detection without effect-driven state: the server snapshot renders
// null, the client snapshot enables the real read-on-render values below.
const emptySubscribe = () => () => {};

function readDismissed(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as { standalone?: boolean }).standalone === true)
  );
}

export function InstallAppPrompt() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [dismissed, setDismissed] = useState(readDismissed);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      // setState inside a subscription callback — the supported pattern.
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (!isClient) return null;

  const platform = detectInstallPlatform(navigator.userAgent);
  if (
    !shouldShowInstallPrompt({
      platform,
      standalone: isStandaloneDisplay(),
      dismissed,
      canNativeInstall: installEvent !== null,
    })
  ) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, "true");
    } catch {
      // Session-only dismissal is fine if storage is unavailable.
    }
  };

  return (
    <div className="px-4 pt-3">
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            Add Tidy Tails to your Home Screen
          </p>
          {platform === "ios" ? (
            <p className="mt-1 text-sm text-ink-soft">
              Tap the Share button in Safari, then choose{" "}
              <span className="font-medium text-ink">Add to Home Screen</span>{" "}
              for one-tap access.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">
              Install the app for one-tap access from your home screen.
            </p>
          )}
          {installEvent ? (
            <button
              type="button"
              onClick={() => {
                void installEvent.prompt();
                dismiss();
              }}
              className="mt-3 min-h-11 rounded-lg border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Install
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install suggestion"
          className="-mr-1 -mt-1 rounded-full p-1.5 text-ink-soft"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
