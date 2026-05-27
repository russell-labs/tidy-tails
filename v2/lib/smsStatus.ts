import type { SmsMessage } from "./inboundSms";

export function smsDeliveryLabel(message: SmsMessage): string {
  if (message.direction === "inbound") return "Received";

  const status = message.status.trim().toLowerCase();
  if (status === "delivered") return "Delivered";
  if (status === "failed" || status === "undelivered") return "Failed";
  return "Sent";
}

export function smsDeliveryTone(message: SmsMessage): string {
  const status = message.status.trim().toLowerCase();
  if (status === "failed" || status === "undelivered") {
    return "bg-warn-soft text-warn";
  }
  if (status === "delivered" || message.direction === "inbound") {
    return "bg-brand-soft text-brand-ink";
  }
  return "bg-canvas text-ink-soft";
}
