import * as Sentry from "@sentry/nextjs";

// Per-tenant Sentry attribution. Tags the current Sentry scope (server isolation
// scope or the browser scope) with the operator's org so an error is traceable
// to the right tenant.
//
// PII rule: org_id ONLY. Never client names, phones, or pet data.
// Fail-safe: no org → tag nothing; observability must never break a request, so
// even a Sentry failure is swallowed.
//
// Client-safe: imports only @sentry/nextjs (no server-only deps), so the browser
// SentryOrgTag component and the server paths can share it.
export function tagSentryOrg(orgId: string | null | undefined): void {
  if (!orgId) return;
  try {
    Sentry.setTag("org_id", orgId);
  } catch {
    // A broken observability tag must never surface to the operator.
  }
}
