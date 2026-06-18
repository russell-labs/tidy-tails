"use client";

// Sign-in form for Tidy Tails v2.
//
// A client component so it can surface inline auth errors and a pending state
// through useActionState — no full-page reload, no error round-trip through the
// URL. The actual sign-in runs server-side in the signIn server action.

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, signInWithGoogle, type AuthState } from "@/lib/actions/auth";
import { SubmitDogOverlay } from "./SubmitDog";

function GoogleSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-base font-semibold text-ink shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/40 active:bg-canvas disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-brand shadow-sm ring-1 ring-line"
      >
        G
      </span>
      {pending ? "Opening Google..." : "Sign in with Google"}
    </button>
  );
}

export function LoginForm({ initialError }: { initialError?: string | null }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signIn,
    null,
  );
  const error = state?.error ?? initialError;

  return (
    <div className="flex flex-col gap-4">
      <SubmitDogOverlay label="Signing in" show={pending} />
      <form action={signInWithGoogle}>
        <GoogleSubmitButton />
      </form>

      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        <span className="h-px flex-1 bg-line" />
        <span>Email fallback</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-soft">Email</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            className="tt-input text-base"
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
            className="tt-input text-base"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="tt-btn tt-btn-primary mt-2 w-full"
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="flex flex-col gap-1 text-center text-sm text-ink-soft">
        <Link
          href="/forgot-password"
          className="font-semibold text-brand hover:underline"
        >
          Forgot your password?
        </Link>
        <p>
          New to Tidy Tails?{" "}
          <Link
            href="/signup"
            className="font-semibold text-brand hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
