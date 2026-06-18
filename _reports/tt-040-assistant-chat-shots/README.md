# TT-040 — Assistant chat redesign (gate-review screenshots)

Before/after of the assistant chat surface, restyled to the approved full-app
mockup (`design/2026-06-18-full-app-redesign.html`) on top of the PR #69
foundation kit. Visual-only: the full test suite stays green (1754 tests),
typecheck + lint clean. The voice-only-reads-back rule and the
confirm-before-save contract are preserved.

Shots are at iPhone width (390px, 2x). `before/` renders the components at
`origin/main`; `after/` renders this branch. Both were captured the same way,
through a throwaway local preview harness (never committed, never the gated
route, no env flag flipped).

## What changed, per image

- **chat-empty** — `before`: no header, plain suggestions, a 3-control composer
  (speaker toggle + input + mic + a separate "Send" button). `after`: an
  integrated header (sparkle + "Assistant") with the **read-aloud/mute control as
  a header pill**, a persistent writes-aware capability line, sparkle-led
  suggestion chips, and **one round composer button** (talk).
- **chat-send** — typing flips the single round control from **talk → send**
  (mic → up-arrow). `before` had a permanently separate "Send" button.
- **chat-listening** — `after`: the input morphs into a brand "Listening…" pill
  (ping dot + dots, `aria-live`) and the round button becomes **Stop**. `before`
  showed the old composer with a red pulsing mic.
- **cards** — the confirm card in every state. It is **ONE card that mutates**
  pending → confirming → saved / gated / error / cancelled (never a second card).
  `after` adds a header band naming the action and a "nothing changes until you
  tap Confirm" reassurance line. Destructive **delete / cancel** stay red with
  "can't be undone" prominent (safety pattern, never softened). The exact
  resolved action text is rendered verbatim in both.
- **feedback** — TT-039 thumbs + optional note box, restyled. Behavior and the
  awaiting-note wiring are unchanged (idle → thumbs-down note box → thanked).
- **status** — the live indicator (Thinking / tool / Listening / Transcribing /
  Speaking), restyled to match the assistant bubble (avatar + dots). Every phase
  label + `aria-live` preserved.

## Files changed (source)

- `v2/components/AssistantChat.tsx`
- `v2/components/AssistantConfirmCard.tsx`
- `v2/components/AssistantStatus.tsx`
- `v2/components/AnswerFeedback.tsx`
- `v2/app/(app)/assistant/page.tsx`
