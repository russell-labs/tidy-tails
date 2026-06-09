"use client";

import { useEffect } from "react";
import { tagSentryOrg } from "@/lib/sentryTenant";

// Carries the server-resolved org onto the BROWSER Sentry scope so client-side
// errors are attributable to the right tenant too. Renders nothing. Fail-safe:
// a null org (logged-out / bootstrap / fixtures) tags nothing. org_id only.
export function SentryOrgTag({ orgId }: { orgId: string | null }) {
  useEffect(() => {
    tagSentryOrg(orgId);
  }, [orgId]);
  return null;
}
