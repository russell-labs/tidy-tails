// Owner feedback-alert SMS (TT-039 Part B) — make sure a thumbs-down on the
// assistant actually reaches a human instead of sitting silently in the audit
// table. When Sam rates an answer down, Russell gets one short heads-up text.
//
// This is the ONLY new outbound in the whole feedback path, so it is gated and
// fails safe on every axis:
//   - TIDYTAILS_ENABLE_FEEDBACK_ALERT must be exactly "on" (default OFF) — with
//     it off, a thumbs-down is logged only, exactly as today, never texted.
//   - it sends to TIDYTAILS_OWNER_ALERT_PHONE (the owner), never a customer.
//   - the body carries only OPERATOR-authored text — Sam's own question and her
//     optional note — plus a timestamp. No customer SMS bodies, no booking text,
//     no client names. (Both fields are bounded upstream; we re-bound here too.)
//   - it is best-effort: every failure is swallowed. The feedback audit row is
//     always written first, so a failed alert loses nothing.
//
// It reuses the existing Twilio send path (getTwilioConfig / toTwilioPhone /
// sendTwilioSms) directly rather than sendCustomerSms, because this is an
// operator-internal heads-up: it must not be gated by the reminder-send switch
// and must not be written into the customer sms_messages ledger.

import { getTwilioConfig, sendTwilioSms, toTwilioPhone } from "@/lib/twilio";
import { isFeedbackAlertEnabled } from "@/lib/writeGate";

const OWNER_ALERT_PHONE_ENV = "TIDYTAILS_OWNER_ALERT_PHONE";

// Mirror the audit safe-metadata cap so the alert can never carry more than what
// the feedback row itself records.
const MAX_ALERT_FIELD = 200;

export type FeedbackAlertInput = {
  /** Sam's own question this answer responded to (operator-authored, bounded). */
  question: string;
  /** Sam's optional note on what went wrong (operator-authored, bounded). */
  note?: string;
  /** ISO timestamp of the thumbs-down. */
  at: string;
};

function bounded(value: string | undefined): string {
  return String(value ?? "").trim().slice(0, MAX_ALERT_FIELD);
}

export function buildFeedbackAlertBody(input: FeedbackAlertInput): string {
  const question = bounded(input.question);
  const note = bounded(input.note);
  // No operator name in the copy — it's resolved per-org elsewhere and the guard
  // (TT-012) forbids hardcoding it. This alert goes to the owner, who knows who
  // the operator is.
  const lines = [
    "Tidy Tails: a thumbs-down on the assistant.",
    `Q: "${question}"`,
  ];
  if (note) lines.push(`Note: "${note}"`);
  lines.push(input.at);
  return lines.join("\n");
}

export async function sendFeedbackAlert(input: FeedbackAlertInput): Promise<void> {
  try {
    if (!isFeedbackAlertEnabled()) return;

    const configured = process.env[OWNER_ALERT_PHONE_ENV]?.trim();
    if (!configured) return;
    const to = toTwilioPhone(configured);
    if (!to) return;

    const config = getTwilioConfig();
    if (!config.ok) return;

    await sendTwilioSms(config.value, { to, body: buildFeedbackAlertBody(input) });
  } catch {
    // Best-effort: the thumbs-down is already logged. An alert that can't be
    // sent must never bubble up and fail Sam's feedback turn.
  }
}
