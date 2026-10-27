# TradeFlow — Library & Universal Action System (MVP Sprint 01)

Status: **Design baseline / implementation pending**. Approved direction on 2026-10-28. This document is NOT a claim that these features are live.

## Canonical deployment and branch
- Repository: kalashgit/Tradeflow-Lite-MVP-
- Existing working integration baseline: feature/v05-map
- New isolated feature branch: feature/library-universal-intake
- Cloudflare preview: tradeflow-v05-preview (do not overwrite during development)
- GitHub main is the older v0.4 deployment kit. Do NOT blindly merge it into or over the preview branch.
- Existing CI at .github/workflows/deploy-tradeflow-preview.yml deploys only feature/v05-map; this branch must not deploy automatically.
- Preserve local IndexedDB records, migrations, exports, service-worker scope and the independent Austin E01 research data.

## Experience / navigation contract
- Retain Home / Map / Calendar / Finance / More tabs unchanged.
- Keep existing graphite/near-black + cyan/teal theme, native-feeling iPhone spacing, icon styles, border radius and typography.
- Add a small Import quick action to Home near the Master Intelligence entry, without moving key metrics or creating extra overlays.
- Add Library near the top of More, using existing row/icon patterns. Do not add a sixth bottom tab.
- Library: Search; 'Add information to TradeFlow'; Import files; Scan document; default folders Jobs & Projects, Customers, Opportunities, Quotations & Invoices, Other Documents; user-created folders later.
- Display capabilities in a searchable, collapsed directory under More; DO NOT delete or orphan functioning existing modules or data. Remove legacy category headings only after routing parity is verified.
- In Library distinguish source documents/files from normalized operational records. An uploaded document is not automatically trusted permanent AI memory.

## Implementation sequence — vertical slice
1. Inspect live branch source for existing file import, photo capture, OCR, opportunity mapping, calendar and voice modules; reuse those adapters instead of rewriting.
2. Build a single library entry view and Home import shortcut behind an additive feature flag; preserve old views.
3. Build **offline CSV preview first**: header normalization and mapping, recognized row types, schema validation, deduplication and human-readable exceptions. Never run untrusted CSV formula cells as code.
4. Prepare import plan with accepted/skipped/needs-review counts; show a single approval summary. Commit all accepted local records atomically; keep original file metadata/provenance, idempotency key and rollback / restore plan.
5. Link confirmed jobs to Jobs; create Calendar event only if a trustworthy appointment start date + time exists. Date-only is a dated job, not an invented timed appointment. Closed jobs do not receive future events.
6. Map: reuse saved coordinates; normalize addresses; cache resolved lat/lon + source; distinguish Verified precise pin / Approximate area indicator / Unresolved list record. Never invent house-number or property placement. Red location marker is an exception/needs-review state, not evidence of accuracy.
7. Same operation through typed command and voice: UI button -> typed action input -> safe command intent -> identical authorization, validation and idempotent execution. Unsupported speech/offline transcription must have explicit manual fallback.
8. Photo/OCR: audit existing capture first, then extraction with document evidence and per-field review. Never claim Google Lens parity.
9. Tests: CSV fixture with 100 mixed dated/undated/duplicate/ambiguous jobs; offline reload; interrupted import; idempotent replay; iPhone 320/390 CSS width; no cross-record corruption; mock speech vs typed path parity; no voice side-effect without consent.
10. CI on isolated branch first. Preview promotion only after explicit comparison with deployed assets, passing complete tests and owner approval.

## Shared capability-action contract
- Registry entry: id, short human label, read/write permissions, input schema, parse/validate, preview, execute, idempotency key, undo/reconcile, supported offline mode, and voice aliases.
- Voice is **transport/recognition input**, not a distinct set of business operations.
- One command can generate a plan with several dependent actions but mutation must be ordered and transactional where possible.
- Keep user approvals explicit for external communications, financial actions, bulk changes and ambiguous dates/locations.
- Local storage is currently origin-specific; cloud memory and cross-device sync are separate future workstreams.

## Pilot capability choices (conditional on existing-module audit)
Commercial workflow objectives: (1) business context/memory, (2) lead capture & qualification, (3) quotations and follow-up, (4) jobs and assignments, (5) calendar scheduling, (6) field photo evidence, (7) invoices & receivables visibility, (8) opportunity intelligence with verified mapping, (9) owner notifications / approvals, (10) authorized business Q&A and action proposals.
Treat Library, reliable CSV ingestion, single action registry, permissions and voice entry as **shared infrastructure**, not eleven separate products. Preserve existing Finance/Map/Calendar core screens.

## Known command evidence
- docs/COMMAND_EXECUTION_COVERAGE.json on feature/voice-intelligence-integration: 361 utterances, 253 execution-tested in synthetic Chromium app, 89 ambiguous/misaligned, 14 need parameters/confirmation, 3 interpreted only, 2 unsupported.
- Those test results are NOT physical iPhone speech transcription results. Merge adapters selectively after reviewing the branch; do NOT blindly replace current v05-map preview.

## Acceptance / release gates
- No unapproved data loss or duplicate jobs/events after repeat import.
- Every created calendar entry traces to an explicit source date/time and linked job ID.
- Map never silently plots exact property from approximate or contradictory evidence.
- All Library actions work with tap; voice/typed commands reuse the same executor.
- Existing Home/Map/Calendar/Finance screens and previous data remain intact.
- Source-matched deployed asset hashes and live smoke checks before saying it is released.
- Budget: €0 target, €30 hard ceiling; no unapproved paid APIs.

## Status
Design baseline committed only. No UI or database migration executed. Preview and production untouched.
