import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { recordAuditEvent } from "@/lib/audit.server";
import { isAllowedOperatorEmail } from "@/lib/operatorAccess";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

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

  if (!isAllowedOperatorEmail(user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?access=denied", request.url));
  }

  await recordAuditEvent({
    eventType: "auth.signed_in",
    summary: `Signed in with Google as ${user?.email ?? "operator"}.`,
  });

  redirect(next.startsWith("/") ? next : "/");
}
