"use client";

// Sign-in form for Tidy Tails v2.
//
// A client component so it can surface inline auth errors and a pending state
// through useActionState — no full-page reload, no error round-trip through the
// URL. The actual sign-in runs server-side in the signIn server action.

import { useActionState } from "react";
import { signIn, type AuthState } from "@/lib/actions/auth";
import { SubmitDogOverlay } from "./SubmitDog";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signIn,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <SubmitDogOverlay label="Signing in" show={pending} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-soft">Email</span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-faint"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-soft">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className="rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-faint"
        />
      </label>

      {state?.error ? (
        <p
          role="alert"
          className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink disabled:opacity-60"
      >
        Sign in
      </button>
    </form>
  );
}
