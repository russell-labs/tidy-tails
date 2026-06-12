"use client";

import { useTransition } from "react";
import { signOut } from "@/lib/actions/auth";
import { clearAppCaches } from "@/lib/pwa";

// Sign-out with cache eviction (M2). Clears the PWA's Cache Storage before
// running the existing signOut server action, so a shared device never keeps
// one account's cached pages around for the next. Markup and styling match
// the previous inline <form action={signOut}> exactly.
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
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base font-semibold text-danger-ink"
      >
        Sign out
      </button>
    </form>
  );
}
