import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceCredentials } from "./env";

// Trusted server-only client for machine-to-machine writes such as Twilio
// webhooks. Never import this from client components or browser code.
export function createServiceSupabase() {
  const { url, serviceRoleKey } = getSupabaseServiceCredentials();
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
