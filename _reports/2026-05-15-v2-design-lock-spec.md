---
doc: v2-design-lock-spec.md
when: 2026-05-15
who: Cowork
milestone: V2_DESIGN_LOCK
venture: tidy-tails
supabase_project: pgkwovokciaqnbhpttba
status: DRAFT — pending Russell review and open question resolution
gated_on: V1_HARDENED, PAWFINITY_LOGGED_IN_RECON (Workstream C)
purpose: The spec CC builds v2 from. Covers product principles, v1 reality, architecture, modules, UX flows, data model, migration, scope boundaries, open questions, build plan, and acceptance criteria.
---

# Tidy Tails v2 — Design-Lock Spec

---

## 0. How to use this document

This is the single document CC reads before writing the first line of v2 code. It is not a wireframe set. It is not a project management backlog. It is the product contract: what gets built, to what standard, in what order, and explicitly what does not get built.

If there is a conflict between this spec and anything else in the repo, this spec wins — unless Russell logs a superseding decision in `docs/DECISIONS.md`.

---

## 1. Product principle

**Built for Samantha's actual working day. Nothing more.**

Samantha is a solo professional dog groomer. She runs a full book of clients out of a single location. She works alone. She grooms 4–8 dogs a day depending on size and complexity. She manages scheduling in her phone calendar and a paper book. She does not want software to own her scheduling. She does want software to own her client history, her dog notes, and her reminders.

Every design decision in v2 is evaluated against one test: does this make Samantha's day faster or safer? If the answer is no or "maybe eventually," it does not ship in v2.0.

**The four product principles that follow from this:**

**1.1 Mobile-first.** Samantha works on her phone. Every screen must be usable one-handed, at thumb-width, on a 4G connection. Desktop is a secondary target — it should work, but it is not designed for.

**1.2 Fast client lookup is the core interaction.** Before every appointment, Samantha looks up a client. This lookup — search, tap, see the dog — must happen in under 3 taps and under 2 seconds on a mid-range phone. Every other feature is secondary to this.

**1.3 Simple is a product decision, not a failure of ambition.** Pawfinity has had 15 years and a full dev team. It is a feature warehouse. Tidy Tails wins by being shaped exactly to a solo groomer's needs — no onboarding burden, no settings maze, no features that require a manual. v2 must resist the temptation to add every feature that seems logical.

**1.4 Samantha must not be surprised.** She uses v1 every day. v2 has to feel like the same product that got better — not a replacement she has to re-learn. Core flows (client lookup → history → log appointment → send SMS) must map cleanly to what she does now.

---

## 2. V1 reality

### 2.1 What v1 does well

- **It works.** Samantha has used it daily since launch. 730 appointments logged. Revenue tracking aligned to financial ledger within $60.
- **The flow is simple.** Home → search client by name or phone → see pets and appointment history → add appointment → send SMS. This flow is correct. v2 keeps it.
- **It starts fast.** Static HTML loads instantly. Search is a Supabase query with no framework overhead.
- **SMS is working.** The `send-sms` Supabase edge function (Twilio) is live and Samantha uses it. The backend infra is fine; v2 just calls the same function.
- **The data model is sound.** `clients` → `pets` → `appointments` FK chain is correct and has 18 months of real production data on it. v2 extends this; it does not replace it.

### 2.2 What v1 does poorly

- **No auth.** The Supabase anon key is embedded in public GitHub Pages HTML. Anyone with the URL can read and write all rows. This is the most important thing v2 fixes.
- **Not mobile-friendly.** The layout was built desktop-first and never properly adapted. On a phone, Samantha is working around the UI, not with it.
- **Appointment logging requires navigation.** After a session, she has to navigate to the client page, scroll to the form, fill it. It is more friction than it should be.
- **Allergy and grooming notes are buried.** They live in the pet record but are not surfaced prominently. Samantha has to scroll to find them before she starts a groom.
- **No vaccination tracking.** Samantha checks vax status verbally or from memory. There is no field for it in v1.
- **No lapsed-client view.** There is no way to see clients who haven't booked in 60, 90, or 120 days. Samantha manages follow-up manually.
- **Duplicate ghost rows in the database.** 139 ghost rows from the 2026-04-09 double-import exist in the live DB. Phase 2 dedup will clean these before v2 launch.
- **The `client_overview` view has SECURITY DEFINER semantics.** It bypasses RLS. This is a known advisory warning (B2 in v1-active-bugs.md).

### 2.3 What is unsafe or fragile

- **R-1 — Permissive RLS.** Every SELECT/INSERT/UPDATE policy is `qual = true, roles = {public}`. Full details in RISKS.md and v1-active-bugs.md B1. This is the critical risk. v2's first meaningful ship is closing this.
- **GitHub Pages auto-deploys on merge to `main`.** Any code change ships to Samantha immediately. v2 must be deployed to a separate environment (Vercel). v1 stays on GitHub Pages until V2_CUTOVER.
- **No automated backup.** Supabase free tier. Manual dump at `venture-ops/backups/tidy-tails/`. Next dump is required before any major DB operation. (A 2026-05-15 backup exists covering Phase 1.)
- **`dump_supabase.py` does not exist** despite being referenced in CLAUDE.md. The backup script needs to be written.
- **The `client_overview` view bypasses RLS.** Any app path that queries through it ignores access control. Drop this view or rebuild it as SECURITY INVOKER as part of V1_HARDENED / v2 auth work.

### 2.4 What must remain familiar for Samantha

These patterns are load-bearing for Samantha's workflow. v2 must map onto them cleanly:

