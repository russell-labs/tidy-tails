// Supabase project credentials, read from the environment.
//
// The anon key is the public client key — safe to ship to the browser when Row
// Level Security is enabled. It is NOT the service_role key, which never
// appears in this app.
//
// Ship 2.2a: these were previously needed only for the optional read-only
// live-data path. Real auth needs them on every request, so they are now
// required for the app to run at all.

export type SupabaseCredentials = {
  url: string;
  anonKey: string;
};

export type SupabaseServiceCredentials = SupabaseCredentials & {
  serviceRoleKey: string;
};

export function getSupabaseCredentials(): SupabaseCredentials {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in v2/.env.local (see .env.local.example).",
    );
  }

  return { url, anonKey };
}

export function getSupabaseServiceCredentials(): SupabaseServiceCredentials {
  const { url, anonKey } = getSupabaseCredentials();
  const serviceRoleKey = process.env.TIDYTAILS_SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Supabase service-role access is not configured. Set " +
        "TIDYTAILS_SUPABASE_SERVICE_ROLE_KEY for trusted webhook writes.",
    );
  }

  return { url, anonKey, serviceRoleKey };
}
