# TradeFlow General Application Engineering Contract

## Scope and route
The current app is the product. Inspect actual `public/app.js`, navigation, feature modules and tests before editing. The manager may assign a general-app increment; only the designated principal writer commits. AI specialist tools may be consulted read-only. No separate implementation branch unless specifically authorized.

## Target customer job
Owner of a 5–15-person commercial electrical contractor wants a truthful view of jobs, estimated vs recorded direct costs, approved changes and invoice readiness. This hypothesis comes from November 1 research; customer interviews, willing-to-pay, local SAM and measured ROI remain open.

## Sample thin vertical slice
Start from existing Job dossier → view linked quote, cost records, labor hours and material allocations → show variance/unknowns and missing approvals → review change order or invoice-readiness checklist → prepare an existing auditable command with explicit owner approval. Do not issue invoice or mark money collected merely because a job looks complete.

## App implementation checklist
1. Actual route/tab and visible mobile UI controls; don't click a hidden desktop navigation button in browser fixtures.
2. Durable record identity, business/tenant scope and permission checks at server and execution boundaries.
3. Explicit states for offline, queued, conflicted, awaiting review, externally verified, missing and unknown.
4. Failure-safe data entry; prevent duplicate writes on timeout/reload; preserve backup and old migrations.
5. No currency/profit/cash claims without verified source records; distinguish planned, committed, actual and collected.
6. Touch/keyboard/VoiceOver behavior; zero horizontal overflow; fast load/degraded experience.
7. Negative regression: mismatched business, role downgrade, stale revision, offline reload, missing required fields, duplicate command.
8. Focused Node regression, full `npm test`, `test:storage`, `test:contractors`, `test:browser`, actual latest SHA CI.

## Definition of completed
Product behavior reproducible in existing GUI with relevant source evidence and a tested failure path, exact-commit CI or honest unverified reason, no altered production environment. Synthetic examples never prove contractors have adopted the feature.
