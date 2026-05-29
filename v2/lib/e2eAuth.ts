import type { User } from "@supabase/supabase-js";

export function isE2EAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.TIDYTAILS_E2E_AUTH_BYPASS === "on"
  );
}

export function e2eUser(): User {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "e2e@tidytails.local",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  } as User;
}
