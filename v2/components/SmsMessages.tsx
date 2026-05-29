import type { SmsMessage } from "@/lib/inboundSms";
import { classifyInboundSmsBody } from "@/lib/inboundSms";
import { formatDateTime, formatPhone } from "@/lib/format";
import { smsDeliveryLabel, smsDeliveryTone } from "@/lib/smsStatus";
import { SmsMessageHideButton } from "./SmsMessageHideButton";

function messageTime(message: SmsMessage): string {
  const value = message.received_at ?? message.sent_at ?? message.created_at;
  return formatDateTime(value) || "—";
}

function phoneForMessage(message: SmsMessage): string {
  return message.direction === "inbound"
    ? formatPhone(message.from_phone)
    : formatPhone(message.to_phone);
}

function directionLabel(message: SmsMessage): string {
  return message.direction === "inbound" ? "Customer reply" : "Sam message";
}

function directionClass(message: SmsMessage): string {
  return message.direction === "inbound"
    ? "bg-brand-soft text-brand-ink"
    : "bg-canvas text-ink-soft";
}

const INBOUND_CLASS_LABELS = {
  confirmed: "Confirmed",
  thanks: "Thanks",
  needs_follow_up: "Needs follow-up",
  needs_reply: "Question",
  received: "Reply",
};

const INBOUND_CLASS_STYLES = {
  confirmed: "bg-brand-soft text-brand-ink",
  thanks: "bg-canvas text-ink-soft",
  needs_follow_up: "bg-warn-soft text-warn",
  needs_reply: "bg-warn-soft text-warn",
  received: "bg-canvas text-ink-soft",
};

export function SmsMessages({
  messages,
  emptyText = "No text message history yet.",
  framed = true,
  canHide = false,
}: {
  messages: SmsMessage[];
  emptyText?: string;
  framed?: boolean;
  canHide?: boolean;
}) {
  if (messages.length === 0) {
    return (
      <p
        className={
          framed
            ? "rounded-xl border border-line bg-surface px-3.5 py-3 text-sm leading-relaxed text-ink-soft"
            : "px-3.5 py-3 text-sm leading-relaxed text-ink-soft"
        }
      >
        {emptyText}
      </p>
    );
  }

  return (
    <ul className={framed ? "overflow-hidden rounded-xl border border-line bg-surface" : ""}>
      {messages.map((message) => (
        <li key={message.id} className="border-b border-line px-3.5 py-3 last:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${directionClass(message)}`}>
                  {directionLabel(message)}
                </span>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${smsDeliveryTone(message)}`}>
                  {smsDeliveryLabel(message)}
                </span>
                {message.direction === "inbound" ? (
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                      INBOUND_CLASS_STYLES[classifyInboundSmsBody(message.body)]
                    }`}
                  >
                    {INBOUND_CLASS_LABELS[classifyInboundSmsBody(message.body)]}
                  </span>
                ) : null}
                <span className="text-xs font-medium text-ink-soft">
                  {phoneForMessage(message)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {message.body}
              </p>
              {message.match_status && message.match_status !== "matched" ? (
                <p className="mt-2 text-xs font-medium text-warn">
                  {message.match_status === "ambiguous"
                    ? "Matched more than one household phone."
                    : "No matching household phone found."}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="text-xs font-medium text-ink-faint">
                {messageTime(message)}
              </span>
              {canHide ? <SmsMessageHideButton smsId={message.id} /> : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
