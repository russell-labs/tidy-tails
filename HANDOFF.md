---
last-updated: 2026-06-04
current-owner: Russell
lane: FOUNDER
active-app: tidy-tails-v2
hold-fire: true
---

# HANDOFF - Tidy Tails

## Doctrine And Stop Conditions

Hold-fire default is in force. Do not deploy, mutate production data, send live
SMS, run DB migrations/schema/RLS changes, or alter production integration
settings without Russell's explicit go for that exact action.

Permission does not carry across agents. Even if a prior agent had approval,
you must ask again before production mutation or deploy.

## Current State

- Active production app: `https://tidy-tails-v2.vercel.app`
- Active app code: `tidy-tails/v2`
- Vercel project: `tidy-tails-v2`
- Supabase project: `pgkwovokciaqnbhpttba`
- GitHub main after PR #1: merge commit `7dbd9b8`
- Local branch at time of this handoff may still be
  `harden/phase-0-ci-and-settings-guard`; `origin/main` is `7dbd9b8`.
- The previous local commit `6d321dc` (`Add multi-pet household intake`) was
  pushed as part of PR #1 and is now on `origin/main`.

## What Just Happened

PR #1 merged to `main` as merge commit `7dbd9b8`.

Included changes:

- Added CI gate at `.github/workflows/ci.yml`.
  - Runs typecheck, lint, and Vitest on every push and pull request.
  - Keep it green.
- Hardened `v2/lib/actions/settings.ts`.
  - All four settings save actions now re-verify the operator session with
    `getCurrentUser()` before writing.
- Added `v2/lib/payoutOverride.test.ts` for previously untested money logic.
- Fixed stale README auth note.
  - Real Supabase Auth plus allowlist is live.
- Synced `v2/package-lock.json`.
  - Missing `@emnapi` entries previously broke `npm ci` in CI.
- Pushed prior local commit `6d321dc`.
  - Add Household now supports adding multiple pets during initial household
    intake, plus secondary contact/landline fields and pet age/DOB/vaccination
    capture.

## New Norms

- If you change dependencies, run `npm install` from `v2/` and commit the
  lockfile, or CI `npm ci` can fail.
- New server actions must re-verify the session server-side, matching the
  `settings.ts` pattern.
- CI must be green before merge.
- Prefer local fixture mode and Playwright/browser inspection for workflow QA.
- Do not rebuild the in-app activity log. It already exists at
  `Settings -> Advanced -> Activity log`.

## Immediate Next Steps

Run these first, then report back and wait for Russell's next instruction.

1. Sync main.

   ```bash
   cd /Users/russellcole/Developer/RussellLabs/tidy-tails
   rm -f .git/index.lock .git/HEAD.lock 2>/dev/null
   git checkout main
   git pull
   ```

2. Confirm production deploy state.

   Check whether Vercel auto-deploys `main` for project `tidy-tails-v2` or
   whether production is deployed manually with `vercel --prod` from `v2/`.

   Confirm whether `https://tidy-tails-v2.vercel.app` is serving merge commit
   `7dbd9b8`.

   If production is not serving `7dbd9b8`, do not redeploy. Report the gap and
   wait for Russell's go.

3. Verify green locally.

   ```bash
   cd /Users/russellcole/Developer/RussellLabs/tidy-tails/v2
   npm ci
   npm run typecheck
   npm run lint
   npm run test
   npm run build
   ```

   Expected: around 685 tests passing after the Phase 0/PR #1 merge.

4. Optional tidy after confirmation.

   Delete the merged branch `harden/phase-0-ci-and-settings-guard` locally and
   on origin only if it is definitely merged and Russell has not asked to keep
   it.

## Report Back Format

Report:

- Deploy state: whether production serves `7dbd9b8`; evidence used.
- Local verification result: each command and pass/fail.
- Anything that looks off.
- Then wait.

## Copy/Paste Prompt For The Next Agent

```text
Context update for Tidy Tails. Read the doctrine pre-flight first:
/Users/russellcole/Developer/RussellLabs/.koya/ORIENTATION.md,
/Users/russellcole/Developer/RussellLabs/.koya/MODES.md,
/Users/russellcole/Developer/RussellLabs/.koya/AGENTS.md,
/Users/russellcole/Developer/RussellLabs/.koya/VOLATILE.md,
then /Users/russellcole/Developer/RussellLabs/tidy-tails/START_HERE.md and
/Users/russellcole/Developer/RussellLabs/tidy-tails/HANDOFF.md.

Hold-fire default is in force: do not deploy, mutate production data, send live
SMS, run DB migrations/schema/RLS changes, or change production integration
settings without my explicit go.

What just happened (PR #1, merged to main as merge commit 7dbd9b8):
- Added a CI gate at .github/workflows/ci.yml. It runs typecheck, lint, and
  vitest on every push and pull request. Keep it green.
- Hardened v2/lib/actions/settings.ts: all four settings save actions now
  re-verify the operator session (getCurrentUser) before writing.
- Added v2/lib/payoutOverride.test.ts (previously untested money logic).
- Fixed the stale README auth note (real Supabase Auth + allowlist is live).
- Synced v2/package-lock.json (missing @emnapi entries broke npm ci in CI).
- This merge also pushed the previously-unpushed local commit 6d321dc
  ("Add multi-pet household intake") up to origin/main.

New norms:
- If you change dependencies, run npm install and commit the lockfile, or CI npm
  ci fails.
- New server actions must re-verify the session, matching the settings.ts
  pattern.
- CI must be green before merge.

Terminal steps to run now:
1. rm -f .git/index.lock .git/HEAD.lock 2>/dev/null; git checkout main && git pull
2. CONFIRM PRODUCTION DEPLOY STATE. Check whether Vercel auto-deploys main for
   project tidy-tails-v2 or whether we deploy manually with vercel --prod from
   v2/. Tell me whether https://tidy-tails-v2.vercel.app is serving merge commit
   7dbd9b8. If it is NOT, do not redeploy — report the gap and wait for my go.
3. Verify green locally: cd v2 && npm ci && npm run typecheck && npm run lint &&
   npm run test && npm run build (expect ~685 tests passing).
4. Optional tidy: delete the merged branch harden/phase-0-ci-and-settings-guard
   locally and on origin.

Do NOT rebuild the in-app activity log — it already exists at Settings →
Advanced → Activity log. New reference docs: tidy-tails/TECH-DEVELOPMENT.md and
tidy-tails/ENGINEERING-ROADMAP.md.

Report back: deploy state (step 2), local verify result (step 3), anything that
looks off. Then wait for my next instruction.
```

## Reading List

1. `/Users/russellcole/Developer/RussellLabs/.koya/ORIENTATION.md`
2. `/Users/russellcole/Developer/RussellLabs/.koya/MODES.md`
3. `/Users/russellcole/Developer/RussellLabs/.koya/AGENTS.md`
4. `/Users/russellcole/Developer/RussellLabs/.koya/VOLATILE.md`
5. `tidy-tails/START_HERE.md`
6. `tidy-tails/HANDOFF.md`
7. `tidy-tails/AGENTS.md`
8. `tidy-tails/v2/AGENTS.md`
9. `tidy-tails/TECH-DEVELOPMENT.md`
10. `tidy-tails/ENGINEERING-ROADMAP.md`

## Known Dirty-Tree Note

This repo often contains unrelated modified/untracked root docs and reports.
Preserve them unless Russell explicitly asks for cleanup. Stage only files in
your task scope.
