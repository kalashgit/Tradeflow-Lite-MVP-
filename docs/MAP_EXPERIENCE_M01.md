# TradeFlow M01 — Map Interface & Road Route Preview

Status: implementation on \`feature/v05-map\` preview, not a commercial routing SLA.

## Scope

- Retains the existing TradeFlow logo and global navigation icons.
- Search bar now has only Search and Submit (the redundant filter button was moved to right-hand map tools).
- Dark map with restrained business pins and a collapsible smoked-glass card: peek / half / expanded.
- Card supports pointer drag handle, keyboard/tap expansion, phone/website/address/hours when those values are saved, and contact-safe external links.
- Map remains interactive behind the non-modal sheet. Business details are drawn from saved records; no fabricated data.
- Supplier editor can save category, preferred status, business hours and optional licensed business photos (HTTPS source or compressed local upload).
- An actual driving route is drawn only after a routing provider returns valid road geometry; solid GTA-inspired purple stroke with subtle dark casing. Supplier network connection lines are distinct from verified road routing.
- Route start defaults to saved headquarters coordinates; expanded card can set another selected location as starting point.
- Route estimates are those provided by the routing API and exclude live traffic. When unavailable, the location card provides an external navigation link.
- Location and route icons do not imply live driver tracking or carrier shipment status.

## Preview routing service (important)

M01 uses the public OSRM *demo* routing endpoint (\`router.project-osrm.org\`) for limited development testing only.

This is **not an appropriate commercial production routing dependency**. Before initial commercial release:
1. replace with a licensed routing provider or hosted OpenStreetMap/OSRM/Valhalla server;
2. handle rate limiting, commercial usage policy, uptime and error telemetry;
3. provide geographically validated ETAs and origin/destination choice;
4. test real iPhone/PWA drag, keyboard and map interactions.

The OSRM demo's driving graph is **not live traffic-aware**. Travel times are estimates and may differ from the road route a driver is permitted to take.

## Business photographs

No Google Maps or Google Earth imagery is scraped or silently republished.
Google imagery requires approved API integration, usage rights, attribution and configuration.
The card displays only a photo URL or user-uploaded picture stored in the supplier record; otherwise it shows a branded fallback icon. A photo does **not** prove that the selected coordinate identifies the same building. License/source checks remain the uploader's responsibility.

## Data integrity

- Supplier photo data remains on-device in IndexedDB and in manual export backups; sync is not included.
- No supplier business hours, phone number, website, route distance, or travel duration is invented when absent.
- Existing records and map pins are not reset by this UI update.
- Production remains unchanged until separate approval.

## Verification

\`node tests/map-experience.test.cjs\` checks route geometry validation, API errors, URL encoding, XSS-safe cards, source honesty, new supplier details, and wiring.
The preview deployment workflow runs this test and the existing suite.
