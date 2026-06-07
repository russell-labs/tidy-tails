---
venture: tidy-tails
doc-type: slice-plan
ticket: WS3 / Slice A
created: 2026-06-07
branch: feat/ws3-front-door
environment: staging only
---

# WS3 Slice A — Auth: signup, confirmation, password reset, retire allowlist

Scope of this PR (first of three on `feat/ws3-front-door`). B (onboarding wizard
+ RLS migration) and C (empty-state) follow as separate PRs after this is
reviewed/approved.

## Decisions (locked, validated with advisor)
- **Gate model:** the proxy becomes **auth-only** (logged-in vs not). The
  membership gate (no membership → `/onboarding`) lives in the **`(app)` layout**
  (async server component, `currentOrgId()`), not the proxy — avoids per-request
  edge DB calls. Security still rests on the fail-closed data layer + per-org RLS;
  the layout redirect is routing only.
- **`/onboarding` lives OUTSIDE `(app)`** (its own `(onboarding)` group) so the
  `(app)` membership redirect can't loop on it. Slice A ships a placeholder page;
  the wizard is Slice B.
- **Membership gate is live-mode only:** `(app)` layout checks membership only
  when `dataMode() === "live"`. Fixtures/E2E mode (`NEXT_PUBLIC_USE_LIVE_DATA=off`)
  has no org concept, so the existing `sam-workflows` E2E stays green.
- **`redirectTo` = request origin** for signup confirmation + reset links (reuse
  `appOriginFromHeaders`). No hardcoded localhost.
- **`operatorAccess.ts` + its test are deleted** — grep confirms only
  `auth.ts`, `callback/route.ts`, `proxy.ts`, and its own test referenced it.
- **No migrations in Slice A** → isolation + cutover-rehearsal gates stay green
  untouched. The self-serve INSERT-policy migration is Slice B.

## Files
- `lib/authRouting.ts` (new, pure) — `postAuthDestination(hasMembership)`.
- `lib/actions/auth.ts` — drop allowlist; `signIn` routes by membership; add
  `signUp`, `requestPasswordReset`, `updatePassword`.
- `app/(auth)/auth/callback/route.ts` — drop allowlist; route by membership /
  honor `next` (recovery link).
- `lib/supabase/proxy.ts` — auth-only; add `/signup`, `/forgot-password` to
  public paths.
- `app/(auth)/signup|forgot-password|reset-password/page.tsx` + matching forms.
- `components/LoginForm.tsx`, `app/(auth)/login/page.tsx` — cross-links + copy.
- `app/(app)/layout.tsx` — live-mode membership gate → `/onboarding`.
- `app/(onboarding)/layout.tsx` + `.../onboarding/page.tsx` — placeholder.
- Delete `lib/operatorAccess.ts` + `lib/operatorAccess.test.ts`.
- Update `lib/actions/authSettingsActions.test.ts` (allowlist → membership).
- `lib/authRouting.test.ts` (new).

## Manual staging dashboard steps (PR description — NOT autonomous)
- Supabase Auth → **enable "Confirm email"** (so unconfirmed can't enter).
- Site URL + redirect allowlist = staging app origin.
- Email templates (confirm signup, reset password).

## Prod-safety flag (PR description)
Retiring the allowlist swaps to a membership gate. **Prod is still on baseline
(pre-WS2.4 cutover)** per project memory — `currentOrgId()` would be null for Sam
on prod → she'd be bounced to onboarding. Therefore **prod promotion is BLOCKED
until the WS2.4 cutover lands.** Staging (carries migrations + seed) is fine.

## Open decision deferred to Slice B PR (per advisor)
Settings persistence: today `operatorSettings` is a per-browser cookie with a
hardcoded gina/annette map. Slice B must capture generic locations + scheduling
style + economics per org. Proposed: additive per-org store (JSONB on
`organizations` or a small `org_settings` table) + a generic settings shape,
WITHOUT rewiring the ~10 existing read sites in WS3 (WS4 consumes). Russell/Cowork
to confirm at the B review gate.
