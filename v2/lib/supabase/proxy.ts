// Session refresh + route protection for the Next.js proxy (the renamed
// `middleware`). Runs before every app route and:
//
//   1. Refreshes the Supabase Auth session, writing any rotated tokens back
//      onto the response cookies — plus the no-store cache headers Supabase
//      asks for, so a CDN can never serve one operator's session to another.
//   2. Redirects unauthenticated requests to /login, and signed-in requests
//      that land on /login to the app home.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isE2EAuthBypassEnabled } from "../e2eAuth";
import { getSupabaseCredentials } from "./env";

// Routes reachable without a session. Everything else requires sign-in.
// WS3: signup + forgot-password are self-serve front-door entry points and must
// be reachable signed-out. /reset-password is intentionally NOT public — it is
// reached only after the recovery link establishes a session via /auth/callback.
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/auth/callback",
  "/api/twilio/inbound-sms",
  "/api/twilio/message-status",
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function updateSession(request: NextRequest) {
  if (isE2EAuthBypassEnabled()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  // Cache directives written by setAll; carried onto redirect responses too.
  const cacheHeaders: Record<string, string> = {};

  const { url, anonKey } = getSupabaseCredentials();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Apply rotated session cookies to the request (so a downstream render
        // sees them) and to a fresh response (so the browser stores them).
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, val] of Object.entries(headers)) {
          response.headers.set(key, val);
          cacheHeaders[key] = val;
        }
      },
    },
  });

  // IMPORTANT: run no code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicRoute(pathname)) {
    return finalize(
      NextResponse.redirect(new URL("/login", request.url)),
      response,
      cacheHeaders,
    );
  }

  // Auth-only gate (WS3): membership is no longer checked here. A signed-in user
  // who has not yet created an org is routed to onboarding by the (app) layout,
  // not rejected. Security still rests on the fail-closed data layer + per-org
  // RLS. A signed-in user on a signed-out entry page is sent into the app.
  if (user && SIGNED_OUT_ENTRY_PATHS.includes(pathname)) {
    return finalize(
      NextResponse.redirect(new URL("/", request.url)),
      response,
      cacheHeaders,
    );
  }

  return response;
}

// Entry pages that only make sense signed out; a signed-in user is forwarded in.
const SIGNED_OUT_ENTRY_PATHS = ["/login", "/signup", "/forgot-password"];

// Carries cookies and cache headers written by setAll onto a redirect, so a
// token rotation that happened during this request is not dropped.
function finalize(
  redirect: NextResponse,
  carrier: NextResponse,
  cacheHeaders: Record<string, string>,
): NextResponse {
  for (const cookie of carrier.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  for (const [key, val] of Object.entries(cacheHeaders)) {
    redirect.headers.set(key, val);
  }
  return redirect;
}
