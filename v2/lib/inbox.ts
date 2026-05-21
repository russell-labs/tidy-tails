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

export function buildInboxItems({
  smsMessages,
  bookingRequests,
  auditEvents,
}: {
  smsMessages: SmsMessage[];
  bookingRequests: BookingRequestInboxRow[];
  auditEvents: AuditEvent[];
}): InboxItem[] {
  return [
    ...smsMessages.map(smsToInboxItem),
    ...bookingRequests.map(bookingRequestToInboxItem),
    ...auditEvents.map(auditToInboxItem),
  ].sort(compareInboxItems);
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

export function smsActionLabel(message: SmsMessage): string {
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

function smsToInboxItem(message: SmsMessage): InboxItem {
  const inbound = message.direction === "inbound";
  const unmatched = message.match_status === "unmatched" || message.match_status === "ambiguous";
  const bodyClass = inbound ? classifyInboundSmsBody(message.body) : null;
  const needsAction =
    inbound &&
    (unmatched || bodyClass === "needs_follow_up" || bodyClass === "needs_reply");
  const createdAt = message.received_at ?? message.sent_at ?? message.created_at;
  const from = formatPhone(message.from_phone);

  return {
    id: `sms:${inbound ? "inbound" : "outbound"}:${message.id}`,
    kind: "sms",
    priority: needsAction ? "action" : inbound ? "info" : "log",
    badge: smsActionLabel(message),
    title: inbound ? `Text from ${from}` : "Text sent",
    body: message.body,
    createdAt,
    clientId: message.client_id,
    petId: null,
    href: message.client_id ? `/clients/${message.client_id}` : null,
  };
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
  if (service === "bath_only") return "Bath only";
  if (service === "nail_trim") return "Nail trim";
  if (service === "other") return "Other";
  return null;
}
