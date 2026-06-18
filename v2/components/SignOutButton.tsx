"use client";

import { useTransition } from "react";
import { signOut } from "@/lib/actions/auth";
import { clearAppCaches } from "@/lib/pwa";

// Sign-out with cache eviction (M2). Clears the PWA's Cache Storage before
// running the existing signOut server action, so a shared device never keeps
// one account's cached pages around for the next. Behavior matches the previous
// inline <form action={signOut}>; the button uses the shared redesign kit
// (TT-040) — an outlined control that keeps the danger-ink color, since
// sign-out is reversible and must not read as a destructive-confirm.
export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-6"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await clearAppCaches();
          await signOut();
        });
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="tt-btn tt-btn-secondary w-full text-danger-ink"
      >
        Sign out
      </button>
    </form>
  );
}
