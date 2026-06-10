import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InboxMessageCenter } from "@/components/InboxMessageCenter";
import { loadRecentAuditEvents } from "@/lib/audit.server";
import { loadDataset } from "@/lib/data/repo";
import { buildSmsThreads } from "@/lib/inbox";
import {
  buildFirstPlatformSentClientIds,
  isExistingHouseholdForPlatformIntro,
} from "@/lib/messageCenterTemplates";
import { readOperatorSettings } from "@/lib/operatorSettings.server";
import { loadOrgSettings } from "@/lib/orgSettings.server";
import { loadRecentSmsMessages } from "@/lib/smsMessages.server";

export const metadata: Metadata = { title: "Message thread" };

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ threadKey: string }>;
}) {
  const { threadKey: encodedThreadKey } = await params;
  const threadKey = decodeURIComponent(encodedThreadKey);
  const [smsMessages, auditEvents, dataset, operatorSettings, orgSettings] = await Promise.all([
    loadRecentSmsMessages(100),
    loadRecentAuditEvents(1000),
    loadDataset(),
    readOperatorSettings(),
    loadOrgSettings(),
  ]);

  const { clients, pets, appointments } = dataset;
  const petsByClientId = groupByClientId(pets);
  const appointmentsByClientId = groupByClientId(appointments);
  const firstPlatformSentClientIds = buildFirstPlatformSentClientIds(auditEvents);
  const smsThreads = buildSmsThreads(smsMessages, handledSmsIdsFromAudit(auditEvents));

  if (!smsThreads.some((thread) => thread.key === threadKey)) notFound();

  return (
    <main className="min-h-full px-5 py-6">
      <InboxMessageCenter
        standalone
        activeThreadKey={threadKey}
        threads={smsThreads}
        messages={smsMessages}
        operatorName={orgSettings.operatorName}
        settings={operatorSettings}
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

function handledSmsIdsFromAudit(auditEvents: { event_type: string; metadata: Record<string, unknown> }[]): Set<string> {
  return new Set(
    auditEvents
      .filter(
        (event) =>
          event.event_type === "sms.handled" ||
          event.event_type === "sms.sent",
      )
      .map((event) => event.metadata.smsMessageId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
}
