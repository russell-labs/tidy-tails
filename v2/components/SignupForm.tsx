"use client";

// Self-serve signup form for Tidy Tails v2 (WS3).
//
// Mirrors LoginForm: a client component so it can surface inline errors and a
// pending state through useActionState. The actual signUp runs server-side; with
// "Confirm email" enabled the user must confirm before they can sign in, so on
// success we swap the form for a "check your inbox" confirmation.

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignupState } from "@/lib/actions/auth";
import { SubmitDogOverlay } from "./SubmitDog";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    signUp,
    null,
  );

  if (state && "status" in state && state.status === "confirm-sent") {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="rounded-xl bg-brand-soft/50 px-4 py-3 text-sm leading-6 text-ink"
        >
          Almost there. We sent a confirmation link to{" "}
          <span className="font-semibold">{state.email}</span>. Open it to
          confirm your email, then sign in.
        </p>
        <Link href="/login" className="tt-btn tt-btn-primary w-full">
          Go to sign in
        </Link>
      </div>
    );
  }

  const error = state && "error" in state ? state.error : null;

  return (
    <div className="flex flex-col gap-4">
      <SubmitDogOverlay label="Creating account" show={pending} />
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
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
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
          {pending ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
