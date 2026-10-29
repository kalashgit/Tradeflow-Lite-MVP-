# Master implementation baseline — 29 October 2026

## Architecture and dependency assessment

- Browser: `public/app.js` owns routing, forms and IndexedDB `tradeflow-lite-v1`, schema 9. Feature globals extend existing screens. `core-integration.js` provides transaction-safe business operations; `command-registry.js` provides plans, approvals and execution; many older GUI writes still call IndexedDB directly. These are integration boundaries, not interchangeable authorization systems.
- Documents: `public/library.js` has a separate, local `tradeflow-library-v1` database. A folder visible on the owner's device is not automatically readable by the server or this workspace.
- Intelligence: `operational-intelligence.js` is a pure record-based detector registry; `notifications.js` supplies existing findings and task reconciliation. Voice/text uses existing launch-command adapters and core commands. Reuse these rather than introducing another notification inbox or CRM.
- Server: `src/index.js` routes the private AI preview and `tenant-api.js`. Signed Access assertions are verified against pinned issuer/audience/JWKS. D1 membership scopes four record types; optimistic revisions and SQL audit triggers exist. The UI currently does not sign in to or synchronize with this API.
- Recovery/offline: tenant snapshots, recovery planning and conflict classification are pure helpers; these do not implement durable browser queues or an actual restore. Local restore currently clears stores after a shallow validation and confirmation, so recovery safety needs implementation before migration or automatic sync.
- Infrastructure: isolated pilot Worker/D1 only. Existing backup enable flags stay false. Production, ownership, memberships and customer communications remain untouched.

Dependency order: reproducible CI/deployed provenance → verified recovery and durable change tracking → authenticated sessions and approved owner mapping → opt-in migration/sync → durable events and authorized actions → ten real screen scenarios → provider-backed operations and intelligence orchestration. Work can proceed on isolated prerequisites while human identity or research evidence is unavailable; dependent capabilities must stay disabled.

## Baseline execution

Source: `90efa2e93978d2fe8d19ad4a295232c6796bad8d` (fast-forwarded clean active worktree; older unfinished `/workspace/Tradeflow` modifications preserved).

- Local Node 24 baseline: 238 pass / 2 fail, matching prior GitHub Node 22 failure run 40851308605.
- Fix 1: AI preview test now imports the real ES-module Worker and its actual tenant router, rather than evaluating an import-containing script through VM.
- Fix 2: tenant PUT test distinguishes unsupported content type (415) from missing required revision in valid JSON (400). Neither production authorization nor validation was weakened.
- Stabilized Node suite: 240 pass / 0 fail. Python SQLite schema/revision/audit check passed. All 10 filtered contractor regressions passed.
- CI now checks out the triggering SHA, limits dispatch to the approved branch, generates a non-secret release manifest and verifies every deployed public asset's digest. This prevents success claims from stale version labels.

Evidence: `/workspace/artifacts/tradeflow-master-2026-10-29/`. Local checks do not establish the new commit's CI or deployment; those are recorded separately in the verification ledger after actual completion.

## Open blockers and debt

- User reports `/api/v1/me` returns “not found”; investigate actual deployed Worker and Access configuration before attributing it to credentials.
- Human OTP login and independently authorized business owner provisioning have not been demonstrated. Never invent a subject or grant membership from a client field.
- No automatic sync; only customers/jobs/quotes/invoices currently map to D1. Payments/tasks/events and linked integrity require explicit model work.
- No durable browser outbox, no server action queue, no transactional domain event outbox, no provider acknowledgments for external communications/payments.
- The 62-entry register was not found in repository/history-visible files or available attachments. Owner says it is in “Library / TradeFlow”; exact library is being clarified. TF-P01..10 remain provisional. No retirement claims.
- Physical iPhone, real contractor acceptance, measured outcomes and real provider consent remain unverified.
