// Post-authentication routing for the membership-based gate (WS3).
//
// The hardcoded operator allowlist is retired: a confirmed user enters the app
// only once they belong to an organization. A confirmed user with no membership
// is sent to onboarding to create one — never rejected. This pure helper is the
// single source of truth for that decision so it can be unit-tested without a
// session or a redirect.

export const ONBOARDING_PATH = "/onboarding";
export const APP_HOME_PATH = "/";

/**
 * Where a freshly-authenticated user should land.
 *
 * @param hasMembership whether the user belongs to an organization
 *   (`currentOrgId()` resolved to non-null).
 * @returns the app home when they have an org, otherwise the onboarding route.
 */
export function postAuthDestination(hasMembership: boolean): string {
  return hasMembership ? APP_HOME_PATH : ONBOARDING_PATH;
}
