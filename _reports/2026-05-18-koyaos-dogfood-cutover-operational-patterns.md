---
when: 2026-05-18
who: Cowork
purpose: Reusable operational patterns surfaced while executing the Tidy Tails Ship 2.2b production cutover prep. Distinct from the 2026-05-15 dogfood doc (which captured data-primitive requirements from the reconciliation workstream) — these are process/operational patterns from running a high-stakes data-layer cutover. Relay to the KoyaOS product backlog.
audience: KoyaOS product team / Mission Control
status: captured; relay when Koya feedback is next ingested
related:
  - _reports/2026-05-15-koyaos-dogfood-requirements-from-tidy-tails.md
  - _reports/2026-05-18-ship-2.2b-production-cutover-runbook.md
  - _reports/2026-05-18-ship-2.2b-write-gate-operations.md
---

# KoyaOS dogfood — cutover operational patterns from Tidy Tails

Four patterns that proved their worth (or proved a gap) while preparing the
Ship 2.2b RLS cutover. Each is grounded in a concrete thing that happened, and
each is reusable by any KoyaOS venture facing a risky data-layer change.

---

## PATTERN-01 — Two-tier operational docs: reference + operator card

**What happened:** The cutover needed both a *runbook* (full rationale, every
decision, atomicity caveats — long) and an *operator card* (checkboxes, exact
copy-paste commands — short, kept open while working). The same split recurred
for the write flips: a `write-gate-operations` reference doc plus per-flip
operator cards. One blended doc would be too long to act from and too terse to
understand.

**What KoyaOS could do:** Template the pair as a first-class artifact type. A
high-stakes procedure gets a `reference` doc (authoritative, explains *why*) and
an `operator-card` doc (execute-ready, checkbox, copy-paste, declares *what*).
The card links the reference; the reference never gets executed from directly.

## PATTERN-02 — Dark-ship risky writes behind default-OFF flags; flip one at a time

**What happened:** v2's four write surfaces all ship with their live `.insert()`
paths **built and committed**, each gated by a private, server-only env flag
that defaults OFF and activates only on the exact string `on`. Nothing
big-bangs on. Post-cutover the surfaces flip individually, each with its own
approval and a mini-verifier that also re-confirms the *not-yet-flipped*
surfaces are still inert (no cascade).

**What KoyaOS could do:** Make "gated capability" a platform primitive: a
registry of risky surfaces, each with a kill-switch flag, a default-OFF
fail-safe contract (only an exact safe value enables), a flip order, and a
required per-flip verifier. The risk of a launch then decouples from the risk
of a deploy.

## PATTERN-03 — A pre-cutover backup is a baseline only if a drift recheck is an explicit step

**What happened:** The cutover verifier compares post-migration row counts to
the backup's `MANIFEST.json`. A backup taken hours early is only a valid
baseline if production has not drifted by apply time — but the T-15 step
originally re-checked policies and the UID, not the counts. The freshness check
the whole backup story depended on had no home until it was added explicitly.

**What KoyaOS could do:** When a procedure produces an artifact that a *later*
step consumes as ground truth, the platform should require an explicit
freshness/validity recheck step wired between them — not leave it implied. A
"baseline" artifact carries a staleness contract.

## PATTERN-04 — Internal release codenames must never reach customer-facing copy

**What happened:** The gated-write messages shown verbatim to the end user said
"…turns on after the Ship 2.2b security cutover." "Ship 2.2b" is an internal
release codename a customer has no context for. It shipped because user-facing
strings were not reviewed against an outside reader.

**What KoyaOS could do:** Lint user-facing strings for internal vocabulary —
release codenames (`Ship N`, `M2`), internal table/flag names, ticket IDs. A
cheap check; catches a class of polish bug before a customer sees it.

---

*Generated 2026-05-18 from the Ship 2.2b cutover-prep workstream. Concise by
intent — four evidence-backed patterns, not a survey.*
