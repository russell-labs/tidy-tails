# TT-041 home assistant launcher — screenshots

Mobile width (390px) for the home-screen assistant launcher (collapsed ↔
expanded). Captured against fixtures (anonymized demo data — no real customer
info) with the dev server in auth-bypass mode AND the assistant feature gate on
(the launcher only renders when `TIDYTAILS_ENABLE_AGENT=on`):

```bash
cd v2 && TIDYTAILS_ENABLE_AGENT=on TIDYTAILS_E2E_AUTH_BYPASS=on npx next dev --webpack --port 3111
# then screenshot http://localhost:3111/
```

- **collapsed.png** — the slim, composer-style launcher under the Contacts
  section: one "Ask about your business…" bar with the read-aloud + mic glyphs,
  nothing else. With the gate off this is byte-identical to today's home (no bar).
- **expanded.png** — tapping the bar expands it in place into the full assistant
  thread, boxed in its own card (`<AssistantChat embedded>`), with a Minimize
  control. Read-only capability line and confirm-before-write safety are the
  same as the `/assistant` route.

Isolation verified live (this is what the `embedded` prop exists for): with the
chat expanded, `document.body.dataset.tidyAssistant` stays `undefined` (no body
flag → the app shell is NOT pinned to 100dvh), the page grows and scrolls
normally (`scrollHeight` 844 → 1182, `window.scrollY` moves), and the bottom nav
is never pushed. The embedded chat scrolls its own transcript inside a
`max-h-[70svh]` card. Writes shown read-only because the agent-writes gate is off.
