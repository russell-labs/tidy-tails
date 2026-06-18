"use client";

// "Forgot password" request form (WS3). Calls resetPasswordForEmail server-side.
// To avoid leaking which emails are registered, the server always reports
// success, so on submit we show the same neutral confirmation either way.

import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordReset,
  type ResetRequestState,
} from "@/lib/actions/auth";
import { SubmitDogOverlay } from "./SubmitDog";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<
    ResetRequestState,
    FormData
  >(requestPasswordReset, null);

  if (state && "status" in state && state.status === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="rounded-xl bg-brand-soft/50 px-4 py-3 text-sm leading-6 text-ink"
        >
          If an account exists for that email, we sent a link to reset your
          password. Check your inbox.
        </p>
        <Link href="/login" className="tt-btn tt-btn-primary w-full">
          Back to sign in
        </Link>
      </div>
    );
  }

  const error = state && "error" in state ? state.error : null;

  return (
    <div className="flex flex-col gap-4">
      <SubmitDogOverlay label="Sending reset link" show={pending} />
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
          {pending ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="text-center text-sm text-ink-soft">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
