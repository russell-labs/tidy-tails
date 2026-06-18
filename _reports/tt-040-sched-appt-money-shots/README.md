# TT-040 — schedule / appointment / money surfaces: before & after

Mobile (390px) before/after evidence for the visual-only restyle of the
schedule, appointment, and money surfaces to the approved redesign mockup
(`design/2026-06-18-full-app-redesign.html`), reusing the TT-040 foundation kit
(PR #69).

Captured from the local dev server in **fixtures + auth-bypass** mode
(`TIDYTAILS_E2E_AUTH_BYPASS=on`, fixtures data) — anonymized demo data only, no
PII. `before/` is current `origin/main`; `after/` is this branch.

Separate from the code commit, in a unique `_reports` path so it collides with
no other screen session's files (same convention as
`_reports/tt-040-foundation-shots/`).

| Screen | What to look for |
| --- | --- |
| `01-schedule-week` | Title → `.tt-page-title`; section eyebrows shrink to 12px (`.tt-eyebrow`); day-fit + appointment cards gain the calm `shadow-soft`; top stat tiles stay flat (per mockup). |
| `02-schedule-day` | Opened-day card + nested rows; `shadow-soft` on the day card. |
| `03-appointment-detail` | Eyebrows → 12px; summary + workflow + payment action cards gain `shadow-soft`; brand "Change or cancel" card and the workflow/payment safety styling unchanged. |
| `05-reports` | Section eyebrows → 12px; follow-up / lapsed / vaccination / take-home / rented-split cards → `shadow-soft`; stat tiles flat; vaccination Expired (red) / Expiring (amber) safety colors preserved. |

The booking/edit form sheets (AddAppointment, EditAppointment, etc.) are
intentionally unchanged — they inherit the redesign through the shared
`FormPrimitives` / `Sheet` primitives — so they are not screenshotted here.
