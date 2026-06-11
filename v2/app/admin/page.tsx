import { redirect } from "next/navigation";
import { startImpersonationAction } from "@/lib/actions/adminImpersonation";
import {
  isPlatformAdmin,
  listOrgsForAdmin,
} from "@/lib/admin/impersonation.server";
import { isAdminViewAsEnabled } from "@/lib/writeGate";

// TT-015 — platform-admin console. Lives OUTSIDE the (app) group on purpose: a
// platform admin has no org membership, so the (app) layout's membership gate
// would bounce them. Triple-gated: the feature flag, an is_platform_admin()
// check here, AND the SECURITY DEFINER RPCs the form posts to. Non-admins and
// flag-off builds are redirected to the app home — /admin simply does not exist
// for them.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!isAdminViewAsEnabled()) redirect("/");
  if (!(await isPlatformAdmin())) redirect("/");

  const orgs = await listOrgsForAdmin();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 bg-canvas px-4 py-8 md:max-w-2xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-brand-ink">Support · view as</h1>
        <p className="text-sm text-brand-ink/70">
          Open a read-only, time-boxed (30 min) support view of a tenant org.
          Every session is logged. You cannot write to a tenant&apos;s data.
        </p>
      </header>

      {orgs.length === 0 ? (
        <p className="text-sm text-brand-ink/60">No organizations found.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orgs.map((org) => (
            <li
              key={org.id}
              className="rounded-2xl border border-brand-ink/10 bg-surface p-4"
            >
              <form
                action={startImpersonationAction}
                className="flex flex-col gap-3"
              >
                <input type="hidden" name="orgId" value={org.id} />
                <div className="flex flex-col">
                  <span className="font-semibold text-brand-ink">{org.name}</span>
                  <span className="text-xs text-brand-ink/50">{org.id}</span>
                </div>
                <input
                  type="text"
                  name="reason"
                  placeholder="Reason (optional, logged)"
                  className="w-full rounded-lg border border-brand-ink/15 bg-canvas px-3 py-2 text-sm text-brand-ink"
                />
                <button
                  type="submit"
                  className="self-start rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white active:bg-brand-ink"
                >
                  View as {org.name}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
