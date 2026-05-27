"use client";

import { useState } from "react";

export function RefreshButton() {
  const [refreshing, setRefreshing] = useState(false);

  async function refreshApp() {
    setRefreshing(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch {
      // A reload still gives the browser a chance to fetch the newest build.
    } finally {
      window.location.reload();
    }
  }

  return (
    <button
      type="button"
      onClick={refreshApp}
      disabled={refreshing}
      aria-label="Refresh app"
      title="Refresh app"
      className="rounded-full p-2 text-ink-soft active:bg-brand-soft active:text-brand disabled:opacity-60"
    >
      <svg
        className={refreshing ? "animate-spin" : ""}
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
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    </button>
  );
}
