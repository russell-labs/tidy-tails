# TT-040 redesign — inbox / messaging surfaces (before / after)

Visual-only restyle of the inbox and conversation surfaces to the approved
full-app mockup (`design/2026-06-18-full-app-redesign.html`), consuming the shared
`.tt-*` kit from the TT-040 foundation. One of the five parallel screen sessions.

Captured at iPhone width (390×844) against the local dev server in **fixtures**
mode (anonymized demo data) with `TIDYTAILS_E2E_AUTH_BYPASS=on` — no live data,
no login. Full-page screenshots, so the fixed bottom nav floats mid-capture.

| # | Surface | Route |
|---|---------|-------|
| 01 | Inbox list (metric tiles, thread list, needs-action card + inline composer) | `/inbox` |
| 02 | Thread detail (composer + SMS conversation rows) | `/inbox/[threadKey]` |
| 03 | Client profile conversation (`ClientSmsConversation`) | `/clients/[id]` |
| 04 | Pet profile (Ready-pickup trigger) | `/clients/[id]/pets/[petId]` |
| 05 | Ready-pickup sheet (open) | sheet on 04 |
| 06 | Settings SMS troubleshooting log (`SmsMessages`, unframed) | `/settings` |

Notable visible change: the inbox subtitle/secondary copy previously rendered as
dark body text because it used an **undefined** `text-ink-muted` utility; it now
reads as muted gray (`ink-soft`) per the mockup. Buttons now carry the kit's
`.tt-btn` base (≥44px tap target, 12px radius, soft shadow, proper disabled state).

The assistant "draft a reply" affordance (`InboxAssistantReply`) is gated dark
behind `TIDYTAILS_ENABLE_AGENT`, so it does not appear in these shots; its restyle
is covered by the structural render test (`InboxAssistantReply.test.tsx`).
