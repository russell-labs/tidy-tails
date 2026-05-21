import type { Metadata } from "next";
import Link from "next/link";
import { InboxSmsActions } from "@/components/InboxSmsActions";
import { auditEventLabel, auditEventTone, type AuditEvent } from "@/lib/audit";
import { loadRecentAuditEvents } from "@/lib/audit.server";
import { loadRecentBookingRequests } from "@/lib/bookingRequests.server";
import { loadClients } from "@/lib/data/repo";
import { fullName } from "@/lib/format";
import { buildInboxItems, inboxCounts, type InboxItem } from "@/lib/inbox";
import { loadRecentSmsMessages } from "@/lib/smsMessages.server";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const [smsMessages, bookingRequests, auditEvents, clients] = await Promise.all([
    loadRecentSmsMessages(30),
    loadRecentBookingRequests(25),
    loadRecentAuditEvents(100),
    loadClients(),
  ]);

  const clientsById = new Map(
    clients.map((client) => [client.id, fullName(client.first_name, client.last_name)]),
  );
  const items = buildInboxItems({
    smsMessages,
    bookingRequests,
    auditEvents,
    handledSmsIds: handledSmsIdsFromAudit(auditEvents),
  });
  const counts = inboxCounts(items);
  const needsAction = items.filter((item) => item.priority === "action");
  const recentMessages = items.filter((item) => item.kind === "sms").slice(0, 12);
  const recentActivity = auditEvents.slice(0, 12);

  return (
    <main className="min-h-full px-5 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Inbox</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Replies, booking requests, and activity that may need Sam&apos;s attention.
          </p>
        </div>
        <Link
          href="/settings"
          className="shrink-0 rounded-xl border border-brand px-4 py-2 text-sm font-semibold text-brand"
        >
          Settings
        </Link>
      </div>

      <section className="mb-8 grid grid-cols-3 gap-2">
        <MetricCard label="Needs action" value={counts.needsAction} tone="action" />
        <MetricCard label="SMS replies" value={counts.smsReplies} />
        <MetricCard label="Requests" value={counts.bookingRequests} />
      </section>

      <section className="mb-8">
        <SectionHeader title="Needs action" detail={needsAction.length ? "Oldest items stay visible until handled." : "Nothing waiting right now."} />
        <div className="mt-3 space-y-3">
          {needsAction.length ? (
            needsAction.map((item) => (
              <InboxCard key={item.id} item={item} clientName={clientName(item, clientsById)} />
            ))
          ) : (
            <EmptyState text="No customer replies or requests need action." />
          )}
        </div>
      </section>

      <section className="mb-8">
        <SectionHeader title="Text message replies" detail="Latest inbound and sent messages." />
        <div className="mt-3 space-y-3">
          {recentMessages.length ? (
            recentMessages.map((item) => (
              <InboxCard key={item.id} item={item} clientName={clientName(item, clientsById)} />
            ))
          ) : (
            <EmptyState text="No text message replies have been captured yet." />
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="Recent activity" detail="Operational audit trail." />
        <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
          {recentActivity.length ? (
            recentActivity.map((event) => (
              <ActivityRow key={event.id} event={event} clientName={event.client_id ? clientsById.get(event.client_id) : null} />
            ))
          ) : (
            <EmptyState text="No activity logged yet." />
          )}
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "action" | "neutral";
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 text-center shadow-soft">
      <div className={`text-lg font-bold ${tone === "action" && value ? "text-warn" : "text-ink"}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </div>
    </div>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{detail}</p>
    </div>
  );
}

function InboxCard({ item, clientName }: { item: InboxItem; clientName: string }) {
  const showSmsActions = item.kind === "sms" && item.priority === "action";
  const card = (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{item.title}</p>
          <p className="mt-1 text-xs text-ink-muted">{clientName}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(item.priority)}`}>
          {item.badge}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.body}</p>
      <p className="mt-3 text-xs text-ink-faint">{formatDateTime(item.createdAt)}</p>
      {showSmsActions ? <InboxSmsActions smsId={item.sourceId} /> : null}
      {item.href && showSmsActions ? (
        <Link
          href={item.href}
          className="mt-3 inline-flex text-sm font-bold text-brand"
        >
          Open household
        </Link>
      ) : null}
    </article>
  );

  if (showSmsActions) return card;
  if (!item.href) return card;
  return (
    <Link href={item.href} className="block">
      {card}
    </Link>
  );
}

function ActivityRow({
  event,
  clientName,
}: {
  event: AuditEvent;
  clientName: string | null | undefined;
}) {
  return (
    <div className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{auditEventLabel(event.event_type)}</p>
          <p className="mt-1 text-sm text-ink-muted">{event.summary}</p>
          {clientName ? <p className="mt-1 text-xs text-ink-faint">{clientName}</p> : null}
        </div>
        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${toneClass(event.event_type)}`}>
          {formatDateTime(event.created_at)}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-ink-muted shadow-soft">
      {text}
    </div>
  );
}

function clientName(item: InboxItem, clientsById: Map<string, string>): string {
  if (!item.clientId) return item.kind === "sms" ? "No household match" : "No household linked";
  return clientsById.get(item.clientId) ?? "Household linked";
}

function badgeClass(priority: InboxItem["priority"]): string {
  if (priority === "action") return "bg-canvas text-warn";
  if (priority === "info") return "bg-brand-soft text-brand";
  return "bg-canvas text-ink-muted";
}

function toneClass(type: string): string {
  const tone = auditEventTone(type);
  if (tone === "warn") return "bg-canvas text-warn";
  if (tone === "write") return "bg-brand-soft text-brand";
  return "bg-canvas text-ink-muted";
}

function formatDateTime(iso: string): string {
  if (!iso) return "Unknown time";
  return new Date(iso).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function handledSmsIdsFromAudit(events: AuditEvent[]): Set<string> {
  return new Set(
    events
      .filter(
        (event) =>
          event.event_type === "sms.handled" ||
          event.event_type === "sms.sent",
      )
      .map((event) => event.metadata.smsMessageId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
}
