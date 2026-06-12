import { auditEventLabel, type AuditEvent } from "./audit";
import { formatDate, formatPhone } from "./format";
import {
  classifyInboundSmsBody,
  type InboundSmsBodyClass,
  type SmsMessage,
} from "./inboundSms";

export type BookingRequestInboxRow = {
  id: string;
  client_id: string | null;
  pet_id: string | null;
  requested_date: string;
  requested_time_slot: string | null;
  preferred_location: string | null;
  service_type: string | null;
  client_message: string | null;
  status: string;
  created_at: string;
};

export type InboxItemKind = "sms" | "booking_request" | "activity";
export type InboxPriority = "action" | "info" | "log";

export type InboxItem = {
  id: string;
  sourceId: string;
  kind: InboxItemKind;
  priority: InboxPriority;
  badge: string;
  title: string;
  body: string;
  createdAt: string;
  clientId: string | null;
  petId: string | null;
  href: string | null;
};

export type SmsThread = {
  key: string;
  latestMessageId: string;
  latestBody: string;
  latestDirection: string;
  latestAt: string;
  clientId: string | null;
  phone: string;
  messageCount: number;
  actionCount: number;
  href: string | null;
};

export function buildInboxItems({
  smsMessages,
  bookingRequests,
  auditEvents,
  handledSmsIds = new Set<string>(),
}: {
  smsMessages: SmsMessage[];
  bookingRequests: BookingRequestInboxRow[];
  auditEvents: AuditEvent[];
  handledSmsIds?: Set<string>;
}): InboxItem[] {
  return [
    ...smsMessages
      .filter((message) => message.status !== "hidden")
      .map((message) => smsToInboxItem(message, handledSmsIds)),
    ...bookingRequests.map(bookingRequestToInboxItem),
    ...auditEvents.map(auditToInboxItem),
  ].sort(compareInboxItems);
}

export function buildSmsThreads(
  smsMessages: SmsMessage[],
  handledSmsIds = new Set<string>(),
): SmsThread[] {
  const threads = new Map<string, SmsMessage[]>();
  for (const message of smsMessages) {
    if (message.status === "hidden") continue;
    const key = smsThreadKey(message);
    threads.set(key, [...(threads.get(key) ?? []), message]);
  }

  return Array.from(threads.entries())
    .map(([key, messages]) => {
      const sorted = [...messages].sort((a, b) => Date.parse(smsCreatedAt(b)) - Date.parse(smsCreatedAt(a)));
      const latest = sorted[0];
      return {
        key,
        latestMessageId: latest.id,
        latestBody: latest.body,
        latestDirection: latest.direction,
        latestAt: smsCreatedAt(latest),
        clientId: latest.client_id,
        phone: latest.direction === "inbound" ? latest.from_phone : latest.to_phone,
        messageCount: sorted.length,
        actionCount: sorted.filter((message) => smsNeedsAction(message, handledSmsIds)).length,
        href: smsThreadHref(key),
      };
    })
    .sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));
}

export function inboxCounts(items: InboxItem[]) {
  return {
    needsAction: items.filter((item) => item.priority === "action").length,
    smsReplies: items.filter(
      (item) => item.kind === "sms" && !item.id.includes(":outbound:"),
    ).length,
    bookingRequests: items.filter((item) => item.kind === "booking_request").length,
  };
}

