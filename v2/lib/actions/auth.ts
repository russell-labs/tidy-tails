"use server";

// Supabase Auth server actions (WS3 — the front door).
//
// This is app-side auth only: it signs people in/up against the Supabase
// project. Entry is gated by ORGANIZATION MEMBERSHIP, not a hardcoded allowlist
// (retired in WS3): a confirmed user with a membership enters the app; a
// confirmed user with no membership is routed to onboarding to create one;
// an unconfirmed user cannot enter (Supabase rejects "email not confirmed").
// RLS still protects every row at the database layer.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/audit.server";
import { postAuthDestination } from "@/lib/authRouting";
import { currentOrgId } from "@/lib/data/repo";
import { createServerSupabase } from "@/lib/supabase/server";

export type AuthState = { error: string } | null;
export type SignupState =
  | { error: string }
  | { status: "confirm-sent"; email: string }
  | null;
export type ResetRequestState = { error: string } | { status: "sent" } | null;
export type UpdatePasswordState = { error: string } | null;

const MIN_PASSWORD_LENGTH = 8;

// Maps a Supabase Auth error to something a person can act on, without revealing
// whether a given email is registered.
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

function friendlySignupError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("password")) {
    return `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  if (m.includes("valid email") || m.includes("invalid")) {
    return "Enter a valid email address.";
  }
  return "Couldn't create the account. Try again in a moment.";
}

// Resolve where a freshly-authenticated user should go (app vs onboarding) from
// their membership, then redirect. Always revalidates first so a render produced
// while signed out is dropped.
async function redirectAfterAuth(): Promise<never> {
  const orgId = await currentOrgId();
  revalidatePath("/", "layout");
  redirect(postAuthDestination(Boolean(orgId)));
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

  await recordAuditEvent({
    eventType: "auth.signed_in",
    summary: `Signed in as ${email}.`,
  });
  // Confirmed + member -> app; confirmed + no membership -> onboarding.
  await redirectAfterAuth();
  return null;
}

export async function signUp(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and a password." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const supabase = await createServerSupabase();
  const origin = appOriginFromHeaders(await headers());
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The confirmation link returns to the app's callback, which establishes
      // the session and routes a brand-new user to onboarding. Origin comes from
      // the request so staging/preview/prod each confirm to themselves; never a
      // hardcoded localhost.
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: friendlySignupError(error.message) };
  }

  // Do not sign the user in here: with "Confirm email" on, they must confirm
  // first. Showing the same "check your inbox" state for new and already-
  // registered emails avoids leaking which addresses exist.
  return { status: "confirm-sent", email };
}

export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Enter your email address." };
  }

  const supabase = await createServerSupabase();
  const origin = appOriginFromHeaders(await headers());
  // The recovery link returns through the callback (which exchanges the code for
  // a session) and is then forwarded to /reset-password to set a new password.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Always report success: never reveal whether the email is registered.
  return { status: "sent" };
}

export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const supabase = await createServerSupabase();
  // Requires the recovery session established by the callback. Without it
  // Supabase returns an auth error and we surface a friendly retry message.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error:
        "Couldn't update your password. Open the reset link again and retry.",
    };
  }

  await recordAuditEvent({
    eventType: "auth.password_updated",
    summary: "Updated account password.",
  });
  await redirectAfterAuth();
  return null;
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
