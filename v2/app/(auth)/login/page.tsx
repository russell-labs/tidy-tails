import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "Sign in" };

function authMessage(error: string | string[] | undefined): string | null {
  const value = Array.isArray(error) ? error[0] : error;
  if (value === "google" || value === "oauth") {
    return "Google sign-in could not finish. Try again, or use email and password.";
  }
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const message = authMessage(params?.error);

  return (
    <div className="overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-[0_18px_60px_rgba(28,27,34,0.10)]">
      <div className="border-b border-line bg-white px-6 pb-6 pt-7 text-center sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/tidy-tails-logo.jpg"
          alt="Tidy Tails"
          className="mx-auto h-28 w-28 rounded-2xl border border-line object-cover shadow-sm sm:h-32 sm:w-32"
        />
        <h1 className="sr-only">Tidy Tails</h1>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          Tidy Tails
        </p>
        <p className="mt-2 text-xl font-semibold text-ink">Sign in</p>
        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Use the approved operator account for the grooming book.
        </p>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <LoginForm initialError={message} />
      </div>
    </div>
  );
}