// TT-018 — the per-message "seen" signal. Mirrors handledSmsIdsFromAudit but for
// `sms.seen` events emitted when a thread is opened. Decoupled from "handled" so
// merely opening a message clears the header bell without touching the inbox
// list's needs-action state.
export function seenSmsIdsFromAudit(events: AuditEvent[]): Set<string> {
  return new Set(
    events
      .filter((event) => event.event_type === "sms.seen")
      .map((event) => event.metadata?.smsMessageId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
}

// The header bell's needs-action count: like inboxCounts(...).needsAction, but a
// needs-action SMS that has been opened (seen) no longer lights the bell. The
// inbox LIST still counts it (via inboxCounts) so unreplied messages stay
// findable. Seen is SMS-only; booking-request actions are unaffected.
export function bellNeedsActionCount(
  items: InboxItem[],
  seenSmsIds: Set<string>,
): number {
  return items.filter(
    (item) =>
      item.priority === "action" &&
      !(item.kind === "sms" && seenSmsIds.has(item.sourceId)),
  ).length;
}

// The inbound, non-hidden message ids that belong to a thread — used on thread
// open to emit `sms.seen` for exactly those messages.
export function inboundSmsIdsForThread(
  messages: SmsMessage[],
  threadKey: string,
): string[] {
  return messages
    .filter(
      (message) =>
        message.status !== "hidden" &&
        message.direction === "inbound" &&
        smsThreadKey(message) === threadKey,
    )
    .map((message) => message.id);
}

export function smsActionLabel(message: SmsMessage): string {
  if (message.status === "handled") return "Handled";
  if (message.direction !== "inbound") return "Sent";
  if (message.match_status === "unmatched") return "Unmatched reply";
  if (message.match_status === "ambiguous") return "Needs matching";

  const bodyClass = classifyInboundSmsBody(message.body);
  const labels: Record<InboundSmsBodyClass, string> = {
    confirmed: "Confirmed",
    thanks: "Thanks",
    needs_follow_up: "Needs follow-up",
    needs_reply: "Needs reply",
    received: "Reply",
  };
  return labels[bodyClass];
}

function smsToInboxItem(message: SmsMessage, handledSmsIds: Set<string>): InboxItem {
  const inbound = message.direction === "inbound";
  const handled = message.status === "handled" || handledSmsIds.has(message.id);
  const needsAction = smsNeedsAction(message, handledSmsIds);
  const createdAt = smsCreatedAt(message);
  const from = formatPhone(message.from_phone);

  return {
    id: `sms:${inbound ? "inbound" : "outbound"}:${message.id}`,
    sourceId: message.id,
    kind: "sms",
    priority: needsAction ? "action" : inbound ? "info" : "log",
    badge: handled ? "Handled" : smsActionLabel(message),
    title: inbound ? `Text from ${from}` : "Text sent",
    body: message.body,
    createdAt,
    clientId: message.client_id,
    petId: null,
    href: smsThreadHref(smsThreadKey(message)),
  };
}

function smsNeedsAction(message: SmsMessage, handledSmsIds: Set<string>): boolean {
  if (message.status === "hidden") return false;
  const inbound = message.direction === "inbound";
  const handled = message.status === "handled" || handledSmsIds.has(message.id);
  const unmatched = message.match_status === "unmatched" || message.match_status === "ambiguous";
  const bodyClass = inbound ? classifyInboundSmsBody(message.body) : null;
  return (
    !handled &&
    inbound &&
    (unmatched || bodyClass === "needs_follow_up" || bodyClass === "needs_reply")
  );
}

function smsCreatedAt(message: SmsMessage): string {
  return message.received_at ?? message.sent_at ?? message.created_at;
}

function smsThreadKey(message: SmsMessage): string {
  if (message.client_id) return `client:${message.client_id}`;
  const phone = message.direction === "inbound" ? message.from_phone : message.to_phone;
  return `phone:${phone}`;
}

export function smsThreadHref(threadKey: string): string {
  return `/inbox/${encodeURIComponent(threadKey)}`;
}

function bookingRequestToInboxItem(request: BookingRequestInboxRow): InboxItem {
  const status = request.status || "pending";
  const actionStatus = status === "pending" || status === "rescheduled";
  const date = request.requested_date ? formatDate(request.requested_date) : "No date";
  const time = request.requested_time_slot ? ` · ${request.requested_time_slot}` : "";
  const service = serviceLabel(request.service_type);
  const message = request.client_message ? ` · ${request.client_message}` : "";

  return {
    id: `booking-request:${request.id}`,
    sourceId: request.id,
    kind: "booking_request",
    priority: actionStatus ? "action" : "info",
    badge: status === "pending" ? "Request" : status,
    title: "Booking request",
    body: `${date}${time}${service ? ` · ${service}` : ""}${message}`,
    createdAt: request.created_at,
    clientId: request.client_id,
    petId: request.pet_id,
    href: request.client_id ? `/clients/${request.client_id}` : null,
  };
}

function auditToInboxItem(event: AuditEvent): InboxItem {
  return {
    id: `activity:${event.id}`,
    sourceId: event.id,
    kind: "activity",
    priority: "log",
    badge: auditEventLabel(event.event_type),
    title: auditEventLabel(event.event_type),
    body: event.summary,
    createdAt: event.created_at,
    clientId: event.client_id,
    petId: event.pet_id,
    href: event.client_id ? `/clients/${event.client_id}` : null,
  };
}

function compareInboxItems(a: InboxItem, b: InboxItem): number {
  const priority = priorityRank(a.priority) - priorityRank(b.priority);
  if (priority !== 0) return priority;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function priorityRank(priority: InboxPriority): number {
  if (priority === "action") return 0;
  if (priority === "info") return 1;
  return 2;
}

function serviceLabel(service: string | null): string | null {
  if (service === "full_groom") return "Full groom";
  if (service === "puppy_groom") return "Puppy groom";
  if (service === "bath_only") return "Bath only";
  if (service === "nail_trim") return "Nail trim";
  if (service === "other") return "Other";
  return null;
}
