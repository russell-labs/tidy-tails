# Feedback backlog

Operator-driven improvements to the in-app assistant feedback loop — what Sam's
thumbs up/down tells us, and how that signal reaches a human. One entry per item,
newest first.

## TT-039 — thumbs-down note box + notify-Russell escalation

**Status:** built, PR open (dark — feedback-alert gate OFF by default).

When Sam gives the assistant a thumbs-down she can now add one optional line about
what went wrong, and Russell gets actively notified instead of the signal sitting
silently in the audit table.

- **Note box (Part A).** Thumbs-down reveals one optional single-line note
  ("What went wrong? (optional)") with Send / Skip. The note rides the SAME
  `agent.feedback` audit event (added bounded `note` field, 200-char cap, already
  a safe-metadata key — no schema change). Skip still records the thumbs-down with
  no note, so a negative signal is never lost. Thumbs-up is unchanged (instant
  thank-you).
- **Notify Russell (Part B).** A thumbs-down (with or without a note) fires a
  best-effort SMS to `TIDYTAILS_OWNER_ALERT_PHONE` via the existing Twilio path,
  carrying the rating, Sam's question, the note if any, and a timestamp — no
  customer data. Gated behind `TIDYTAILS_ENABLE_FEEDBACK_ALERT` (exact `"on"`,
  default OFF). With the gate off, behavior is exactly today's: log only, no send.
  The feedback row is written first, so a failed alert loses nothing.

**Hard rules honored:** operator-authored signal only (never customer text);
inert when the agent flag is off or no operator is signed in; the alert is the
only new outbound.

**Pre-enable:** Russell sets `TIDYTAILS_OWNER_ALERT_PHONE` and flips
`TIDYTAILS_ENABLE_FEEDBACK_ALERT=on` in Vercel when ready — no code change.
