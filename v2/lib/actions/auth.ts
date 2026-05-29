"use server";

// Supabase Auth server actions for Ship 2.2a — real email/password auth.
//
// This is app-side auth only: it signs the operator in against the existing
// Supabase project. RLS protects the rows, and this action adds an app-level
// allowlist so accidental extra Auth users cannot enter the operator shell.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit.server";
import { isAllowedOperatorEmail } from "@/lib/operatorAccess";
import { createServerSupabase } from "@/lib/supabase/server";

export type AuthState = { error: string } | null;

// Maps a Supabase Auth error to something an operator can act on, without
// revealing whether a given email is registered.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match. Check them and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "This account isn't confirmed yet. Check your inbox for the confirmation link.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  return "Couldn't sign in. Try again in a moment.";
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: friendlyAuthError(error.message) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAllowedOperatorEmail(user?.email)) {
    await supabase.auth.signOut();
    return {
      error: "This Google/Supabase account is not allowed to access Tidy Tails.",
    };
  }

  // Drop any cached render produced while signed out, then enter the app.
  revalidatePath("/", "layout");
  await recordAuditEvent({
    eventType: "auth.signed_in",
    summary: `Signed in as ${user?.email ?? "operator"}.`,
  });
  redirect("/");
}

function appOriginFromHeaders(headersList: Headers): string {
  const forwardedProto = headersList.get("x-forwarded-proto") ?? "https";
  const forwardedHost = headersList.get("x-forwarded-host");
  const host = forwardedHost ?? headersList.get("host");
  return host ? `${forwardedProto}://${host}` : "";
}

export async function signInWithGoogle(_formData: FormData): Promise<void> {
  void _formData;
  const supabase = await createServerSupabase();
  const origin = appOriginFromHeaders(await headers());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }

  redirect(data.url);
}

export async function signOut() {
  await recordAuditEvent({
    eventType: "auth.signed_out",
    summary: "Signed out.",
  });
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
