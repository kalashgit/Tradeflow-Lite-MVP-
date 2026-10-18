# TradeFlow Graphite V2 — implementation and verification

2026-10-18. Development branch: `feature/v05-map`. Deployment target: `tradeflow-v05-preview` only.

## Change scope

- `public/graphite-theme.css`: shared neutral tokens, surface recipes, geometry, typography, focus and selected states across Home, Calendar, Map chrome, Finance, Suppliers, record forms, invoices, job costing and other existing workspaces. Dialogs mounted outside the main content receive the same tokens. Retired Business Missions sidebar entry stays hidden.
- `public/appearance-theme.js`: keep the saved original accent and derive readable accent/button colors against graphite. Neutral border/text roles belong to CSS, not the accent engine.
- `public/app.js`: replace only the map search arrow glyph with an equivalent outlined SVG; no handlers, business logic, database definition or records changed.
- `public/index.html`, `public/sw.js`: version changed assets, precache the graphite stylesheet and use network-first updates with an offline fallback. Cache v93 is separate from the unchanged IndexedDB schema v9.
- `public/manifest.webmanifest`: align the installed PWA launch canvas with graphite.
- `tests/appearance-theme.test.cjs`: verify 12 user accents against all four graphite surfaces and ensure applying an accent does not overwrite neutral roles.
- Design baseline updated to the user's latest V2 tokens.

## Verification

- All 29 existing Node test files pass (`node --test tests/*.test.cjs`). Syntax checks pass for the changed JavaScript and service worker. `git diff --check` passes.
- Headless Chromium: Home at 320, 375, 390, 430 and 1440 CSS pixels. Computed canvas, section, card and border match the supplied tokens; ordinary KPI cards have no background gradient or shadow. Fixed header brand position preserved when toggling intelligence actions.
- Calendar at 320, 390 and 1440: all five existing view modes; create/edit an event, switch activity types, close the editor and retain the event. No page overflow or horizontally clipped editor controls. Scheduler tests pass; no calendar behavior was rewritten.
- Map at 320, 390 and 1440: real map tiles loaded; search, tools and zoom do not overlap; filters open/close. Tile style, features, routing and markers unchanged.
- Sixteen existing record/navigation workspaces inspected at 320, 390 and 1440. No document horizontal overflow. Revenue, Suppliers and dialog screenshots visually reviewed.
- UI-driven checks at 320, 390 and 1440: save an expense after changing category; create a customer through More; create a supplier; open/cancel a purchase order; save a purple accent via Settings, reload and verify the original preference, neutral KPI borders and record counts. Database remains version 9. Test records exist only in disposable browser contexts.
- Service worker enabled: precache completes, offline reload retains the graphite Home and Calendar navigation works.

## Limits

Rendered Chromium screenshots were reviewed. The reference decisions are implemented; pixel parity with the original image is not asserted. Physical iPhone Safari/PWA, keyboard/safe-area and touch validation remain for device review. WebKit could not launch in this environment because its system libraries are unavailable. No production deployment or production data access is part of this change.

Screenshots and browser audit artifacts are supplied with the engineering handoff. Live preview verification is reported with the deployment run and commit, separately from local verification.
