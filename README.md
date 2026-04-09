# Tidy Tails

Client management, scheduling, and business intelligence app for Tidy Tails dog grooming.

## Live Site

**[russellcolevop.github.io/tidy-tails/home.html](https://russellcolevop.github.io/tidy-tails/home.html)**

- **Client & Schedule App** -- Search clients by phone or dog name, manage rotation grooming schedule across 2 locations, track temperament notes, and run automations.
- **Business Report** -- Three-year analysis (May 2023 - Dec 2025) with revenue trends, client insights, pricing analysis, tip tracking, and 2026 projections.

## Data

Built from 772 transactions across 3 years, covering 147 unique clients and 188 pets.

## Roadmap

- Supabase database backend (persistent client data, notes, schedule)
- Twilio SMS integration (appointment reminders, follow-ups)
- Automated first-visit follow-up (6-week text to new clients)
- 24-hour appointment reminders
- Rebook prompts for inactive regulars
- Summer pre-book and holiday booking campaigns
- Rate card and invoicing
- Multi-user access (Samantha + Annette)

## Tech Stack

Current (v1 -- static prototype):
- Vanilla HTML/CSS/JS
- Chart.js for data visualization
- GitHub Pages hosting

Planned (v2 -- production):
- Supabase (PostgreSQL DB + auth + realtime)
- Twilio (SMS reminders and automations)
- Vercel or GitHub Pages (frontend hosting)
- Supabase Edge Functions (scheduled tasks)

## Setup

The current version is fully static. Open docs/home.html in a browser. No build step, no dependencies.
