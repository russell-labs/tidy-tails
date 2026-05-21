import { describe, expect, it } from "vitest";
import type { AuditEvent } from "./audit";
import type { SmsMessage } from "./inboundSms";
import {
  buildInboxItems,
  inboxCounts,
  type BookingRequestInboxRow,
} from "./inbox";

function sms(overrides: Partial<SmsMessage>): SmsMessage {
  return {
    id: "sms-1",
    groomer_id: "groomer-1",
    client_id: "client-1",
    direction: "inbound",
    from_phone: "+17055550123",
    to_phone: "+17055550999",
    body: "Can we change the time?",
    twilio_message_sid: "SM123",
    status: "received",
    match_status: "matched",
    received_at: "2026-05-20T14:00:00Z",
    sent_at: null,
    created_at: "2026-05-20T14:00:00Z",
    ...overrides,
  };
}

function request(
  overrides: Partial<BookingRequestInboxRow>,
): BookingRequestInboxRow {
  return {
    id: "request-1",
    client_id: "client-1",
    pet_id: "pet-1",
    requested_date: "2026-05-29",
    requested_time_slot: "morning",
    preferred_location: "gina",
    service_type: "full_groom",
    client_message: "Could Kiwi come in Friday morning?",
    status: "pending",
    created_at: "2026-05-20T15:00:00Z",
    ...overrides,
  };
}

function audit(overrides: Partial<AuditEvent>): AuditEvent {
  return {
    id: "audit-1",
    actor_id: "sam",
    event_type: "appointment.created",
    client_id: "client-1",
    pet_id: "pet-1",
    appointment_id: "appt-1",
    summary: "Booked Kiwi for May 29",
    metadata: {},
    created_at: "2026-05-20T13:00:00Z",
    ...overrides,
  };
}

describe("buildInboxItems", () => {
  it("puts inbound questions and change requests in needs action", () => {
    const items = buildInboxItems({
      smsMessages: [sms({ body: "Can I reschedule?" })],
      bookingRequests: [],
      auditEvents: [],
    });

    expect(items).toMatchObject([
      {
        id: "sms:inbound:sms-1",
        kind: "sms",
        priority: "action",
        badge: "Needs follow-up",
        clientId: "client-1",
      },
    ]);
  });

  it("treats unmatched inbound SMS as action even when the words look harmless", () => {
    const items = buildInboxItems({
      smsMessages: [sms({ body: "Thanks", client_id: null, match_status: "unmatched" })],
      bookingRequests: [],
      auditEvents: [],
    });

    expect(items[0]).toMatchObject({
      priority: "action",
      badge: "Unmatched reply",
      title: "Text from 705-555-0123",
    });
  });

  it("does not keep handled inbound SMS in needs action", () => {
    const items = buildInboxItems({
      smsMessages: [sms({ body: "Can we change?", status: "handled" })],
      bookingRequests: [],
      auditEvents: [],
    });

    expect(items[0]).toMatchObject({
      priority: "info",
      badge: "Handled",
    });
  });

  it("does not keep audit-handled inbound SMS in needs action", () => {
    const items = buildInboxItems({
      smsMessages: [sms({ id: "sms-1", body: "Can we change?" })],
      bookingRequests: [],
      auditEvents: [],
      handledSmsIds: new Set(["sms-1"]),
    });

    expect(items[0]).toMatchObject({
      priority: "info",
      badge: "Handled",
    });
  });

  it("keeps confirmations and thanks as informational replies", () => {
    const items = buildInboxItems({
      smsMessages: [sms({ body: "Confirmed, thanks!" })],
      bookingRequests: [],
      auditEvents: [],
    });

    expect(items[0]).toMatchObject({
      priority: "info",
      badge: "Confirmed",
    });
  });

  it("shows pending booking requests as action items", () => {
    const items = buildInboxItems({
      smsMessages: [],
      bookingRequests: [request({})],
      auditEvents: [],
    });

    expect(items[0]).toMatchObject({
      id: "booking-request:request-1",
      kind: "booking_request",
      priority: "action",
      badge: "Request",
      clientId: "client-1",
      title: "Booking request",
    });
    expect(items[0].body).toContain("May 29, 2026");
    expect(items[0].body).toContain("morning");
  });

  it("keeps sent SMS and audit events as log items", () => {
    const items = buildInboxItems({
      smsMessages: [sms({ direction: "outbound", body: "See you tomorrow" })],
      bookingRequests: [],
      auditEvents: [audit({})],
    });

    expect(items.map((item) => item.priority)).toEqual(["log", "log"]);
    expect(items.map((item) => item.kind)).toEqual(["sms", "activity"]);
  });

  it("sorts action items first, then newest within priority", () => {
    const items = buildInboxItems({
      smsMessages: [
        sms({ id: "old-action", body: "Can we change?", created_at: "2026-05-20T10:00:00Z" }),
        sms({ id: "new-info", body: "Thanks", created_at: "2026-05-20T18:00:00Z" }),
      ],
      bookingRequests: [request({ id: "new-action", created_at: "2026-05-20T17:00:00Z" })],
      auditEvents: [audit({ id: "new-log", created_at: "2026-05-20T19:00:00Z" })],
    });

    expect(items.map((item) => item.id)).toEqual([
      "booking-request:new-action",
      "sms:inbound:old-action",
      "sms:inbound:new-info",
      "activity:new-log",
    ]);
  });
});

describe("inboxCounts", () => {
  it("counts action items, SMS replies, and booking requests", () => {
    const items = buildInboxItems({
      smsMessages: [sms({ body: "Can we change?" }), sms({ id: "s2", body: "Thanks" })],
      bookingRequests: [request({})],
      auditEvents: [],
    });

    expect(inboxCounts(items)).toEqual({
      needsAction: 2,
      smsReplies: 2,
      bookingRequests: 1,
    });
  });
});
