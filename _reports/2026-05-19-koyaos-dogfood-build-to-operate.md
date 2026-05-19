---
date: 2026-05-19
venture: Tidy Tails
status: DOGFOOD NOTE
---

# KoyaOS Dogfood — Build → Operate Is A Venture Milestone

## REQ-39 — The build phase must graduate into an operate cockpit

Tidy Tails exposed a product truth for KoyaOS: the venture is not "done" when
the app ships. The app becomes useful when the operator can run the business
from it: book work, close work, collect payment status, export books, send
messages, and see what needs attention.

For KoyaOS, this should be a named transition:

- **Build** — product design, data model, app implementation, deploy, security,
  launch readiness.
- **Operate** — daily cockpit, revenue capture, outstanding tasks, customer
  follow-up, reporting, marketing toggles, support loops, and evidence that the
  venture can run without the builder sitting beside it.

## Product requirement

KoyaOS should surface a venture's **Operate Readiness** alongside build status.
The cockpit should answer:

- Can the customer do the core job end to end?
- Are writes, automations, messaging, calendar, and reporting actually live?
- What human work is still outside the app?
- What data still needs onboarding or reconciliation?
- What money is collected, waiting, or manually entered?
- What marketing campaigns are active, paused, or not yet launched?
- What follow-up tasks are blocking the operator from running the business?

## Routing requirement

Model/agent routing should consider both task class and operator friction:

- Use thorough slower agents for long safety plans, migration rehearsals,
  bookkeeping audits, and high-stakes reconciliation.
- Use faster coding agents for bounded UI/product slices, test fixes, deploy
  loops, and iterative polish where feedback speed matters.
- Use specialist browser/QA agents for mobile and production dogfooding.

The cockpit should make this explicit instead of hiding it in chat: each task
should carry a recommended agent lane, expected runtime band, and whether it can
continue unattended.

## Tidy Tails implication

The Tidy Tails app crossed from "build" into "operate" when Sam could sign in,
search real customers, create/edit bookings, sync calendar events, log grooms,
send prepared messages, and export books. The next product value is not just
more UI; it is the operating layer: payment status, outstanding work, reminders,
bookkeeper export, and marketing control.
