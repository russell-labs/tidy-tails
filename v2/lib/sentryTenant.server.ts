import { currentOrgId } from "./data/repo";
import { tagSentryOrg } from "./sentryTenant";

// Resolve the current request's org via the existing membership read seam
// (currentOrgId — no new query path, no RLS change) and tag the Sentry scope.
// Returns the resolved org id (or null) so a caller that already needs it — e.g.
// the authenticated layout passing it to the browser — can reuse the result.
//
// Fail-safe end to end: a logged-out user, a bootstrap user with no membership,
// fixtures mode, or any resolver error all resolve to null and tag nothing,
// never throwing.
export async function applyServerOrgTag(): Promise<string | null> {
  try {
    const orgId = await currentOrgId();
    tagSentryOrg(orgId);
    return orgId;
  } catch {
    return null;
  }
}
