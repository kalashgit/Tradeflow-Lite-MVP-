# TradeFlow V0.6 — Mobile Command Center and Territory Map
Status: Implementation specification. Branch: feature/v05-map. Production Worker calm-rice-1ea7 MUST NOT be touched.

## Phase 1 — implement first
1. Upgrade current map to polished dark navy/teal real street map using MapLibre and a legally usable tiles/style provider. Keep existing offline-first CRM operational; if map tiles unavailable offline show an honest fallback. Do not imply map tiles are stored offline.
2. Keep ONE TAP on empty map: display temporary TradeFlow-branded marker (custom SVG/icon matching brand, not default map pin), coordinates, nearest available address via reverse geocoding with attribution and rate limits; if unavailable say "Address unavailable" and retain coordinates. Address is approximate, not necessarily the exact building. Present Save location, Create opportunity, Link customer, Link job. Only persist after user chooses an action. Tapping existing markers opens their details. Avoid accidental multiple pin creation during gestures.
3. Standardize five fixed mobile navigation icons: Home=house, Map=map, Opportunities=radar, Finance=wallet, More=settings. No horizontally scrolling tab bar. Home is command center and links to Customers, Quotes, Jobs, Tasks with clear back navigation.
4. Replace decorative portfolio bars with real dated interactive line/area financial chart in TradeFlow dark theme, with 1W/1M/3M/6M/1Y/All periods and Revenue, Expenses, Profit, Quoted Pipeline metrics. Quotes are NOT revenue. Empty history must show honest zero/empty state. Preserve records and export/import.
5. Mobile PWA polish: prevent layout overflow and accidental zoom without blocking accessibility text zoom. Map pinch-to-zoom stays enabled.
6. Keep existing opportunities import workflow; show only approved, correctly classified research records, and place pins only when credible coordinates exist. Initial target package up to 50 approved records per trade/territory. "Explore more" is an informational placeholder, NOT a live payment flow.

## Phase 2 — architecture only, do NOT implement game now
Territory League: per trade and selected city; business brand colors; saved/prospecting buildings versus user-reported completed jobs versus externally corroborated completed jobs clearly differentiated. A tap/save never proves completed work or legal ownership. Territory percentages require explicit geographic denominator (city boundary or defined cells), and transparent coverage rules. Privacy-safe public leaderboards only with opt-in and anti-spam verification. Map polygon/building highlights later. Source adapters for city permits, inspections, completions, with provenance and confidence; permits and final inspections do not always prove who performed the work. Plan to scale by jurisdiction, not hardcode Austin.

## Engineering and release guardrails
- First inspect app.js, index.html, style.css, sw.js, manifest and wrangler.jsonc, and current data schema.
- Preserve existing local data and backup behavior; never clear localStorage or change schemas without migration.
- Keep preview Worker name tradeflow-v05-preview; do not modify main or production Worker calm-rice-1ea7.
- Use legally licensed map tiles and geocoding, with attribution and no hardcoded secrets; disclose online requirements.
- Implement Phase 1 in small testable commits. Validate JS syntax, responsive layout, CRM functionality, import/export, map interactions, errors, and accessibility.
- Do not deploy without user approval. Report files changed, test results, limitations and risks.
