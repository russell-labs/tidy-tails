import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-[0_18px_60px_rgba(28,27,34,0.10)]">
      <div className="border-b border-line bg-white px-6 pb-6 pt-7 text-center sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Tidy Tails
        </p>
        <p className="mt-2 text-xl font-semibold text-ink">Reset your password</p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Enter your email and we&rsquo;ll send a link to set a new password.
        </p>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
