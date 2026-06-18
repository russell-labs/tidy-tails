# Feedback backlog

Operator-driven improvements to the in-app experience — what Sam's thumbs up/down
tells us and how that signal reaches a human, plus the design-quality work that
makes the cockpit calmer to use. One entry per item, newest first.

## TT-041 — natural assistant read-aloud voice (server-side Google TTS) + voice choice

**Status:** built, PR open (dark — read-aloud only runs behind `TIDYTAILS_ENABLE_AGENT`).

The assistant's read-aloud used the browser Web Speech API, which on iPhone is
stuck with the robotic iOS system voices and sounds different on every device.
Read-aloud now uses a natural, SERVER-SIDE Google voice that sounds the same
everywhere, with a Female/Male choice in Settings.

- **Server TTS helper + route.** `lib/agent/synthesizeSpeech.ts` mirrors
  `transcribe.ts`: it calls Gemini TTS (`gemini-2.5-flash-preview-tts`) on the
  Generative Language API with the SAME `GOOGLE_API_KEY` and `x-goog-api-key`
  header posture — same processor terms as transcription, so answers (which can
  contain customer names) add no new sub-processor. It returns playable WAV (the
  raw 24kHz PCM Gemini emits is wrapped in a RIFF container server-side). The two
  prebuilt voices are "Kore" (female, default) and "Charon" (male). The new
  `app/api/assistant/speak/route.ts` is OUTPUT only and inherits the agent rails:
  404 when the agent flag is off, signed-in-operator required, text size-capped,
  server-side voice allowlist. It is in the agent-safety test set.
- **Client playback (inside `voiceOutput.ts` only).** `createSpeaker`'s signature
  is unchanged (`AssistantChat`'s call site is byte-identical) — only the internals
  changed. `speak()` now fetches audio from `/api/assistant/speak` and plays it
  with an HTMLAudioElement primed inside the mic-tap gesture (iOS unlock). On any
  fetch failure / offline / flag-off 404 it falls back to the passed Web Speech
  engine, so read-aloud never just dies. Voice-only-reads-back, the mute toggle,
  and `onEnd` clearing the speaking status are preserved.
- **Settings voice choice (client-side, no DB).** A small "Voice" control
  (`AssistantVoiceSettings.tsx`) reads/writes a `localStorage` preference — NOT
  `org_settings`, NOT the settings server action, NO migration. `voiceOutput.ts`
  reads it and sends `voice` in the POST; the route re-validates against its
  allowlist (clamps anything else). Default is the female voice. ≥44px tap targets
  via the shared `.tt-btn` kit.

**Safety preserved:** TTS is output only — it reads the same answer the UI shows,
runs no agent, reads no data, and can never trigger or auto-confirm a write (it is
downstream of the confirm-card flow). `GOOGLE_API_KEY` stays server-only (header
only; never logged, echoed, or returned).

**Hard rules honored:** parallel-safe (`AssistantChat.tsx`, `app/(app)/page.tsx`,
`HomeSearch.tsx`, `globals.css` untouched; `createSpeaker` signature identical);
no SQL/schema/RLS/migration changes; tests + typecheck + lint + build all green
(1793 tests). CI proves the routing + WAV wrap with the Google fetch mocked — a
live-key staging check is still needed before read-aloud is enabled.

**Pre-enable:** no new env var required — `GOOGLE_API_KEY` is already present and
read-aloud is gated by the existing `TIDYTAILS_ENABLE_AGENT` flag. The TTS model
id is env-overridable (`TIDYTAILS_ASSISTANT_TTS_MODEL`) if a newer preview ships.

## TT-042 — home-screen assistant launcher

**Status:** built, PR open (dark — gated behind `TIDYTAILS_ENABLE_AGENT`; awaiting Cowork gate review).

Puts the assistant one tap from the home/search screen instead of only behind the
`/assistant` route. Under the Contacts section, when the agent feature is on, a
slim composer-style bar ("Ask about your business…" with the mic + read-aloud
glyphs, nothing else) sits quietly. Tapping it expands it IN PLACE into the full
assistant thread, boxed in its own card, without leaving home; Minimize returns
it to the bar. With the gate off the home screen is byte-identical to today.

- **Additive `embedded` prop on `AssistantChat`.** Default `false` = today's
  full-screen behaviour, byte-for-byte. When `true` the panel does NOT set the
  `data-tidy-assistant` body flag and does NOT use the `min-h-0 flex-1`
  viewport-fill root — it is a self-contained `max-h-[70svh]` card that scrolls
  its own transcript, so it never hijacks the host page's scroll. Every other
  prop, export, server action, and the confirm-before-write contract are
  untouched; `/assistant` renders `<AssistantChat>` with no `embedded` and is
  unchanged.
- **New `HomeAssistantLauncher`.** Owns the collapsed/expanded state and renders
  `<AssistantChat embedded writesEnabled={…} />` when open. Dumb chrome — every
  safety pattern (confirm cards, voice-only read-back, read-aloud/mute) lives in
  AssistantChat and is reused unchanged.
- **Server-side gate.** `page.tsx` resolves `isAgentEnabled()` /
  `isAgentWritesEnabled()` (same source as the `/assistant` route) and passes
  them to `HomeSearch`, which renders the launcher only when the agent is enabled.
  Writes capability flows through `writesEnabled` exactly as `/assistant` does it.

**Hard rules honored:** additive + visual-first; default AssistantChat / `/assistant`
behaviour unchanged; ≥44px tap targets, real aria labels, ≥16px composer font
(coarse-pointer rule preserved); tests + typecheck + lint + build all green (1763
tests, +9); no SQL/schema/RLS/flag changes (reuses the existing
`TIDYTAILS_ENABLE_AGENT` / `TIDYTAILS_ENABLE_AGENT_WRITES` gates). Isolation
verified live: with the launcher expanded the body flag stays unset, the app
shell is not pinned, and the home page scrolls normally
(`_reports/tt-041-home-assistant-launcher/`). Re-check CI against current `main`
at merge time (`strict:false`).

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
