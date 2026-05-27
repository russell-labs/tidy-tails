# Schedule Calibration Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tune Sam's day-fit schedule helper from her calibration answers and turn the same pattern into a relaunchable onboarding wizard for future groomers.

**Architecture:** Store a normalized schedule calibration profile inside the existing operator settings cookie, with Sam's latest answers as the default profile. Pass that profile into day-fit scoring from Schedule and booking flows. Expose Settings > Onboarding cards for profile cleanup and schedule calibration, and document the AI-native customization wedge in root venture docs.

**Tech Stack:** Next.js App Router, React server/client components, server actions, Vitest, TypeScript.

---

### Task 1: Day-Fit Calibration Model

**Files:**
- Modify: `lib/operatorSettings.ts`
- Modify: `lib/dayCapacity.ts`
- Test: `lib/operatorSettings.test.ts`
- Test: `lib/dayCapacity.test.ts`

- [ ] Add a `ScheduleCalibration` type and default values from Sam's submitted day-fit survey.
- [ ] Normalize schedule calibration values from stored JSON and form posts.
- [ ] Change `dogWorkProfile`, `summarizeDayLoad`, and `assessDayFit` to accept optional calibration.
- [ ] Add tests proving 5 dogs is caution, 4 large dogs is not recommended, same-household does not auto-discount, and Sam-style coat/behavior notes increase score.

### Task 2: Settings Onboarding Wizard

**Files:**
- Create: `components/ScheduleCalibrationForm.tsx`
- Modify: `app/(app)/settings/page.tsx`
- Modify: `lib/actions/settings.ts`

- [ ] Add Settings > Onboarding with two cards: customer profile cleanup and schedule calibration.
- [ ] Make schedule calibration relaunchable in-place with radios/number inputs/text areas.
- [ ] Reuse the operator settings server action so saving calibration also preserves message templates.

### Task 3: Wire Schedule Calibration Into Product

**Files:**
- Modify: `app/(app)/clients/[id]/page.tsx`
- Modify: `components/AddAppointment.tsx`
- Modify: `app/(app)/schedule/page.tsx`

- [ ] Pass `operatorSettings.scheduleCalibration` into booking review day fit.
- [ ] Pass the same profile into Schedule week/day summaries and dog profile pills.

### Task 4: KoyaOS Venture Docs

**Files:**
- Modify: `../STRATEGY.md`
- Modify: `../CONTEXT.md`
- Modify: `../BUSINESS.md`

- [ ] Document the wedge as AI-native groomer-specific fit, not a static feature clone.
- [ ] Record onboarding calibration as the mechanism for tailoring schedule guidance to each groomer.

### Task 5: Verification

**Commands:**
- `npm test -- lib/operatorSettings.test.ts lib/dayCapacity.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `vercel --prod`
- `curl -I https://tidy-tails-v2.vercel.app/login`