- **Search by name or phone.** This is how she finds clients before appointments. It must be the first thing she sees.
- **Pet allergy flag is visible before she touches the dog.** This is a safety concern for the animal, not just a UX preference. Allergy status must be prominent and impossible to miss.
- **One-tap SMS after looking up a client.** She sends reminders constantly. This must be reachable from the client view without extra navigation.
- **Appointment history visible on the client page.** She needs to see the last visit date and price before confirming what she'll charge today.
- **Intake is a single form.** New client → new dog → done. She should not have to navigate between screens to add a new client with their first pet.

---

## 3. V2 target architecture

### 3.1 Stack

| Layer | Decision | Rationale |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | Server components, first-class Supabase SSR support, Vercel deploy, TypeScript by default |
| Styling | **Tailwind CSS** | Mobile-first, fast iteration, no runtime overhead |
| Auth | **Supabase Auth** | Already in the stack; no new vendor; email/password login is all Samantha needs |
| Database | **Supabase** — same project `pgkwovokciaqnbhpttba` | No data migration needed; v2 is a new frontend on the same DB after RLS is rewritten |
| Hosting | **Vercel** | Free tier covers this load; Next.js first-class support; preview deploys for QA |
| SMS | **Existing Twilio / `send-sms` edge function** | Backend is working; v2 calls the same function via the Supabase edge function API |
| App shell | **PWA / installable web app** | Pawfinity ships an installable web-app shell. Tidy should match the app-like distribution path without adding native-app complexity before the product is proven. |
| Component library | **None** | Keep UI intentionally minimal. shadcn/ui components are acceptable if needed but should be pulled selectively, not installed wholesale |

No Stripe at v2.0. No Anthropic API at v2.0. Both are post-LICENSEABLE_READY unless Russell explicitly opens a design decision.

PWA baseline is part of v2.0: manifest, app icon placeholders, mobile viewport, installable home-screen behavior, persistent auth, and fast launch. Native iOS/Android is explicitly later.

### 3.2 Auth model

Supabase Auth, email/password. Samantha has one account. She logs in once and stays logged in on her phone.

**Login flow:**
- Email + password. No magic links — Samantha is the only user and does not need the passwordless flow; a forgotten-password email reset is sufficient.
- Session persists in browser. Auth token stored in Supabase's cookie/localStorage via the Next.js SSR client.
- If session expires, she gets a login screen — not a broken app.

**Future multi-groomer path:**
- The data model in v2 must include a `groomer_id` FK (UUID, references `auth.users`) on `clients`, `pets`, and `appointments`, even though v2.0 is Samantha-only.
- This FK is the migration path to LICENSEABLE_READY. Setting it up now avoids a schema migration later.
- For Samantha's account: all rows get her `auth.uid()` as `groomer_id` on migration.

### 3.3 RLS model

All six public tables get new policies scoped to `auth.uid()`. This is the core security fix.

**Policy pattern (same for all tables):**

```sql
-- SELECT: only rows belonging to this groomer
CREATE POLICY "groomer_select" ON public.clients
  FOR SELECT USING (groomer_id = auth.uid());

-- INSERT: row must belong to the authenticated groomer
CREATE POLICY "groomer_insert" ON public.clients
  FOR INSERT WITH CHECK (groomer_id = auth.uid());

-- UPDATE: only own rows
CREATE POLICY "groomer_update" ON public.clients
  FOR UPDATE USING (groomer_id = auth.uid());

-- DELETE: only own rows (re-enabling controlled deletes for v2)
CREATE POLICY "groomer_delete" ON public.clients
  FOR DELETE USING (groomer_id = auth.uid());
```

Apply the same pattern to `pets`, `appointments`, `booking_requests`, `client_accounts`, `automations_log`.

**`client_overview` view:** Drop it. Rebuild the query in the application layer (server component or server action). Do not recreate a SECURITY DEFINER view.

**`sam_review_responses` table:** Workstream B only; not part of v2 app. Keep its existing INSERT-only anon policy; SELECT via service role in admin context only. Not exposed in v2 UI.

**Anon key after v2 launch:** The anon key may still be used for the SMS edge function invocation if that function uses the anon key on the client side. Review and move SMS calls to a server action so the anon key is no longer needed in the browser. Full anon key removal from the browser is a V1_HARDENED / v2 auth task.

### 3.4 Twilio / SMS path

The `send-sms` edge function is live and working. v2 calls it via a Next.js server action — not from the browser directly.

