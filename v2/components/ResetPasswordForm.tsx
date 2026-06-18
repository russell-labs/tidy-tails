"use client";

// Set-a-new-password form (WS3). Reached from the recovery email link after the
// callback established a recovery session. On success the server updates the
// password and redirects into the app (or onboarding); errors render inline.

import { useActionState } from "react";
import { updatePassword, type UpdatePasswordState } from "@/lib/actions/auth";
import { SubmitDogOverlay } from "./SubmitDog";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<
    UpdatePasswordState,
    FormData
  >(updatePassword, null);
  const error = state?.error ?? null;

  return (
    <div className="flex flex-col gap-4">
      <SubmitDogOverlay label="Updating password" show={pending} />
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-soft">New password</span>
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

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-soft">
            Confirm new password
          </span>
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="Re-enter your new password"
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
          {pending ? "Updating..." : "Set new password"}
        </button>
      </form>
    </div>
  );
}
