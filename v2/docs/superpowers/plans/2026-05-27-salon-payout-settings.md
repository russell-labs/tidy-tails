# Salon Payout Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Sam gross and net appointment money after salon payouts, with Gina and Annette payout details configurable in Settings.

**Architecture:** Store salon payout and customer-facing address details in operator settings with safe defaults for the current two DB-backed locations. Add pure finance helpers for appointment/day gross and net totals, then wire those helpers into schedule cards and settings forms.

**Tech Stack:** Next.js App Router, React server/client components, Vitest, cookie-backed operator settings.

---

### Task 1: Settings Model and Finance Helpers

**Files:**
- Create: `lib/locationFinance.ts`
- Modify: `lib/operatorSettings.ts`
- Test: `lib/locationFinance.test.ts`
- Test: `lib/operatorSettings.test.ts`

- [ ] Write failing tests for Gina/Annette default salon payout percentages and Sam net calculations.
- [ ] Implement `LocationSettings`, default locations, normalization, and finance helper functions.
- [ ] Verify focused tests pass.

### Task 2: Settings UI

**Files:**
- Create: `components/LocationSettingsForm.tsx`
- Modify: `lib/actions/settings.ts`
- Modify: `app/(app)/settings/page.tsx`

- [ ] Add a client form for editing existing Gina/Annette salon labels, customer address text, and payout percentages.
- [ ] Save location settings without overwriting message templates or schedule calibration.
- [ ] Revalidate settings, schedule, reports, and booking screens.

### Task 3: Schedule Money Display

**Files:**
- Modify: `app/(app)/schedule/page.tsx`
- Modify: `app/(app)/schedule/appointments/[appointmentId]/page.tsx`

- [ ] Replace gross-only totals with gross and Sam net totals.
- [ ] Keep location names on appointment cards settings-aware for existing locations.
- [ ] Leave custom locations disabled until the DB accepts dynamic appointment location values.

### Task 4: Verification

**Commands:**
- `npm test -- lib/locationFinance.test.ts lib/operatorSettings.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
