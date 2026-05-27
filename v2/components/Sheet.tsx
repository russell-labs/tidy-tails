"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Bottom-sheet modal primitive. Mobile-first: slides from the bottom, keeps the
// content above the keyboard, constrained to the app's phone-width column.
export function Sheet({
  open,
  onClose,
  title,
  variant = "bottom",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  variant?: "bottom" | "fullscreen";
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const previous = {
      htmlOverflow: document.documentElement.style.overflow,
      sheetOpen: document.body.dataset.tidySheetOpen,
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    document.body.dataset.tidySheetOpen = "true";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = previous.htmlOverflow;
      if (previous.sheetOpen === undefined) {
        delete document.body.dataset.tidySheetOpen;
      } else {
        document.body.dataset.tidySheetOpen = previous.sheetOpen;
      }
      document.body.style.overflow = previous.overflow;
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [open, onClose]);

  if (!open) return null;

  const panelClass =
    variant === "fullscreen"
      ? "tidy-sheet-panel tidy-sheet-panel-fullscreen relative mx-auto flex w-full max-w-md flex-col overflow-hidden overscroll-contain rounded-none bg-surface shadow-2xl sm:mb-3 sm:w-[calc(100%-1.5rem)] sm:rounded-2xl"
      : "tidy-sheet-panel tidy-sheet-panel-bottom relative mx-auto flex w-full max-w-md flex-col overflow-hidden overscroll-contain rounded-t-2xl bg-surface shadow-2xl sm:mb-3 sm:w-[calc(100%-1.5rem)] sm:rounded-2xl";

  const sheet = (
    <div
      className="tidy-sheet-root fixed inset-0 z-50 flex flex-col justify-end bg-ink/40"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className={panelClass}>
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 rounded-full p-1.5 text-ink-soft"
          >
            <svg
              width="22"
              height="22"
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
        </header>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-5 py-4 sheet-bottom-room">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
