import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { disconnectGoogleCalendarAction } from "@/lib/actions/googleCalendar";
import { LocationSettingsForm } from "@/components/LocationSettingsForm";
import { MessageDraftSettingsForm } from "@/components/MessageDraftSettingsForm";
import { ScheduleCalibrationForm } from "@/components/ScheduleCalibrationForm";
import { SmsMessages } from "@/components/SmsMessages";
import {
  auditEventLabel,
  auditEventTone,
  type AuditEvent,
} from "@/lib/audit";
import { loadRecentAuditEvents } from "@/lib/audit.server";
import { readGoogleCalendarConnection } from "@/lib/googleCalendar.server";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import { readSmsReadiness, type SmsReadiness } from "@/lib/smsReadiness";
import { loadRecentSmsMessages } from "@/lib/smsMessages.server";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

// Reads the signed-in operator's identity per request — never prerender or
// cache it. (The session check also makes this route inherently dynamic.)
export const dynamic = "force-dynamic";

function Card({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </h2>
      {eyebrow ? (
        <p className="mb-2 text-xs leading-relaxed text-ink-soft">{eyebrow}</p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

function CollapsibleCard({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4">
      <details className="group overflow-hidden rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-ink-soft">{summary}</p>
          </div>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-soft transition group-open:rotate-180"
            aria-hidden="true"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </summary>
        <div className="border-t border-line">{children}</div>
      </details>
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

function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ready" | "warn";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "ready"
      ? "bg-brand-soft text-brand-ink"
      : tone === "warn"
        ? "bg-warn-soft text-warn"
        : "bg-canvas text-ink-soft";
  return (
    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function StatusRow({
  label,
  ready,
}: {
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2.5 text-sm last:border-b-0">
      <span className="text-ink-soft">{label}</span>
      <span
        className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
          ready ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
        }`}
      >
        {ready ? "Ready" : "Needs setup"}
      </span>
    </div>
  );
}

function SmsReadinessPanel({ readiness }: { readiness: SmsReadiness }) {
  return (
    <div>
      <div className="border-b border-line px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Two-way texting</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              You can send texts from household conversations after outbound
              SMS is ready. Customer replies appear in Inbox after inbound
              persistence and the Twilio webhook are connected.
            </p>
          </div>
          <Pill tone={readiness.ready ? "ready" : "warn"}>
            {readiness.ready ? "Ready" : "Setup"}
          </Pill>
        </div>
      </div>
      <StatusRow label="Outbound SMS" ready={readiness.outboundConfigured} />
      <StatusRow
        label="Inbound signature"
        ready={readiness.inboundSignatureConfigured}
      />
      <StatusRow
        label="Webhook database writes"
        ready={readiness.inboundPersistenceConfigured}
      />
      <div className="px-3.5 py-2.5 text-sm">
        <p className="text-ink-soft">Twilio webhook URL</p>
        <p className="mt-1 break-all font-medium text-ink">{readiness.webhookUrl}</p>
      </div>
    </div>
  );
}

function SettingsLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-3 text-sm last:border-b-0 active:bg-canvas"
    >
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
          {description}
        </span>
      </span>
      <span className="text-lg font-semibold text-brand" aria-hidden="true">
        &rarr;
      </span>
    </Link>
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
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function ActivityRow({ event }: { event: AuditEvent }) {
  const tone = auditEventTone(event.event_type);
  return (
    <li className="border-b border-line last:border-b-0">
      <details className="group px-3.5 py-3">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
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
        </summary>
        <div className="mt-3 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-ink-soft">
          <p>
            <span className="font-semibold text-ink">Type:</span>{" "}
            {event.event_type}
          </p>
          {event.client_id ? (
            <p>
              <span className="font-semibold text-ink">Client:</span>{" "}
              {event.client_id}
            </p>
          ) : null}
          {event.pet_id ? (
            <p>
              <span className="font-semibold text-ink">Pet:</span>{" "}
              {event.pet_id}
            </p>
          ) : null}
          {Object.keys(event.metadata ?? {}).length > 0 ? (
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-ink-faint">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          ) : null}
        </div>
      </details>
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
  const orgSettings = await loadOrgSettings();
  const calendar = await readGoogleCalendarConnection();
  const recentActivity = await loadRecentAuditEvents(12);
  const recentSmsMessages = await loadRecentSmsMessages(3);
  const smsReadiness = readSmsReadiness();
  const params = searchParams ? await searchParams : {};

  return (
    <main className="px-4 py-5">
      <h1 className="text-xl font-bold text-ink">Settings</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Salon locations, schedule calibration, message templates, and account controls.
      </p>

      <CollapsibleCard
        title="Salon locations"
        summary="Addresses and payout percentages for gross/net schedule money"
      >
        <div className="border-b border-line px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Location money</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                These addresses feed booking copy. Schedule money uses the
                salon-keeps percentage to show your net.
              </p>
            </div>
            <Pill tone="ready">Active</Pill>
          </div>
        </div>
        <LocationSettingsForm settings={settings.locationSettings} />
      </CollapsibleCard>

      <CollapsibleCard
        title="Scheduling rules"
        summary="Day-fit scoring and workload calibration"
      >
        <div className="border-b border-line px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                Schedule calibration
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Groomer limits, large-dog tolerance, coat/style weight, behavior
                weight, and warning wording.
              </p>
            </div>
            <Pill tone="ready">Active</Pill>
          </div>
        </div>
        <ScheduleCalibrationForm calibration={settings.scheduleCalibration} />
      </CollapsibleCard>

      <section className="mt-4" id="message-templates">
        <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Message templates
        </h2>
        <MessageDraftSettingsForm settings={settings} />
      </section>

      <Card
        title="Texting"
        eyebrow="Connection status for outbound texts and customer replies."
      >
        <SmsReadinessPanel readiness={smsReadiness} />
      </Card>

      <Card
        title="Calendar"
        eyebrow="Connect Google Calendar for booking events and busy-time checks."
      >
        <div className="px-3.5 py-3">
          {params.calendar === "connected" ? (
            <p className="mb-2 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
              Google Calendar connected.
            </p>
          ) : null}
          {params.calendar === "disconnected" ? (
            <p className="mb-2 rounded-lg bg-brand-soft px-3 py-2 text-xs font-medium text-brand-ink">
              Google Calendar disconnected. Connect again to refresh access.
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
                New bookings can create calendar events after you connect your
                Google account. The booking still saves if Google is unavailable.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                Availability follows Google Calendar&apos;s own setting: Busy events
                block drop-off slots, and Free events stay open. All-day notes are
                ignored for grooming availability.
              </p>
            </div>
            <Pill tone={calendar.enabled ? "ready" : "neutral"}>
              {calendar.enabled ? "Sync on" : "Sync off"}
            </Pill>
          </div>

          {!calendar.configured ? (
            <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs font-medium text-warn">
              Google OAuth is not configured on this deployment yet.
            </p>
          ) : calendar.connection ? (
            <div className="mt-3 flex flex-col gap-2">
              <Row label="Connected as" value={calendar.connection.google_email} />
              <a
                href="/settings/google/connect"
                className="block rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-white active:bg-brand-ink"
              >
                Reconnect Google Calendar
              </a>
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

      <Card title="Business tools">
        <SettingsLink
          href="/reports"
          title="Reports and exports"
          description="Revenue, lapsed clients, and bookkeeper-ready exports."
        />
      </Card>

      <CollapsibleCard
        title="Advanced"
        summary="Recent SMS replies and activity log"
      >
        <div className="border-b border-line px-3.5 py-3">
          <p className="text-sm font-semibold text-ink">Recent SMS replies</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Inbox is the main place to handle replies. This preview is here for
            troubleshooting only.
          </p>
        </div>
        <SmsMessages
          messages={recentSmsMessages}
          emptyText="No SMS replies have been recorded yet."
          framed={false}
        />
        <div className="border-y border-line px-3.5 py-3">
          <p className="text-sm font-semibold text-ink">Activity log</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Recent bookings, edits, exports, calendar changes, and sent messages.
          </p>
        </div>
        {recentActivity.length > 0 ? (
          <ul>
            {recentActivity.map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </ul>
        ) : (
          <p className="px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
            No activity has been recorded yet.
          </p>
        )}
      </CollapsibleCard>

      <Card title="Account">
        <Row label="Signed in as" value={user?.email ?? "—"} />
        <Row label="Business name" value="Tidy Tails" />
        <Row
          label="Reminder sender"
          value={orgSettings.operatorName || "Not set"}
        />
      </Card>

      <SignOutButton />
    </main>
  );
}
