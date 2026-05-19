// Server-side operator allowlist for the production app.
//
// RLS protects customer data at the database layer, but the app shell should
// also reject any accidental extra Supabase Auth users. Keep this PRIVATE:
// never expose the allowlist through a NEXT_PUBLIC_ variable.

const DEFAULT_ALLOWED_EMAILS = ["sammclennan143@gmail.com"];

export function allowedOperatorEmails(
  raw = process.env.TIDYTAILS_ALLOWED_EMAILS,
): string[] {
  const source = raw?.trim() ? raw : DEFAULT_ALLOWED_EMAILS.join(",");
  return source
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedOperatorEmail(
  email: string | null | undefined,
  raw = process.env.TIDYTAILS_ALLOWED_EMAILS,
): boolean {
  if (!email) {
    return false;
  }
  return allowedOperatorEmails(raw).includes(email.trim().toLowerCase());
}
