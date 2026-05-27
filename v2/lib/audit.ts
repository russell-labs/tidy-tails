import type { Row } from "@/lib/data/live";

export type AuditEventType =
  | "auth.signed_in"
  | "auth.signed_out"
  | "client.viewed"
  | "pet.viewed"
  | "client.created"
  | "client.updated"
  | "pet.created"
  | "pet.updated"
  | "pet.merged"
  | "pet.passed_away"
  | "pet.deleted"
  | "pet.moved"
  | "appointment.created"
  | "appointment.group_created"
  | "appointment.updated"
  | "appointment.deleted"
  | "groom.logged"
  | "sms.sent"
  | "sms.handled"
  | "sms.hidden"
  | "sms.failed"
  | "bookkeeper.exported"
  | "google_calendar.connected"
  | "google_calendar.disconnected"
  | "google_calendar.duration_repaired"
  | "google_calendar.sync_failed";

export type AuditEvent = {
  id: string;
  actor_id: string;
  event_type: AuditEventType | string;
  client_id: string | null;
  pet_id: string | null;
  appointment_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AuditEventInput = {
  actorId: string;
  eventType: AuditEventType;
  clientId?: string | null;
  petId?: string | null;
  appointmentId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

const SAFE_METADATA_KEYS = new Set([
  "calendarStatus",
  "channel",
  "date",
  "fee",
  "appointmentIds",
  "location",
  "paymentMethod",
  "paymentStatus",
  "period",
  "petIds",
  "fromClientId",
  "toClientId",
  "service",
  "alreadyCorrect",
  "failed",
  "scanned",
  "skipped",
  "smsMessageId",
  "source",
  "status",
  "templateKey",
  "tip",
  "updated",
]);

const LABELS: Record<AuditEventType, string> = {
  "auth.signed_in": "Signed in",
  "auth.signed_out": "Signed out",
  "client.viewed": "Viewed household",
  "pet.viewed": "Viewed pet",
  "client.created": "Added household",
  "client.updated": "Edited household",
  "pet.created": "Added pet",
  "pet.updated": "Edited pet",
  "pet.merged": "Merged pet profiles",
  "pet.passed_away": "Marked pet passed away",
  "pet.deleted": "Deleted pet profile",
  "pet.moved": "Moved pet",
  "appointment.created": "Booked appointment",
  "appointment.group_created": "Booked household group",
  "appointment.updated": "Edited visit",
  "appointment.deleted": "Deleted booking",
  "groom.logged": "Logged groom",
  "sms.sent": "Sent SMS",
  "sms.handled": "Handled SMS",
  "sms.hidden": "Hid SMS",
  "sms.failed": "SMS failed",
  "bookkeeper.exported": "Exported report",
  "google_calendar.connected": "Connected calendar",
  "google_calendar.disconnected": "Disconnected calendar",
  "google_calendar.duration_repaired": "Repaired calendar",
  "google_calendar.sync_failed": "Calendar sync failed",
};

export function buildAuditEventInsert(input: AuditEventInput) {
  return {
    actor_id: input.actorId,
    event_type: input.eventType,
    client_id: input.clientId ?? null,
    pet_id: input.petId ?? null,
    appointment_id: input.appointmentId ?? null,
    summary: input.summary,
    metadata: safeMetadata(input.metadata ?? {}),
  };
}

export function mapAuditEventRow(row: Row): AuditEvent {
  return {
    id: stringValue(row.id),
    actor_id: stringValue(row.actor_id),
    event_type: stringValue(row.event_type),
    client_id: nullableString(row.client_id),
    pet_id: nullableString(row.pet_id),
    appointment_id: nullableString(row.appointment_id),
    summary: stringValue(row.summary),
    metadata: objectValue(row.metadata),
    created_at: stringValue(row.created_at),
  };
}

export function auditEventLabel(type: string): string {
  return LABELS[type as AuditEventType] ?? type;
}

export function auditEventTone(type: string): "write" | "read" | "warn" | "neutral" {
  if (type.endsWith(".failed") || type.includes("deleted")) return "warn";
  if (type.includes("viewed")) return "read";
  if (
    type.includes("created") ||
    type.includes("updated") ||
    type.includes("logged") ||
    type.includes("handled") ||
    type.includes("sent") ||
    type.includes("exported") ||
    type.includes("connected")
  ) {
    return "write";
  }
  return "neutral";
}

function safeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) => {
      if (!SAFE_METADATA_KEYS.has(key)) return false;
      if (value == null) return false;
      if (typeof value === "string") return value.length <= 200;
      return (
        typeof value === "number" ||
        typeof value === "boolean" ||
        Array.isArray(value)
      );
    }),
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
