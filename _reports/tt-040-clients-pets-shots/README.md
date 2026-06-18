# TT-040 redesign — home/search, clients, dog-profile (before/after)

Visual-only restyle of the home/search, client-profile, and pet-profile surfaces
to the approved full-app mockup (`design/2026-06-18-full-app-redesign.html`,
screens 01 / 05 / 06 / 11). Branched off the merged TT-040 foundation (PR #69),
which had already remapped the shared design tokens, so most of these surfaces
already rendered in the new language. This slice closes the remaining gaps.

Shots captured at 390px (iPhone width, matching the mockup) against fixtures
(anonymized demo data) with `TIDYTAILS_E2E_AUTH_BYPASS=on`.

## What changed (5 components)

- **AddHousehold** — trigger CTA went from a tinted outline to a solid brand
  primary with a plus glyph (`.tt-btn tt-btn-primary`), matching the mockup's
  home + empty-state "Add household" button. See `before/home.png` vs
  `after/home.png`.
- **VaccinationList** — separate stacked cards → one calm card with hairline-
  divided rows, mirroring the Details list and the mockup. Safety status pills
  (amber expiring / red expired / green current) are preserved. See
  `before/pet-vacc.png` vs `after/pet-vacc.png` (Mango, c04/p05).
- **HouseholdCard / PetCard** — card elevation moved from Tailwind `shadow-sm`
  to the kit's `shadow-soft` (the mockup's single calm card shadow). Subtle; see
  `before/client.png` vs `after/client.png`.
- **FirstRunEmptyState** — welcome glyph is now the Tidy Tails paw in a rounded-
  square brand-soft tile (was a generic user icon in a circle); title is bold.
  Matches mockup screen 11. Not renderable from fixtures (always has clients);
  verified via `components/FirstRunEmptyState.test.tsx` + the mockup. The paw is
  the same SVG the header logo already renders in every shot here.

## Safety signals (unchanged, still prominent)

- Allergy alert: red, 2px border (`before/pet.png` / `after/pet.png`, Olive
  c03/p04; also visible on `pet-vacc.png`).
- Vaccine warnings: amber "expiring" pill kept inside the new divided card.

`pet.png` (Olive, no vaccinations) is included to show the allergy alert is
untouched — before/after are effectively identical there by design.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` (1754 passing), `npm run build`
all green on this branch.
