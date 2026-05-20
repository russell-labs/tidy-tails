import type { Metadata } from "next";
import { signOut } from "@/lib/actions/auth";
import { disconnectGoogleCalendarAction } from "@/lib/actions/googleCalendar";
import { saveOperatorSettings } from "@/lib/actions/settings";
import { SmsMessages } from "@/components/SmsMessages";
import {
  auditEventLabel,
  auditEventTone,
  type AuditEvent,
} from "@/lib/audit";
import { loadRecentAuditEvents } from "@/lib/audit.server";
import { readGoogleCalendarConnection } from "@/lib/googleCalendar.server";
import { LAPSED_THRESHOLD_OPTIONS } from "@/lib/operatorSettings";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { loadRecentSmsMessages } from "@/lib/smsMessages.server";
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

const ACTIVITY_TONE_CLASSES = {
  neutral: "bg-canvas text-ink-soft",
  read: "bg-canvas text-ink-soft",
  warn: "bg-warn-soft text-warn",
  write: "bg-brand-soft text-brand-ink",
};

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function ActivityRow({ event }: { event: AuditEvent }) {
  const tone = auditEventTone(event.event_type);
  return (
    <li className="border-b border-line px-3.5 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {auditEventLabel(event.event_type)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {event.summary}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${ACTIVITY_TONE_CLASSES[tone]}`}
        >
          {formatActivityTime(event.created_at)}
        </span>
      </div>
    </li>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ calendar?: string; message?: string }>;
}) {
  const user = await getCurrentUser();
  const settings = await readOperatorSettings();
  const calendar = await readGoogleCalendarConnection();
  const recentActivity = await loadRecentAuditEvents(12);
  const recentSmsMessages = await loadRecentSmsMessages(8);
  const params = searchParams ? await searchParams : {};

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

      <Card title="Activity">
        {recentActivity.length > 0 ? (
          <ul>
            {recentActivity.map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </ul>
        ) : (
          <p className="px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
            No activity has been recorded yet. Once the audit table is applied,
            bookings, edits, exports, calendar changes, and sent reminders will
            appear here.
          </p>
        )}
      </Card>

      <Card title="Text message replies">
        <SmsMessages
          messages={recentSmsMessages}
          emptyText="No SMS replies have been recorded yet. Replies to Sam's Twilio number will appear here once inbound SMS is connected."
          framed={false}
        />
      </Card>

      <Card title="Calendar">
        <div className="px-3.5 py-3">
          {params.calendar === "connected" ? (
            <p className="mb-2 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
              Google Calendar connected.
            </p>
          ) : null}
          {params.calendar === "error" ? (
            <p className="mb-2 rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
              {params.message ?? "Google Calendar could not be connected."}
            </p>
          ) : null}

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                Google Calendar
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                New bookings can create calendar events after Sam connects her
                Google account. The booking still saves if Google is unavailable.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                Availability follows Google Calendar&apos;s own setting: Busy events
                block drop-off slots, and Free events stay open. All-day notes are
                ignored for grooming availability.
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                calendar.enabled
                  ? "bg-brand-soft text-brand-ink"
                  : "bg-canvas text-ink-soft"
              }`}
            >
              {calendar.enabled ? "Sync on" : "Sync off"}
            </span>
          </div>

          {!calendar.configured ? (
            <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
              Google OAuth is not configured on this deployment yet.
            </p>
          ) : calendar.connection ? (
            <div className="mt-3 flex flex-col gap-2">
              <Row label="Connected as" value={calendar.connection.google_email} />
              <form action={disconnectGoogleCalendarAction}>
                <button
                  type="submit"
                  className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm font-semibold text-ink-soft active:bg-surface"
                >
                  Disconnect Google Calendar
                </button>
              </form>
            </div>
          ) : (
            <a
              href="/settings/google/connect"
              className="mt-3 block rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-white active:bg-brand-ink"
            >
              Connect Google Calendar
            </a>
          )}
        </div>
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
