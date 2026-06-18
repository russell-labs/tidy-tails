# TT-040 foundation — before/after screenshots

Mobile width (390px) before/after for the redesign foundation PR (#69). Captured
against fixtures (anonymized demo data — no real customer info) with the dev
server in auth-bypass mode:

```bash
cd v2 && TIDYTAILS_E2E_AUTH_BYPASS=on PORT=3100 npm run dev
# then screenshot http://localhost:3100/{,schedule} etc.
```

What each pair shows (foundation deltas only — screen content is owned by the
parallel screen sessions and is unchanged here):

- **home** — settings control → gear-in-circle; CONTACTS card now carries the
  `--shadow-soft` elevation (was flat); active nav tab → semibold.
- **schedule** — list cards pick up the soft elevation.
- **sheet-add-household** — Sheet title → 18px; chrome intact.
- **ios-install-card** (after only) — the install coach-mark rendered through the
  new `.tt-card` + (when an install event exists) `.tt-btn-primary` kit classes.
