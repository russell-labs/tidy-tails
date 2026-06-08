import { NextResponse, type NextRequest } from "next/server";
import { recordAuditEvent } from "@/lib/audit.server";
import { postAuthDestination } from "@/lib/authRouting";
import { currentOrgId } from "@/lib/data/repo";
import { createServerSupabase } from "@/lib/supabase/server";

// OAuth + email-link callback (WS3). Exchanges the code for a session, then
// routes by ORGANIZATION MEMBERSHIP — the hardcoded allowlist is retired. A
// confirmed user with a membership enters the app; one with no membership goes
// to onboarding. A recovery link carries `next=/reset-password` and is honored.
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextParam = requestUrl.searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await recordAuditEvent({
    eventType: "auth.signed_in",
    summary: `Signed in as ${user?.email ?? "user"}.`,
  });

  // A same-origin `next` (the password-recovery link) takes precedence so the
  // user lands on /reset-password to set a new password. Otherwise route by
  // membership. Reject protocol-relative `//host` values — `new URL("//x", base)`
  // resolves to a different origin (open redirect).
  if (nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")) {
    return NextResponse.redirect(new URL(nextParam, request.url));
  }

  const orgId = await currentOrgId();
  return NextResponse.redirect(
    new URL(postAuthDestination(Boolean(orgId)), request.url),
  );
}