**Flow:**
1. Samantha taps "Send reminder" on a client card.
2. Next.js server action receives the request (Samantha's session is validated server-side).
3. Server action calls the Supabase edge function with the client's phone number and message.
4. Edge function sends via Twilio. Returns success/error to the server action.
5. Server action returns status to the UI. Toast: "Reminder sent" or "Send failed — try again."

No changes to the edge function itself. The `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` secrets stay in Supabase function secrets.

Default SMS template (editable in Settings in a later pass):
`"Hi [first_name], just a reminder that [pet_name] has a grooming appointment [date_string]. See you soon! — Samantha"`

### 3.5 Backup strategy

- **Before any migration or schema change:** take a fresh logical backup via `venture-ops/dump_supabase.py` (this script needs to be written — see outstanding items).
- **Ongoing:** upgrade to Supabase Pro ($25/month) at or before V1_HARDENED to get 7-day PITR. This is the correct long-term answer.
- **During parallel run:** both v1 and v2 write to the same DB. No divergence is possible — there is only one DB. This is intentional.

### 3.6 Migration approach

**There is no data migration.** v2 uses the same Supabase project. The only database changes are schema changes (new columns, `groomer_id` FK, `vaccinations` table, dropping `client_overview` view). All existing row data is preserved.

**Schema migration sequence:**
1. Run all four reconciliation phases (Phase 1 done, Phase 2–4 pending) before v2 launch. v2 should start on a clean DB.
2. Add `groomer_id` UUID column to `clients`, `pets`, `appointments`. Set default = Samantha's `auth.uid()`. Backfill all existing rows.
3. Add `vaccinations` table.
4. Add `email` column to `clients` (nullable).
5. Add `color`, `sex`, `typical_fee` to `pets` (all nullable — backfilled via Phase 4 Codex enrichment).
6. Drop `client_overview` view.
7. Replace all v1 permissive RLS policies with the `groomer_id = auth.uid()` policies above.

Steps 2–7 happen in a single Supabase migration applied before v2 goes live.

---

## 4. Core app modules

Each module listed with: what it is, what it shows, what it does, and UX requirements.

### 4.1 Client list / search (Primary surface)

**What it is:** The home screen. Samantha's first stop every time she opens the app.

**What it shows:**
- Search bar (auto-focused on page load).
- Client list — scrollable. Each row: client full name, primary phone, pet names (comma-separated), allergy flag icon if any pet has `allergies = true`.
- On mobile, the list is the full screen. No sidebar, no nav clutter.

**What it does:**
- Real-time search by client first name, last name, or phone as Samantha types. No search button — results update on each keystroke with debounce (~200ms).
- Tap a client row → navigate to Client detail (4.2).
- "New client" button (bottom-right FAB on mobile, top-right on desktop) → navigate to Intake (4.5).

**UX requirements:**
- Search must work on partial strings. "Bea" must return "Leona Beasley" and "Ethan Beasley."
- Phone search must match with or without dashes. "7053" must return clients with "705-3xx-xxxx."
- Allergy flag icon (simple colored dot or ⚠ symbol) must be visible at a glance in the list row — not just inside the client detail.
- Empty state: "No clients found. Add a new client?" with link to Intake.
- Loading state: skeleton rows, not a spinner overlay.
- Must render usably on a 390px wide screen (iPhone SE / common Android).

### 4.2 Client detail

**What it is:** The central working page for an in-progress appointment.

**What it shows:**
- Client name + phone (tappable to call on mobile).
- Alt contact if present.
- Notes field.
- Pet cards — one per pet associated with this client (see Pet card component below).
- Appointment history — reverse-chronological list. Each row: date, service, price. Show last 10 by default with "Show all" expansion.
- "Send reminder" button (prominent, above the fold on mobile).
- "Add appointment" button.
- "Edit client" link (small, secondary).

**Pet card component (embedded in Client detail):**
- Pet name + breed.
- Allergy flag: if `allergies = true`, display a prominent red/orange alert block with `allergies_detail` text. This must be visually impossible to overlook.
- `grooming_notes` — displayed below allergies. Full text, not truncated.
- Vaccination status (see 4.3).
- "Edit pet" link.

**What it does:**
- "Send reminder" → triggers SMS flow (4.7). Pre-populates with client's primary phone and the first active pet name.
- "Add appointment" → opens the quick-log modal (see 4.4).
- "Edit client" → navigate to client edit form.

**UX requirements:**
- Allergy warnings must appear before grooming notes, before appointment history. Safety information first.
- On mobile, "Send reminder" and "Add appointment" must be reachable without scrolling past the pet cards.
- If a client has multiple pets, each pet gets its own card. Cards are stacked vertically, not in a horizontal scroll (horizontal scroll is unreliable on mobile).
- Appointment history must show the last-visit date clearly. This is what Samantha checks to confirm her expected price.

### 4.3 Pet detail

**What it is:** Full pet record. Accessible from the Pet card in Client detail.

**What it shows:**
- Pet name, breed, color, sex (if populated).
- Typical fee (if populated — editable).
- Allergy flag + detail (same prominent treatment as in Client detail).
- Grooming notes (full text).
- Vaccination records — list of vaccines with type and expiry date. Highlight expired or expiring-within-30-days records in amber/red.
- Full appointment history for this specific pet (filtered from the appointments table by `pet_id`).

**What it does:**
- Edit pet → inline or dedicated edit form covering all fields.
- Add vaccination record → small modal: vaccine type (dropdown or free text), expiry date.
- Delete vaccination record (with confirmation).

**UX requirements:**
- Vaccination expiry display must use relative dates ("Expires in 14 days" or "Expired 45 days ago"), not raw ISO date strings.
- The edit form for a pet must not require navigating away from the client page — modal or slide-over preferred.

### 4.4 Appointment log (Quick-log modal)

**What it is:** The post-appointment logging flow. This is used multiple times per day.

**What it shows:**
- Client name (read-only header — she's already on their page).
- Pet selector (dropdown if multiple pets, pre-selected if one pet).
- Date — pre-filled with today.
- Service description — free text. Short. Pre-filled with the most recent service description for this pet ("Bath + haircut — standard" saves retyping).
- Price — numeric input. Pre-filled with the pet's `typical_fee` if set.
- Notes — optional, one line.
- "Save" button.

**What it does:**
- Submit → INSERT into `appointments`. Return to Client detail. No page reload — optimistic update.
- Validation: pet, date, service, and price are required. Price must be a positive number.

**UX requirements:**
- This modal must be completable in under 30 seconds. That is the success criterion.
- The keyboard must not push the "Save" button off-screen on mobile (bottom-sheet layout handles this).
- Price input must open a numeric keypad on mobile (use `inputMode="decimal"`).
- After save, the new appointment must appear at the top of the client's appointment history immediately.

### 4.5 Intake (New client form)

**What it is:** The form Samantha uses when a new client walks in for the first time.

**What it shows:**
- Section 1 — Owner: first name, last name, phone (required), alt contact (optional), notes (optional).
- Section 2 — Pet: pet name, breed (optional), color (optional), sex (optional), allergies toggle (if toggled on → allergy detail free text), grooming notes (optional), typical fee (optional).
- "Save" button.

**What it does:**
- Submit → INSERT into `clients`, then INSERT into `pets` with the new `client_id`. Navigate to the new Client detail page.
- Validation: first name, last name, phone, and pet name are required.

**UX requirements:**
- Single scrolling form — no multi-step wizard. Samantha has the client standing in front of her. She needs to get through this fast.
- Phone field: accepts any format (with or without dashes). Store normalized (strip non-numeric) or store as-entered consistently — pick one and stick with it.
- After saving, land on the new client's detail page, not back on the client list. She will likely add an appointment right after intake.

### 4.6 Reports / Revenue

**What it is:** Samantha's numbers view. Used periodically, not daily.

**What it shows:**
- Date range picker (defaults to current month).
- Total appointments in range.
- Gross revenue in range.
- Average revenue per appointment.
- Appointment list (date, client name, pet name, service, price) — sortable, exportable.
- Lapsed-client list — clients with no appointment in the last 90 days (configurable). Shows client name, last appointment date, and primary phone. This is a separate tab or section.

**What it does:**
- Export button → download the visible appointment list as CSV. Same as v1's export module.

**UX requirements:**
- This does not need to be a real-time dashboard. A simple date-filtered query is sufficient.
- The lapsed-client list is new. It must show last-visit date and phone number so Samantha can tap to call or send a reminder directly.
- Revenue figures must match what Samantha sees in her financial records. The current alignment is $57,821.25 / 730 appointments — spot-check this on launch.

### 4.7 SMS

**What it is:** Not a standalone screen. SMS is an action triggered from Client detail (4.2) and from the lapsed-client list in Reports (4.6).

**Send flow:**
1. Samantha taps "Send reminder" on a client card.
2. A bottom sheet slides up (on mobile) or a modal appears (on desktop).
3. The message is pre-populated with the default template, substituting `[first_name]` and `[pet_name]`.
4. Samantha can edit the message text before sending.
5. "Send" → server action → Supabase `send-sms` edge function → Twilio.
6. Toast: "Sent to [phone number]" or error message.

**What it does NOT do:**
- No 2-way SMS in v2.0. Replies go to Twilio's default handling. This is a v2.1+ feature.
- No scheduled/automated reminders in v2.0. Samantha sends manually.
- No SMS to multiple clients at once in v2.0. Audience broadcasts are a later feature.

### 4.8 Admin / Settings

**What it shows:**
- Account section: Samantha's email, change password, sign out.
- Business section: business name (displayed in SMS footer), SMS sender name.
- SMS template: editable default template for appointment reminders.
- Danger zone: "Export all data" (full CSV dump). This is for Samantha's peace of mind — her data, downloadable.

**UX requirements:**
- Settings is not a frequently visited page. Accessible from a menu or profile icon, not prominently in the main nav.
- Change password must send a reset email via Supabase Auth, not display the password in-app.

### 4.9 Client portal (LATER — not in v2.0)

Online booking, client-facing appointment confirmations, and photo upload are explicitly out of scope for v2.0. This section exists to document the intent, not to build it.

When it ships (post-V2_CUTOVER), it will require: a separate auth flow for pet owners, a `client_accounts` table (schema exists, 0 rows), a booking-request surface, and a notification system. Do not build any of this in v2.0.

---

## 5. UX requirements

### 5.1 Samantha's daily flows — end to end

**Morning — checking who's coming in:**
Samantha opens the app. She searches for each client by name. She reads the pet notes and allergy flags before they arrive. This is a read-only flow. It must be fast.

**During the day — after each groom:**
Samantha opens the app → finds the client → taps "Add appointment" → fills in service and price → saves. Under 30 seconds. She is often doing this between dogs.

**Before an appointment — sending a reminder:**
Samantha finds the client → taps "Send reminder" → adjusts the message if needed → sends. Two to three taps.

**New client walk-in:**
Samantha taps "New client" → fills in intake form → saves. She gets the client's information verbally while they're standing in front of her. Form must be forgiving (nothing except name, phone, and pet name is required).

**Periodic — checking revenue:**
Samantha opens Reports, sets the date range to the current month, looks at the total. She may export to CSV for her records. This is a once-a-week or once-a-month action.

### 5.2 Mobile UX

- Primary design target: iPhone-size screen (375–430px wide). Android parity is required but iOS Safari is the primary test target given Samantha's likely device.
- Touch targets: minimum 44×44px per Apple HIG. No small inline links for primary actions.
- Bottom navigation or hamburger menu — not a sidebar. The sidebar pattern does not work on mobile for primary navigation.
- Keyboard handling: when a text field is focused, the layout must not break. Bottom-sheet modals (appointment log, SMS compose) must keep the submit button above the keyboard.
- No hover states used for primary functionality — hover does not exist on touch screens.

### 5.3 Search

- Client search: fuzzy match on first name, last name, and phone. Supabase full-text search (`to_tsvector` / `plainto_tsquery`) or ILIKE on both name columns simultaneously. Phone: strip non-numeric characters from both the query and the stored phone before comparing.
- Search results must include the matched field. If she searches "705-330", she should see the phone number highlighted in the result row, not just the name.
- Search is the primary navigation. There is no "browse all clients alphabetically" page — the search handles it (empty query = full list, sorted by last name).

### 5.4 Appointment creation UX

Covered in detail in 4.4. Key UX constraints:
- Default date = today. Samantha never logs an appointment for a future date (she does not use the app for scheduling).
- Service description: free text with autocomplete suggestions from this client/pet's appointment history. The most common services ("Bath + haircut", "Bath only", "Trim") appear as suggestions.
- Price: numeric with pre-fill from `typical_fee`. Samantha overrides occasionally (holiday tips, discount).

### 5.5 Client history

- Appointment history is the second thing Samantha reads on a client page (after allergy flags).
- Show: date (human-readable — "May 8" not "2026-05-08"), service description, price.
- Default: last 10 appointments. "Show all" expands.
- Total spend and total visits (all-time) shown as a summary line above the list.

### 5.6 Pet notes and allergies

- Allergy flag (`allergies = true`) must be visually unmissable on both the client list and the client detail page.
- On the client detail page: allergy detail text appears in a colored alert block (red border, amber background, or similar — not a subtle badge) directly below the pet name and breed.
- Grooming notes appear immediately below the allergy block. No truncation — show the full text.
- Samantha sometimes adds new grooming notes after a difficult appointment. The edit flow for this must be reachable without leaving the client page.

### 5.7 Lapsed clients

- Definition: no appointment in the last N days, where N is configurable in Settings (default 90).
- Surfaced in the Reports module as a separate list.
- Each row: client name, pet name(s), last appointment date, primary phone (tappable to call or SMS).
- "Send reminder" action on each row — same SMS flow as in Client detail.

### 5.8 Reminders

- Manual only in v2.0. Samantha taps "Send reminder" and it goes.
- No scheduled sends, no automation, no email — all of this is v2.1+.
- The SMS compose bottom sheet shows the phone number it's sending to. Samantha must be able to see and verify this before she sends.

### 5.9 Offline and degraded behavior

Samantha's grooming location may have intermittent connectivity. v2.0 behavior when offline:

- **Read:** Cache the last-fetched client list and the last 10 viewed client detail pages in service worker cache. If offline, she can still read cached data. No stale-data banner needed — just serve from cache.
- **Write:** If offline, appointment-log and SMS sends should fail gracefully with a clear message: "No connection — your changes were not saved. Try again when you have signal." Do not silently drop writes.
- Full offline write queue (IndexedDB-backed sync) is a v2.1 enhancement, not a v2.0 requirement.
- PWA installability (add to home screen) should work at v2.0 launch: web app manifest + service worker registered. This gives Samantha an app-like launch icon on her phone.

---

## 6. Data model changes

### 6.1 Existing tables (changes only)

**`clients`**

| Column | Change | Notes |
|---|---|---|
| `groomer_id` | ADD — UUID, NOT NULL, FK → auth.users | Required for RLS. Backfill all rows with Samantha's `auth.uid()` in migration. |
| `email` | ADD — text, nullable | Not currently stored. Add for future use; do not require it. |
| No other changes | — | `first_name`, `last_name`, `phone`, `alt_contact`, `notes`, `created_at`, `updated_at` stay as-is. |

**`pets`**

| Column | Change | Notes |
|---|---|---|
| `groomer_id` | ADD — UUID, NOT NULL, FK → auth.users | Required for RLS. Backfill in migration. |
| `color` | ADD — text, nullable | From Phase 4 Codex enrichment data. |
| `sex` | ADD — text, nullable | 'M', 'F', or null. |
| `typical_fee` | ADD — numeric(8,2), nullable | Pre-fills appointment price field. |
| `date_of_birth` | ADD — date, nullable | Optional. Useful for vax expiry calculations. |
| No other changes | — | `name`, `breed`, `allergies`, `allergies_detail`, `grooming_notes`, `client_id`, `created_at` stay as-is. |

**`appointments`**

> **Schema correction (2026-05-17):** Phase 3.5 SQL drafting surfaced that the live `appointments` table has 14 columns, not the 7 originally listed in this section. The columns named `service` and `price` here are actually stored as `service_type` and `fee`, and 6 additional columns (`time_slot`, `location`, `tip`, `rent_paid`, `net`, `status`) were not captured at all. The corrected list is below. This is a documentation fix only — no schema change to the live DB is implied. See `_reports/2026-05-17-phase-3.5-appointment-backfills.sql` schema-discovery note and the Phase 3.5 plan §5 G8 for the discovery context.

Actual v1 columns (14, all `is_nullable: YES` except `id`, `client_id`, `pet_id`, `date`):

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | uuid NOT NULL | `uuid_generate_v4()` | row PK; auto-assigned |
| `client_id` | uuid NOT NULL | — | FK → `clients(id)` |
| `pet_id` | uuid NOT NULL | — | FK → `pets(id)` |
| `date` | date NOT NULL | — | appointment date |
| `time_slot` | text | — | sparse in v1 (~13% populated) |
| `location` | text | — | dense in v1 (~98%); domain `{annette, gina, NULL}` |
| `service_type` | text | — | dense; domain `{full_groom, nail_trim}` |
| `fee` | numeric | — | gross fee |
| `tip` | numeric | `0` | always populated in v1 |
| `rent_paid` | numeric | `0` | always populated in v1 |
| `net` | numeric | — | computed: holds for all 730 rows that `net = fee + tip - rent_paid` |
| `status` | text | `'booked'` | all 730 existing rows = `'completed'` |
| `notes` | text | — | existing v1 style: `"key:value; key:value"` (e.g. `"payment:debit; breed:Cavachon"`) |
| `created_at` | timestamptz | `now()` | row creation time |

| Column | Change | Notes |
|---|---|---|
| `groomer_id` | ADD — UUID, NOT NULL, FK → auth.users | Required for RLS. Backfill in migration. |
| No other changes | — | all 14 columns above stay as-is. |

**`booking_requests`, `client_accounts`, `automations_log`**

| Change | Notes |
|---|---|
| ADD `groomer_id` to each | Required for RLS scoping. All currently have 0 rows; backfill is trivial. |
| No schema changes beyond that | These tables are not used in v2.0; keep them for future phases. |

**`client_overview` view**

| Change | Notes |
|---|---|
| DROP VIEW `client_overview` | SECURITY DEFINER semantics bypass RLS. Replace with a server-side query in the application layer. |

### 6.2 New tables

**`vaccinations`**

```sql
CREATE TABLE public.vaccinations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id      uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  groomer_id  uuid NOT NULL REFERENCES auth.users(id),
  vaccine_type text NOT NULL,         -- e.g. 'Rabies', 'Bordetella', 'DHPP'
  expires_at  date NOT NULL,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.vaccinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groomer_select" ON public.vaccinations
  FOR SELECT USING (groomer_id = auth.uid());
CREATE POLICY "groomer_insert" ON public.vaccinations
  FOR INSERT WITH CHECK (groomer_id = auth.uid());
CREATE POLICY "groomer_update" ON public.vaccinations
  FOR UPDATE USING (groomer_id = auth.uid());
CREATE POLICY "groomer_delete" ON public.vaccinations
  FOR DELETE USING (groomer_id = auth.uid());
```

**`audit_events`** (optional but recommended for v2.0)

Lightweight event log for data changes. Samantha will never look at this; it is for Russell to audit if something unexpected happens.

```sql
CREATE TABLE public.audit_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  groomer_id   uuid NOT NULL REFERENCES auth.users(id),
  table_name   text NOT NULL,
  row_id       uuid NOT NULL,
  action       text NOT NULL,   -- 'insert', 'update', 'delete'
  changed_by   uuid REFERENCES auth.users(id),
  payload      jsonb,           -- before/after snapshot
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- No RLS needed — only writable via server actions (service role), not the client.
```

If the audit table adds complexity, defer it. It is not a v2.0 blocker.

### 6.3 What is explicitly NOT changing

- The `clients → pets → appointments` FK chain. This is the core of the data model and it is correct.
- The `send-sms` edge function schema. Input and output contract is unchanged.
- The `sam_review_responses` table. Workstream B artifact; not touched by v2.
- Any existing row data. v2 inherits the full production dataset.

---

## 7. Migration plan

### 7.1 Keep v1 live during v2 build

v1 stays on GitHub Pages at `https://russell-labs.github.io/tidy-tails/home.html` throughout the v2 build. Samantha continues using v1 as her primary tool. Zero disruption.

No code changes to v1 after V2_DESIGN_LOCK except critical hotfixes. The default is: v1 is frozen.

### 7.2 V2 staging environment

v2 is built and deployed on Vercel to a non-production URL (e.g. `tidy-tails-v2.vercel.app` or a custom subdomain). Samantha does not use the staging URL during build.

**Staging connects to the same Supabase project.** There is no staging database. Samantha's real data is the test data. This is acceptable because:
- The Supabase project is single-database with a consistent schema.
- v2 staging writes go into the same `appointments` table as v1 production. This is fine during parallel run.
- If a staging-environment data issue occurs, the v2 staging URL is the blast radius — Samantha's v1 is unaffected.

Alternative (rejected): a separate "shadow" Supabase project with copied data. Rejected because it creates a sync problem and a false test environment. The real data is the real test.

### 7.3 Schema migration timing

Schema migration (add columns, add tables, drop view, rewrite RLS policies) happens **immediately before v2 goes live for Samantha**, not during the v2 build phase.

**Why:** The RLS policy rewrite closes out v1 access patterns. If the new policies go live before v2 is ready, v1 breaks. The sequence is:

1. v2 build is complete and tested by Russell on staging.
2. Samantha is notified of the upcoming transition.
3. Schema migration runs (single Supabase migration, applied via `apply_migration`).
4. v2 goes live for Samantha.
5. v1 is decommissioned after parallel run (see 7.4).

### 7.4 Parallel run

After v2 goes live for Samantha, v1 stays accessible for 7 consecutive days.

**Criteria for parallel run success:**
- Zero data-divergence events (an appointment exists in one system but not the other due to a sync issue — this should not happen since they share the same DB, but network failures during a write could cause it).
- Samantha reports no workflow blockers in v2.
- All five daily flows work without manual fallback to v1.

**End of parallel run:**
- If criteria are met: decommission v1 (archive the GitHub Pages branch, or redirect `russell-labs.github.io/tidy-tails/home.html` to the v2 URL).
- If criteria are not met: identify the specific failure, fix in v2, reset the 7-day clock.

### 7.5 Rollback plan

If v2 is broken after schema migration and parallel run has begun:

1. v1 is still live — Samantha falls back to v1 immediately. No action required from her.
2. The schema changes that break v1 (primarily the RLS rewrite) may need to be temporarily reverted. Russell assesses.
3. A rollback migration is prepared as part of the v2 build — the inverse of the forward migration, tested in staging.
4. Apply rollback migration → v1 works again → v2 build continues.

The goal is that v1 remains functional throughout the parallel run, so rollback always has a working fallback.

---

## 8. What not to build in v2.0

This section is as important as the build plan. These items must not creep into v2.0 scope.

**Online booking / client-facing scheduling.** Samantha does not want clients self-booking. She uses a paper book and her phone calendar. Building a booking engine without her explicit request would add complexity for a feature she doesn't want.

**Payment processing.** Samantha is paid cash or e-transfer at the appointment. Stored payments, card-on-file, and Stripe integration are v2.1 features gated on STORED_PAYMENTS_LIVE milestone. Do not add a `stripe_customer_id` column or any payment UI in v2.0.

**Automated reminders / scheduled SMS.** Automation requires knowing Samantha's schedule, which the app does not own. Manual send covers her real workflow. Automation is a v2.1+ feature.

**Two-way SMS.** Inbound reply handling requires a webhook receiver and a way to surface replies in the UI. This is significant infrastructure for a feature Samantha has not asked for. Defer.

**Multi-tenant management UI.** v2.0 supports one groomer (Samantha). The `groomer_id` FK supports future multi-tenancy at the data layer, but there is no admin panel, no groomer creation flow, and no per-tenant settings UI in v2.0.

**Inventory management.** Shampoos, tools, supplies. Not in Tidy Tails' scope — this is a salon management category that Pawfinity supports and we are explicitly not chasing.

**Payroll.** Out of scope entirely. Single-operator business.

**POS hardware.** Pawfinity integrates with card readers and receipt printers. This is a salon-management feature set we are not building.

**Analytics beyond revenue and appointment counts.** Cohort analysis, LTV, churn rate, breed popularity, day-of-week patterns. None of this is useful to Samantha in her day-to-day. If it ever is, it is a Reports module enhancement, not a separate analytics surface.

**Client portal (login for pet owners).** Explicitly deferred to post-V2_CUTOVER (PET_OWNER_PORTAL_LIVE milestone). This requires a separate auth surface, booking infrastructure, and client data-handling agreements. Do not design or build any part of it in v2.0.

**Marketing automation.** Audience filters and bulk SMS are on the roadmap (AUDIENCE_FILTERS_LIVE) but not in v2.0. The lapsed-client list in Reports gives Samantha enough to do manual outreach.

---

## 9. Open questions for Russell and Samantha

These must be resolved before V2_DESIGN_LOCK is formally closed. There are six. No more are needed.

**Q1 — Repo strategy.** Does v2 live in the same `russell-labs/tidy-tails` repo under a `v2/` directory (or `next` branch), or in a sibling repo `russell-labs/tidy-tails-v2`? **Recommendation:** same repo, `v2/` or `app/` subdirectory, separate Vercel project pointing at that path. This keeps the context unified and avoids splitting the CLAUDE.md / doc set.

**Q2 — Vaccination tracking scope.** Which vaccines does Samantha actually track? The spec adds a `vaccinations` table with free-text `vaccine_type`. If she only tracks Rabies and Bordetella, structured fields on the `pets` table (`rabies_expires_at`, `bordetella_expires_at`) are simpler. **Ask Samantha:** Which vaccines do you check for? Is a table with any vaccine type right, or do you only ever care about 2–3 specific ones?

**Q3 — Lapsed-client definition.** The spec defaults to 90 days as "lapsed." Is this right for Samantha's business? A show dog might come in every 3 weeks; a once-a-year client is not lapsed at 90 days. **Ask Samantha:** How do you think about a client you haven't seen in a while — is there a number of days where you'd want a reminder to reach out?

**Q4 — SMS default template.** The spec proposes: `"Hi [first_name], just a reminder that [pet_name] has a grooming appointment [date_string]. See you soon! — Samantha"`. **Ask Samantha:** Does that sound like you, or do you want to see something different? (She can edit it in Settings either way, but the default should feel like hers.)

**Q5 — v2 URL.** Where does Samantha access v2? Options: (a) same GitHub Pages URL, just with the new app served (complicated — GH Pages is not great for Next.js), (b) a custom domain like `app.tidytails.ca` or `tidytails.samanthasgroom.com`, (c) `tidy-tails.vercel.app`. **Recommendation:** register a simple domain or use a Vercel subdomain. Samantha should bookmark a clean URL, not a GitHub Pages path.

**Q6 — Parallel run timeline preference.** The spec mandates 7 days of clean parallel run before v1 decommission. Russell: is 7 days right, or do you want a longer overlap?

---

## 10. CC build plan outline

Break into milestone ships that can each be independently deployed and tested. Each ship has a clear "done" state.

### Ship 2.1 — Scaffold

**What ships:** A Next.js 14 app on Vercel that renders a blank authenticated shell. Supabase Auth wired up. Login screen works. Samantha can sign in with email/password. After login: an empty dashboard with "Tidy Tails v2" and a sign-out button.

**Done when:** Samantha's email/password pair logs in successfully. Session persists on page refresh. Sign-out works.

**Does not include:** Any real data, any modules, any RLS changes.

**Key files to create:**
- `app/layout.tsx` — root layout with Supabase Auth provider
- `app/(auth)/login/page.tsx` — login form
- `app/(app)/layout.tsx` — authenticated shell layout
- `app/(app)/page.tsx` — empty dashboard
- `lib/supabase/server.ts` and `client.ts` — Supabase SSR client setup
- `middleware.ts` — redirect unauthenticated requests to login

### Ship 2.2 — Auth + RLS (V1_HARDENED gate)

**What ships:** The `groomer_id` column added to all tables. All existing rows backfilled with Samantha's `auth.uid()`. All permissive RLS policies replaced with `groomer_id = auth.uid()` scoped policies. `client_overview` view dropped.

**Done when:** Samantha can log in and the data she sees is hers. An anonymous request to the Supabase REST API returns empty results (no data, not an error — RLS returns nothing).

**Important:** This is the schema migration that must be coordinated with v1 access patterns. If v1 is still live when this ships, v1 breaks (because v1 uses the anon key, which no longer has `groomer_id` in scope). Two approaches: (a) do this ship after v1 is decommissioned, or (b) keep a temporary permissive anon SELECT policy on top of the groomer policy during the parallel run, then drop it at cutover. Russell must decide.

### Ship 2.3 — Read-only client, pet, and appointment views

**What ships:** Client list with search. Client detail with pet cards and appointment history. Pet detail. All data is real Supabase data flowing through the authenticated v2 app.

**Done when:** Samantha can search for any client by name or phone, tap into their record, see their pets, see allergy flags prominently, and see their appointment history. No write capability yet.

**Key files to create:**
- `app/(app)/clients/page.tsx` — client list + search
- `app/(app)/clients/[id]/page.tsx` — client detail
- `app/(app)/clients/[id]/pets/[petId]/page.tsx` — pet detail
- `components/ClientCard.tsx`, `PetCard.tsx`, `AppointmentRow.tsx`, `AllergyAlert.tsx`
- `lib/queries/clients.ts`, `pets.ts`, `appointments.ts` — typed Supabase query functions

### Ship 2.4 — Appointment write flows + Intake

**What ships:** Quick-log appointment modal (add appointment from client detail). Intake form (new client + new pet). Edit client. Edit pet. Add vaccination record.

**Done when:** Samantha can complete her full daily workflow in v2 — look up a client, see their history, add a new appointment, and add a new client when needed.

**Key files to create:**
- `app/(app)/clients/[id]/add-appointment/` — server action and form component
- `app/(app)/intake/page.tsx` — new client + pet form
- `app/(app)/clients/[id]/edit/page.tsx` — client edit
- `app/(app)/clients/[id]/pets/[petId]/edit/page.tsx` — pet edit
- `app/actions/appointments.ts`, `clients.ts`, `pets.ts` — server actions for all writes

### Ship 2.5 — SMS

**What ships:** "Send reminder" button on client detail. Bottom-sheet SMS compose with editable message. Server action calling the existing `send-sms` Supabase edge function. Toast confirmation.

**Done when:** Samantha can tap "Send reminder" on a client page, see the pre-filled message with their name and pet name, edit if needed, and send. Twilio delivers the message.

### Ship 2.6 — Reports

**What ships:** Revenue report with date-range picker. Appointment list with CSV export. Lapsed-client list (configurable threshold, default 90 days). Send-reminder action from lapsed list.

**Done when:** Samantha can check her monthly revenue total, export her appointment list as CSV, and see which clients she hasn't seen in 90+ days.

### Ship 2.7 — Parallel-run readiness

**What ships:** PWA manifest + service worker (basic offline read cache). Settings page (account, SMS template edit, lapsed-client threshold). Performance pass — ensure client search is under 2 seconds on a mid-range device on 4G. Final QA pass by Russell using the real Samantha-as-persona.

**Done when:** Russell signs off that every daily flow works without fallback to v1. Parallel run begins.

---

## 11. V2_DESIGN_LOCK acceptance criteria

Design lock is achieved when ALL of the following are confirmed:

**Documentation:**
- [ ] This spec has been reviewed by Russell and any corrections applied.
- [ ] `docs/DECISIONS.md` has logged: repo strategy (Q1), auth provider (already decided — Supabase Auth), vax tracking approach (Q2).
- [ ] ROADMAP.md updated: V2_DESIGN_LOCK moved from "Next" to "Done" upon close.

**Pre-conditions:**
- [ ] V1_HARDENED milestone criteria met (R-1 RLS risk closed, `client_overview` SECURITY DEFINER fixed, Workstream B reconciliation phases complete).
- [x] Pawfinity logged-in recon (Workstream C) complete. Artifacts: `_reports/2026-05-15-pawfinity-logged-in-recon.md` and `_reports/2026-05-15-pawfinity-v2-implications.md`. Feature findings support the existing direction: do not clone Pawfinity; keep v2 centered on search, pet safety cards, quick logging, SMS, lapsed clients, vaccination status, and simple revenue.
- [ ] Phase 2–4 reconciliation SQL written and approved (not necessarily executed — but the plan must exist so v2 starts on a known-clean database plan).

**Open questions resolved:**
- [ ] Q1 — Repo strategy decided and logged.
- [ ] Q2 — Vaccination tracking scope confirmed with Samantha.
- [ ] Q3 — Lapsed-client definition confirmed with Samantha.
- [ ] Q4 — SMS default template confirmed with Samantha.
- [ ] Q5 — v2 URL / domain decided.
- [ ] Q6 — Parallel run timeline confirmed.

**Spec completeness:**
- [ ] All 10 sections of this spec reviewed and signed off.
- [ ] No open [TBD] blocks remain in this document.
- [ ] CC build plan (Section 10) reviewed by Russell. Ship order and scope of each ship confirmed.

**Design lock declared by:**
Russell Cole in `docs/DECISIONS.md` — entry: `[YYYY-MM-DD] V2_DESIGN_LOCK achieved`.

---

## Appendix A — Supabase project reference

| Item | Value |
|---|---|
| Project ref | `pgkwovokciaqnbhpttba` |
| Region | us-east-1 |
| Dashboard | `https://supabase.com/dashboard/project/pgkwovokciaqnbhpttba` |
| v1 anon key | In `client.html` and other v1 HTML modules. Do not commit to repo beyond v1 HTML. |
| Edge functions | `send-sms` (Twilio), `notify-sam-review-complete` (Resend — Workstream B only) |
| Backup (latest) | `venture-ops/backups/tidy-tails/2026-05-15/` — clients.csv 268 rows, pets.csv 352 rows |

## Appendix B — Pawfinity competitive reference

Pawfinity is the primary incumbent. Full recon in `docs/research/competitors/pawfinity-2026-04-26.md`. Key data points for v2 design:

- Their entry price ($55–$100/month + per-SMS surcharges) sets the market ceiling. Tidy Tails at $19–$29/month flat (candidate — not committed) is wide-open whitespace.
- Their signup is 30 fields. Tidy Tails intake should be completable in under 60 seconds.
- Their app is PHP-era. Their UX is a feature warehouse. Tidy Tails wins by being simple and fast, not by matching their feature count.
- The one gap where Pawfinity genuinely wins: online booking. Tidy Tails does not close this gap in v2.0 (Samantha does not want it). This becomes relevant at LICENSEABLE_READY when the second groomer may want it.

Logged-in recon was completed read-only on 2026-05-15. See:
- `_reports/2026-05-15-pawfinity-logged-in-recon.md`
- `_reports/2026-05-15-pawfinity-v2-implications.md`

Net design-lock implication: Pawfinity validates the feature category, but its breadth is not the v2 target. Tidy wins by being the five-minute daily groomer cockpit Pawfinity cannot become without shedding most of itself.

---

*Generated by Cowork 2026-05-15. This spec is the input to V2_DESIGN_LOCK. It is not executable until Russell reviews the open questions and closes the acceptance criteria checklist.*
