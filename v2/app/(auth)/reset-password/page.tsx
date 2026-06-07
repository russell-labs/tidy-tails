import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata: Metadata = { title: "Set new password" };

export default function ResetPasswordPage() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-[0_18px_60px_rgba(28,27,34,0.10)]">
      <div className="border-b border-line bg-white px-6 pb-6 pt-7 text-center sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Tidy Tails
        </p>
        <p className="mt-2 text-xl font-semibold text-ink">Set a new password</p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Choose a new password for your account.
        </p>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
