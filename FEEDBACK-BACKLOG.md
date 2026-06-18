# Feedback backlog

Operator-driven improvements to the in-app experience — what Sam's thumbs up/down
tells us and how that signal reaches a human, plus the design-quality work that
makes the cockpit calmer to use. One entry per item, newest first.

## TT-040 — full-app redesign: shared design system (foundation)

**Status:** built, PR open (visual-only; awaiting Cowork gate review).

The first of six redesign PRs. Restyles only the shared kit every screen reuses —
design tokens + the foundation primitives — to the approved full-app mockup
(`design/2026-06-18-full-app-redesign.html`), so the five parallel screen sessions
build against settled interfaces.

- **Tokens (`globals.css`).** Added the missing `--shadow-soft` elevation (the
  `shadow-soft` utility was referenced on cards but never defined, so cards were
  rendering flat) and a `--color-brand-line` hairline. Palette, type scale, and
  all behavioral CSS (sheet-height calcs, nav-hide transforms, safe-area helpers)
  are unchanged. `14px` body stays expressed via `text-sm` — the rem root is left
  alone so no utility rescales.
- **Reusable kit.** A documented `@layer components` block of `.tt-*` classes
  (card, button primary/secondary/danger, chip, fab, input, textarea, type
  helpers) so screen sessions consume one source of truth instead of re-deriving
  button/card/input styling. Utilities still override (components layer).
- **Primitives restyled, interfaces frozen.** `FormPrimitives`, `AppHeader`,
  `BottomNav`, `Sheet`, `InstallAppPrompt` — styling/markup only; no props,
  exports, or behavior changed. Safety patterns (allergy red, vaccine amber,
  confirm-before-write, the focus outline) preserved.

**Hard rules honored:** visual-only; same information architecture; tests +
typecheck + lint + build all green (1754 tests); no SQL/schema/RLS/flag changes.

## TT-040 — full-app redesign: inbox / messaging surfaces

**Status:** built, PR open (visual-only; awaiting Cowork gate review).

One of the five parallel screen sessions that follow the foundation. Restyles the
inbox and conversation surfaces to the approved full-app mockup
(`design/2026-06-18-full-app-redesign.html`) by consuming the shared `.tt-*` kit —
no new button/card/input styles forked.

- **Inbox list (`inbox/page.tsx`).** Page title now uses the kit's `.tt-page-title`;
  the summary tiles keep the kit's 16px card (`.tt-card`) with a 20px count and a
  10px label. Fixed an undefined `text-ink-muted` token (it rendered as dark body
  text) — secondary copy now reads as muted gray per the mockup. Needs-action
  cards dogfood `.tt-card`; the Reply/Request pills already matched the kit.
- **Composers + conversation.** `InboxMessageCenter`, `InboxSmsActions`,
  `InboxAssistantReply`, `ClientSmsConversation`, and `ReadyPickupMessage` map
  their buttons onto `.tt-btn` primary/secondary/danger (so every action is a
  ≥44px tap target with the kit's disabled state) and route the two raw red error
  banners onto the `danger-soft`/`danger-ink` tokens. `SmsMessages` and
  `SmsMessageHideButton` were already on-kit and left untouched.
- **Safety patterns preserved.** Confirm-before-send (Review → Confirm & send),
  the Ready-pickup demo/live notes, the destructive "Confirm hide" red, and the
  assistant confirm-card flow are unchanged. The assistant draft-a-reply trigger
  stays dark behind `TIDYTAILS_ENABLE_AGENT`.

**Hard rules honored:** visual-only; same information architecture, props,
exports, and server actions; tests + typecheck + lint + build all green (1754
tests); no SQL/schema/RLS/flag changes. Re-check CI against current `main` at
merge time (`strict:false`).

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
