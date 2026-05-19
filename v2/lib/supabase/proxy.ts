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
import { isAllowedOperatorEmail } from "@/lib/operatorAccess";
import { getSupabaseCredentials } from "./env";

// Routes reachable without a session. Everything else requires sign-in.
const PUBLIC_PATHS = ["/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function updateSession(request: NextRequest) {
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

  if (!user && !isPublic(pathname)) {
    return finalize(
      NextResponse.redirect(new URL("/login", request.url)),
      response,
      cacheHeaders,
    );
  }

  if (user && !isAllowedOperatorEmail(user.email)) {
    await supabase.auth.signOut();
    const denied = finalize(
      NextResponse.redirect(new URL("/login?access=denied", request.url)),
      response,
      cacheHeaders,
    );
    clearSupabaseCookies(denied, request);
    return denied;
  }

  if (user && pathname === "/login") {
    return finalize(
      NextResponse.redirect(new URL("/", request.url)),
      response,
      cacheHeaders,
    );
  }

  return response;
}

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

function clearSupabaseCookies(response: NextResponse, request: NextRequest) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.delete(cookie.name);
    }
  }
}
