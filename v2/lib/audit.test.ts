import { describe, expect, it } from "vitest";
import {
  auditEventLabel,
  auditEventTone,
  buildAuditEventInsert,
  mapAuditEventRow,
} from "./audit";

describe("audit events", () => {
  it("builds a safe insert payload with ids, summary, and metadata", () => {
    expect(
      buildAuditEventInsert({
        actorId: "user-1",
        eventType: "appointment.created",
        clientId: "client-1",
        petId: "pet-1",
        appointmentId: "appointment-1",
        summary: "Booked Kiwi for Russell Cole.",
        metadata: { fee: 50, customerPhone: "should-not-be-here" },
      }),
    ).toEqual({
      actor_id: "user-1",
      event_type: "appointment.created",
      client_id: "client-1",
      pet_id: "pet-1",
      appointment_id: "appointment-1",
      summary: "Booked Kiwi for Russell Cole.",
      metadata: { fee: 50 },
    });
  });

  it("maps live rows into displayable activity items", () => {
    expect(
      mapAuditEventRow({
        id: "evt-1",
        actor_id: "user-1",
        event_type: "sms.sent",
        client_id: "client-1",
        pet_id: null,
        appointment_id: null,
        summary: "Sent reminder to Mary Anca.",
        metadata: { channel: "sms" },
        created_at: "2026-05-19T14:00:00.000Z",
      }),
    ).toEqual({
      id: "evt-1",
      actor_id: "user-1",
      event_type: "sms.sent",
      client_id: "client-1",
      pet_id: null,
      appointment_id: null,
      summary: "Sent reminder to Mary Anca.",
      metadata: { channel: "sms" },
      created_at: "2026-05-19T14:00:00.000Z",
    });
  });

  it("keeps grouped booking audit metadata clear and scrubbed", () => {
    expect(
      buildAuditEventInsert({
        actorId: "user-1",
        eventType: "appointment.group_created",
        clientId: "client-1",
        petId: "pet-1",
        appointmentId: "appointment-1",
        summary: "Booked Whiskey and Kiwi for Mary Anca.",
        metadata: {
          date: "2026-06-29",
          petIds: ["pet-1", "pet-2"],
          appointmentIds: ["appointment-1", "appointment-2"],
          calendarStatus: "synced",
          customerPhone: "should-not-be-here",
        },
      }),
    ).toEqual({
      actor_id: "user-1",
      event_type: "appointment.group_created",
      client_id: "client-1",
      pet_id: "pet-1",
      appointment_id: "appointment-1",
      summary: "Booked Whiskey and Kiwi for Mary Anca.",
      metadata: {
        date: "2026-06-29",
        petIds: ["pet-1", "pet-2"],
        appointmentIds: ["appointment-1", "appointment-2"],
        calendarStatus: "synced",
      },
    });
  });

  it("keeps message-center template metadata for durable SMS guardrails", () => {
    expect(
      buildAuditEventInsert({
        actorId: "user-1",
        eventType: "sms.sent",
        clientId: "client-1",
        summary: "Sent a customer text from the message center.",
        metadata: {
          channel: "sms",
          source: "message_center",
          templateKey: "first_platform",
          customerPhone: "should-not-be-here",
        },
      }).metadata,
    ).toEqual({
      channel: "sms",
      source: "message_center",
      templateKey: "first_platform",
    });
  });

  it("labels and tones important event types for the settings activity log", () => {
    expect(auditEventLabel("appointment.group_created")).toBe(
      "Booked household group",
    );
    expect(auditEventLabel("appointment.deleted")).toBe("Deleted booking");
    expect(auditEventLabel("bookkeeper.exported")).toBe("Exported report");
    expect(auditEventLabel("something.future")).toBe("something.future");

    expect(auditEventTone("sms.failed")).toBe("warn");
    expect(auditEventTone("appointment.created")).toBe("write");
    expect(auditEventTone("client.viewed")).toBe("read");
  });
});

// The agentic layer records a "agent.feedback" event (thumbs up/down on an
// assistant answer) through this SAME pipeline — no new table. The pipeline only
// persists metadata keys on its safe allowlist, so feedback's keys (rating /
// question / toolsUsed) must be allowed, and the event type needs a human label.
describe("agent.feedback audit plumbing", () => {
  it("keeps the feedback metadata keys through the safe-metadata filter", () => {
    const insert = buildAuditEventInsert({
      actorId: "user-1",
      eventType: "agent.feedback",
      summary: "Rated an assistant answer.",
      metadata: {
        rating: "up",
        question: "how much did I make Friday",
        toolsUsed: ["get_day_income"],
        source: "agent",
        customerPhone: "should-not-be-here",
      },
    });

    expect(insert.event_type).toBe("agent.feedback");
    expect(insert.metadata).toEqual({
      rating: "up",
      question: "how much did I make Friday",
      toolsUsed: ["get_day_income"],
      source: "agent",
    });
  });

  it("gives the feedback event a human-readable label", () => {
    expect(auditEventLabel("agent.feedback")).toBe("Rated assistant answer");
  });
});

// TT-038: the agentic layer records one "agent.turn" event per assistant turn —
// the operator's own question, which read/propose tools fired, and the outcome —
// through this SAME audit pipeline (no new table). The new "outcome" key must
// survive the safe-metadata filter, and the event type needs a human label. The
// filter is also the privacy backstop: a non-allowlisted key (e.g. a customer's
// words) must be dropped even if a caller mistakenly passes it.
describe("agent.turn audit plumbing", () => {
  it("keeps the turn metadata keys (question/toolsUsed/outcome/source) through the filter", () => {
    const insert = buildAuditEventInsert({
      actorId: "user-1",
      eventType: "agent.turn",
      summary: "Assistant answered a question.",
      metadata: {
        question: "what's my day look like",
        toolsUsed: ["get_schedule"],
        outcome: "answered",
        source: "agent",
        customerMessage: "should-not-be-here",
      },
    });

    expect(insert.event_type).toBe("agent.turn");
    expect(insert.metadata).toEqual({
      question: "what's my day look like",
      toolsUsed: ["get_schedule"],
      outcome: "answered",
      source: "agent",
    });
  });

  it("gives the turn event a human-readable label", () => {
    expect(auditEventLabel("agent.turn")).toBe("Assistant query");
  });
});
