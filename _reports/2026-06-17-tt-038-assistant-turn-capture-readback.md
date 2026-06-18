# TT-038 — Assistant turn capture: how to read "what is Sam asking"

**Status:** shipping dark (rides the existing `TIDYTAILS_ENABLE_AGENT` gate; no new flag).
**What it does:** every assistant turn now writes one `agent.turn` audit event on the
existing audit rails — the operator's own question, which tools fired, and the
outcome. No schema change (reuses `audit_events`, like `agent.feedback`).

`agent.turn` is **excluded from Sam's in-app activity feed** (`loadRecentAuditEvents`,
which feeds Settings → Recent activity and the inbox/notifications readers) — it is
high-volume per-turn capture and would crowd out real bookings/edits. The dashboard
query below is its read path.

## Read it back (Supabase dashboard → SQL editor)

The dashboard runs as service role, so this reads across every org. Run:

```sql
select
  created_at,
  org_id,
  metadata->>'question'          as question,   -- the operator's OWN words
  metadata->'toolsUsed'          as tools,      -- read/propose tools, or the confirmed kind
  metadata->>'outcome'           as outcome     -- see the outcome key below
from public.audit_events
where event_type = 'agent.turn'
order by created_at desc
limit 200;
```

Scope to Sam once she's live (find her org id in `organizations`):

```sql
-- ... and org_id = '<sam-org-uuid>'
```

Quick "what's it whiffing on" cut (the most useful judge signal):

```sql
select created_at, metadata->>'question' as question, metadata->>'outcome' as outcome
from public.audit_events
where event_type = 'agent.turn'
  and metadata->>'outcome' in ('error','gated')
order by created_at desc;
```

## Outcome key

| outcome      | path    | meaning                                                        |
|--------------|---------|---------------------------------------------------------------|
| `answered`   | ask     | a read-only answer was returned                               |
| `proposed`   | ask     | a write was prepared, awaiting Sam's confirm tap              |
| `error`      | ask/confirm | the turn failed                                           |
| `confirmed`  | confirm | the gated write executed                                      |
| `gated`      | confirm | blocked by a write kill-switch — nothing saved               |

A confirm is its own turn, so a book→confirm flow logs two rows (`proposed`, then
`confirmed`/`gated`). They cluster by operator + timestamp; there is no shared
correlation id in v1.

## Privacy

- Only the operator's own input is logged as `question`; bounded to 200 chars
  (the audit safe-metadata filter drops longer strings and any non-allowlisted key).
- Customer-authored free text is **never** logged. The inbox-reply draft seam
  (`lib/actions/agentReply.ts`) is the agent's one customer-text surface and is
  contractually write-free, so it logs nothing itself; an inbox reply is captured
  only at the confirm seam, which records the proposal **kind** (`send_text`) — never
  the message body or recipient.
- Org-scoped under RLS (rows stamped `org_id` + `groomer_id = auth.uid()`); inert
  when the agent flag is off.

## Deferred (not in this v1) — flagged for the gate

- **`couldn't-do` / `asked-to-disambiguate`** outcomes fold into `answered` today —
  distinguishing them needs a model-emitted marker (touches `runAgent` + the system
  prompt).
- **`cancelled`** (Sam dismisses a proposal without confirming) is a client-only
  dismiss with no server call — would need a small client→server ping.
- **Inbox-reply drafts that error or are cancelled before confirm** are not captured,
  because the injection surface is kept write-free. The one contract-respecting way
  to close this is to log from the client caller (`InboxAssistantReply.tsx`) via a
  `"use server"` `recordAgentTurn` — exactly how `recordAgentFeedback` is called from
  `AnswerFeedback.tsx`. That adds a client-exposed RPC into the injection flow, so
  it's a gate-reviewer call, deliberately left out of v1.

## Pre-enable verification (before Russell flips `TIDYTAILS_ENABLE_AGENT`)

Unit + integration tests prove the wiring and that a real `agent.turn` row is built
and inserted org-scoped. The one thing tests can't prove (CI mocks the request
scope) is that `cookies()`/`requireOrgId()` resolve inside the streaming route's
`ReadableStream.start()` at runtime. Verify one real insert from the **typed chat**
path on staging (ask one question, confirm an `agent.turn` row lands) before enable.
