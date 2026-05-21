# Tidy Tails v2 Inbox PRD

## Goal

Give Sam one daily work surface for customer replies and operational items that need attention. Settings remains available, but the bottom navigation should prioritize the surfaces Sam uses while operating: Search, Schedule, Reports, Inbox.

## First ship

- Add `/inbox` as a production operator page.
- Replace the bottom-nav Settings tab with Inbox.
- Keep `/settings` reachable from the Inbox header.
- Combine three feeds into one triaged view:
  - inbound/outbound SMS messages from `sms_messages`
  - future public booking requests from `booking_requests`
  - recent operational audit events from `audit_events`
- Put action items first:
  - customer SMS with questions, reschedule/cancel/change language
  - unmatched or ambiguous inbound SMS replies
  - pending booking requests
- Keep confirmations, thanks, sent SMS, and activity visible as context without making them feel urgent.

## Non-goals for this slice

- No automated reply agent.
- No public booking-request form.
- No mark-done state.
- No SMS thread composer.
- No notifications bell.

Those are natural follow-ons once Sam has used the first Inbox in production and we know which items she actually acts on every day.

## Product rule

The Inbox is for work Sam needs to decide on. The future notification bell is only an alert layer. If a thing needs reading, matching, approving, or responding, it belongs in Inbox first.

## Verification

- Pure inbox model tested with synthetic SMS, booking request, and audit rows.
- Server loaders fail soft if optional tables are empty or temporarily unavailable.
- Production page remains read-only: this slice adds no write, no SMS send, no migration, and no Twilio webhook change.
