# Pilot foundation verification

2026-10-18. Scope: development branch `feature/v05-map`, preview Worker `tradeflow-v05-preview` only.

## Automated checks before commit

- `node --test tests/*.test.cjs`: **50 passed, 0 failed**, across all 32 test files. The 21 new cases cover parsing and ambiguous intent/records, context, relationship and scope checks, draft defaults, approval binding, repeat and concurrent execution, stale approvals, audit/storage failure, hard priority constraints, deduplication, detector failures, partial invoice balances, and backup/restore preservation.
- Syntax checks pass for app, command registry, intelligence, core integration, calendar, revenue, suppliers and service worker.
- `git diff --check` passes. No IndexedDB schema/version changes, business-record migrations or production deployment configuration changes.

## Actual rendered browser checks

Headless Chromium with real browser IndexedDB, using disposable profiles and test-only records. The app never seeds these records.

- At 320, 390 and 1440 CSS pixels: initialize the real app, evaluate all five findings, preserve header and five navigation destinations, reject ambiguous record opening, resolve selected quote context, and prepare the existing task form with verified customer/quote links.
- Reads, navigation, filters and draft preparation leave every business store unchanged. Explicit Save rejects a mismatched customer and then creates the correctly linked task after correction.
- Quotation conversion requires explicit approval. Repeated calls create one linked job; the journal records prepared → approved → executing → succeeded.
- Overdue invoices include a partially paid balance. Opening existing customer and calendar records reuses existing screens. Calendar context resolves the selected event, retains the four day/week modes and has no page horizontal overflow.
- In two actual browser tabs: one journal claimant navigates, concurrent approved quotation requests produce exactly one job, and a quote changed after approval returns stale without executing.
- Customer-derived quotation opens an unsaved form with a blank price.
- Service-worker cache v95 installs both new modules. Offline reload, command navigation and all detector adapters work without network. No browser page errors were observed.
- Mobile draft, mobile header/Home and desktop Home screenshots were inspected. The draft capture uses reduced motion to show the settled dialog.

Artifacts supplied with the handoff: `browser-verification.json`, `browser-concurrency.json`, `verified-draft-mobile.png`, `header-mobile.png`, `home-desktop.png`. The browser scripts are also retained with these artifacts for reproduction.

## Deployment evidence

The existing preview guard and fixed Worker target remain intact. CI now runs the foundation tests and compares all nine live foundation assets against the checkout using SHA-256 after deployment. The deployment run, commit and independently checked live preview are reported in the final handoff; local checks alone do not establish deployment success.

## Limits

Physical iPhone Safari/PWA checks remain outstanding. Chromium viewport checks do not certify real-device Safari behavior. There is no new command UI, model/voice integration, cloud execution, external communication, multi-user authorization, persisted finding dismissal or recovery/undo UI. Legacy mutations outside the approved quote handoff remain on their existing paths. See `TRADEFLOW_PILOT_FOUNDATION.md` for the interfaces and detector limitations. Production remains outside this work.
