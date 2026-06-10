import type { Metadata } from "next";
import Link from "next/link";
import { InboxMessageCenter } from "@/components/InboxMessageCenter";
import { InboxSmsActions } from "@/components/InboxSmsActions";
import type { AuditEvent } from "@/lib/audit";
import { loadRecentAuditEvents } from "@/lib/audit.server";
import { AddHousehold } from "@/components/AddHousehold";
import { FirstRunEmptyState } from "@/components/FirstRunEmptyState";
import { loadRecentBookingRequests } from "@/lib/bookingRequests.server";
import { dataMode, loadDataset } from "@/lib/data/repo";
import { fullName } from "@/lib/format";
import {
  buildInboxItems,
  buildSmsThreads,
  inboxCounts,
  type InboxItem,
} from "@/lib/inbox";
import {
  buildFirstPlatformSentClientIds,
  isExistingHouseholdForPlatformIntro,
} from "@/lib/messageCenterTemplates";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import { loadRecentSmsMessages } from "@/lib/smsMessages.server";

export const metadata: Metadata = { title: "Messages" };

export default async function InboxPage() {
  const [smsMessages, bookingRequests, auditEvents, dataset, operatorSettings, orgSettings] = await Promise.all([
    loadRecentSmsMessages(100),
    loadRecentBookingRequests(25),
    loadRecentAuditEvents(1000),
    loadDataset(),
    readOperatorSettings(),
    loadOrgSettings(),
  ]);
  const { clients, pets, appointments } = dataset;

  // Brand-new business: no clients and no messages yet. Show a friendly first
  // screen pointing to adding the first client, rather than three zero counters
  // and an empty thread list (WS3 Slice C). Gated on zero messages too, so a
  // stray inbound text from an unknown number is never hidden behind this.
  if (clients.length === 0 && smsMessages.length === 0) {
    return (
      <main className="min-h-full px-5 py-8">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-ink">Messages</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Customer replies and booking requests will show up here.
          </p>
        </div>
        <FirstRunEmptyState
          title="No messages yet"
          description="Once you add clients and start texting booking confirmations and reminders, their replies and requests land here."
          action={<AddHousehold mode={dataMode()} />}
        />
      </main>
    );
  }

  const petsByClientId = groupByClientId(pets);
  const appointmentsByClientId = groupByClientId(appointments);
  const firstPlatformSentClientIds = buildFirstPlatformSentClientIds(auditEvents);

  const clientsById = new Map(
    clients.map((client) => [client.id, fullName(client.first_name, client.last_name)]),
  );
  const items = buildInboxItems({
    smsMessages,
    bookingRequests,
    auditEvents,
    handledSmsIds: handledSmsIdsFromAudit(auditEvents),
  });
  const smsThreads = buildSmsThreads(
    smsMessages,
    handledSmsIdsFromAudit(auditEvents),
  );
  const counts = inboxCounts(items);
  const needsAction = items.filter((item) => item.priority === "action");

  return (
    <main className="min-h-full px-5 py-8">
      <div className="mb-8">
        <div>
          <h1 className="text-xl font-bold text-ink">Messages</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Customer replies and booking requests that may need your attention.
          </p>
        </div>
      </div>

      <section className="mb-8 grid grid-cols-3 gap-2">
        <MetricCard label="Needs action" value={counts.needsAction} tone="action" />
        <MetricCard label="SMS replies" value={counts.smsReplies} />
        <MetricCard label="Requests" value={counts.bookingRequests} />
      </section>

      <InboxMessageCenter
        threads={smsThreads}
        messages={smsMessages}
        settings={operatorSettings}
        operatorName={orgSettings.operatorName}
        clients={clients.map((client) => ({
          id: client.id,
          first_name: client.first_name,
          last_name: client.last_name,
          phone: client.phone,
          created_at: client.created_at,
          pets: petsByClientId.get(client.id) ?? [],
          appointments: appointmentsByClientId.get(client.id) ?? [],
          isExistingHousehold: isExistingHouseholdForPlatformIntro(
            client,
            appointmentsByClientId.get(client.id) ?? [],
          ),
          firstPlatformAlreadySent: firstPlatformSentClientIds.has(client.id),
        }))}
      />

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

      <p className="text-xs leading-relaxed text-ink-faint">
        The full operational audit log lives in Settings.
      </p>
    </main>
  );
}

function groupByClientId<T extends { client_id: string }>(items: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    grouped.set(item.client_id, [...(grouped.get(item.client_id) ?? []), item]);
  }
  return grouped;
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
          Open thread
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
