import type { Metadata } from "next";
import { SignupForm } from "@/components/SignupForm";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-[0_18px_60px_rgba(28,27,34,0.10)]">
      <div className="border-b border-line bg-white px-6 pb-6 pt-7 text-center sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/tidy-tails-logo.jpg"
          alt="Tidy Tails"
          className="mx-auto h-24 w-24 rounded-2xl border border-line object-cover shadow-sm sm:h-28 sm:w-28"
        />
        <h1 className="sr-only">Tidy Tails</h1>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Tidy Tails
        </p>
        <p className="mt-2 text-xl font-semibold text-ink">Create your account</p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Start running your grooming business in Tidy Tails.
        </p>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <SignupForm />
      </div>
    </div>
  );
}
