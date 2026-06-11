"use client";

import { useEffect, useState } from "react";
import { endImpersonationAction } from "@/lib/actions/adminImpersonation";

// TT-015 — persistent, impossible-to-miss strip shown the entire time a platform
// admin is viewing a tenant org. It states the org, that this is admin access,
// that it is READ-ONLY, a live countdown to the DB time-box, and an Exit that
// ends the session. The countdown is computed after mount (so server/client
// don't disagree on the minute); the read-only contract itself is always shown.
export function ImpersonationBanner({
  orgName,
  expiresAt,
}: {
  orgName: string;
  expiresAt: string;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.ceil(ms / 60000)));
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const expiryLabel =
    remaining === null
      ? null
      : remaining <= 0
        ? "expired"
        : `expires in ${remaining} min`;

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-xs font-semibold text-amber-950">
      <span>
        Viewing as <strong>{orgName}</strong> — admin · read-only
        {expiryLabel ? ` · ${expiryLabel}` : ""}
      </span>
      <form action={endImpersonationAction}>
        <button
          type="submit"
          className="rounded-full bg-amber-950 px-3 py-1 font-semibold text-amber-50"
        >
          Exit
        </button>
      </form>
    </div>
  );
}
