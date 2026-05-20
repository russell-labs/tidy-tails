import type { Client } from "./data/types";
import type { Row } from "./data/live";
import { digitsOnly } from "./format";

export type InboundSmsMessage = {
  from: string;
  to: string;
  body: string;
  messageSid: string | null;
};

export type InboundSmsMatch =
  | { status: "matched"; client: Client }
  | { status: "unmatched"; client: null }
  | { status: "ambiguous"; client: null };

export type SmsMessage = {
  id: string;
  groomer_id: string;
  client_id: string | null;
  direction: "inbound" | "outbound" | string;
  from_phone: string;
  to_phone: string;
  body: string;
  twilio_message_sid: string | null;
  status: string;
  match_status: string | null;
  received_at: string | null;
  sent_at: string | null;
  created_at: string;
};

export function parseTwilioInboundForm(
  form: URLSearchParams,
):
  | { ok: true; value: InboundSmsMessage }
  | { ok: false; message: string } {
  const from = form.get("From")?.trim();
  const to = form.get("To")?.trim();
  const body = form.get("Body")?.trim();
  if (!from || !to || !body) {
    return {
      ok: false,
      message: "Twilio reply was missing From, To, or Body.",
    };
  }

  return {
    ok: true,
    value: {
      from,
      to,
      body,
      messageSid: form.get("MessageSid")?.trim() || null,
    },
  };
}

export function matchClientByPhone(
  clients: Client[],
  fromPhone: string,
): InboundSmsMatch {
  const incoming = comparablePhone(fromPhone);
  const matches = clients.filter((client) => comparablePhone(client.phone) === incoming);

  if (matches.length === 1) return { status: "matched", client: matches[0] };
  if (matches.length > 1) return { status: "ambiguous", client: null };
  return { status: "unmatched", client: null };
}

export function buildInboundSmsInsert({
  message,
  groomerId,
  match,
}: {
  message: InboundSmsMessage;
  groomerId: string;
  match: InboundSmsMatch;
}) {
  return {
    groomer_id: groomerId,
    client_id: match.status === "matched" ? match.client.id : null,
    direction: "inbound",
    from_phone: message.from,
    to_phone: message.to,
    body: message.body,
    twilio_message_sid: message.messageSid,
    status: "received",
    match_status: match.status,
  };
}

export function buildOutboundSmsInsert({
  clientId,
  groomerId,
  from,
  to,
  body,
  messageSid,
}: {
  clientId: string;
  groomerId: string;
  from: string;
  to: string;
  body: string;
  messageSid: string | null;
}) {
  return {
    groomer_id: groomerId,
    client_id: clientId,
    direction: "outbound",
    from_phone: from,
    to_phone: to,
    body,
    twilio_message_sid: messageSid,
    status: "sent",
    match_status: "matched",
    sent_at: new Date().toISOString(),
  };
}

export function buildTwilioWebhookResponse(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}

export function mapSmsMessageRow(row: Row): SmsMessage {
  return {
    id: stringValue(row.id),
    groomer_id: stringValue(row.groomer_id),
    client_id: nullableString(row.client_id),
    direction: stringValue(row.direction),
    from_phone: stringValue(row.from_phone),
    to_phone: stringValue(row.to_phone),
    body: stringValue(row.body),
    twilio_message_sid: nullableString(row.twilio_message_sid),
    status: stringValue(row.status),
    match_status: nullableString(row.match_status),
    received_at: nullableString(row.received_at),
    sent_at: nullableString(row.sent_at),
    created_at: stringValue(row.created_at),
  };
}

function comparablePhone(value: string): string {
  const digits = digitsOnly(value);
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}
