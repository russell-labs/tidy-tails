import type { Metadata } from "next";
import { signOut } from "@/lib/actions/auth";
import { saveOperatorSettings } from "@/lib/actions/settings";
import { LAPSED_THRESHOLD_OPTIONS } from "@/lib/operatorSettings";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

// Reads the signed-in operator's identity per request — never prerender or
// cache it. (The session check also makes this route inherently dynamic.)
export const dynamic = "force-dynamic";

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
  const settings = await readOperatorSettings();

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

      <section className="mt-4">
        <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Reminders
        </h2>
        <form
          action={saveOperatorSettings}
          className="rounded-xl border border-line bg-surface px-3.5 py-3"
        >
          <p className="text-xs leading-relaxed text-ink-soft">
            The app prepares drafts only. Sam still reviews and confirms every
            message before anything sends.
          </p>

          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Appointment reminder
            </span>
            <textarea
              name="appointmentReminderTemplate"
              rows={4}
              defaultValue={settings.appointmentReminderTemplate}
              className="w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm leading-relaxed text-ink"
            />
          </label>

          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">
              Rebook follow-up
            </span>
            <textarea
              name="rebookReminderTemplate"
              rows={4}
              defaultValue={settings.rebookReminderTemplate}
              className="w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm leading-relaxed text-ink"
            />
          </label>

          <fieldset className="mt-3">
            <legend className="text-sm font-semibold text-ink">
              Lapsed-client threshold
            </legend>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {LAPSED_THRESHOLD_OPTIONS.map((days) => (
                <label
                  key={days}
                  className="has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-white rounded-lg border border-line bg-canvas px-2 py-2 text-center text-xs font-semibold text-ink-soft"
                >
                  <input
                    type="radio"
                    name="lapsedThresholdDays"
                    value={days}
                    defaultChecked={settings.lapsedThresholdDays === days}
                    className="sr-only"
                  />
                  {days}d
                </label>
              ))}
            </div>
          </fieldset>

          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            Placeholders: [first name], [pet name], [date], [time]. Reports use
            this threshold by default.
          </p>

          <button
            type="submit"
            className="mt-3 w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white active:bg-brand-ink"
          >
            Save reminder settings
          </button>
        </form>
      </section>

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
