// Server-side Supabase client for the Next.js App Router.
//
// A fresh client is created per request (never shared across requests) and
// bound to the request's cookie jar so the SSR session is read — and, in
// Server Functions, refreshed — correctly.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { e2eUser, isE2EAuthBypassEnabled } from "../e2eAuth";
import { getSupabaseCredentials } from "./env";

export async function createServerSupabase() {
  const { url, anonKey } = getSupabaseCredentials();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Cookies are read-only inside a Server Component — there the proxy
        // refreshes the session instead, so swallow the resulting error. In a
        // Server Function or Route Handler this write succeeds.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // No-op: session refresh is handled by the proxy.
        }
      },
    },
  });
}

// Returns the verified current user, or null if not signed in.
//
// Uses getUser() rather than getSession(): getUser() validates the token with
// the Supabase Auth server on every call, so the result is safe to use for
// authorization decisions. getSession() trusts the cookie unverified.
export async function getCurrentUser(): Promise<User | null> {
  if (isE2EAuthBypassEnabled()) return e2eUser();

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
