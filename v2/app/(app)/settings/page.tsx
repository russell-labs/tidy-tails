import type { Metadata } from "next";
import { signOut } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

// Reads the signed-in operator's identity per request — never prerender or
// cache it. (The session check also makes this route inherently dynamic.)
export const dynamic = "force-dynamic";

const APPOINTMENT_TEMPLATE =
  "Hi [first name], reminder that [pet name] is booked with Tidy Tails on [date] at [time]. See you soon! — Samantha";
const REBOOK_TEMPLATE =
  "Hi [first name], it's been a little while since [pet name]'s last visit. Would you like to book in for a groom? — Samantha";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5 text-sm last:border-b-0">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <main className="px-4 py-5">
      <h1 className="text-xl font-bold text-ink">Settings</h1>

      <Card title="Account">
        <Row label="Signed in as" value={user?.email ?? "—"} />
      </Card>

      <Card title="Business">
        <Row label="Business name" value="Tidy Tails" />
        <Row label="Reminder sender" value="Samantha" />
      </Card>

      <Card title="Reminders">
        <div className="border-b border-line px-3.5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Appointment reminder
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            {APPOINTMENT_TEMPLATE}
          </p>
        </div>
        <div className="border-b border-line px-3.5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Rebook follow-up
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{REBOOK_TEMPLATE}</p>
        </div>
        <Row label="Default lapsed threshold" value="90 days" />
        <div className="px-3.5 py-3 text-xs leading-relaxed text-ink-soft">
          Reminder sending is always manual: the app prepares a draft, and Sam
          confirms each text before it sends. Editing templates and saving a
          default threshold are next-step settings.
        </div>
      </Card>

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base font-semibold text-danger-ink"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
