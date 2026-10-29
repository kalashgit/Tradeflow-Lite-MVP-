# TradeFlow engineering continuation — 29 October 2026

This is the current handoff. Read this before older handoffs; the verification ledger is chronological and earlier states are superseded by later entries.

## Source and deployed preview

- Repository: `kalashgit/Tradeflow-Lite-MVP-`.
- Branch: `feature/library-universal-intake`.
- Application commit: `9136f739a551ec55a8d9d11defad61fae3893030` — owner-reviewed, backup-gated local record transfer.
- Evidence documentation: `a3e755b70cf94c4e08098464e28049b9c214c2b9`.
- Actions run: https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/40865508322 — succeeded.
- Preview: https://tradeflow-library-pilot-preview.bartoszszarafinski.workers.dev/
- Worker: `tradeflow-library-pilot-preview`, version `a9e836fd-75ec-4781-a673-579bc1085279`.
- Exact deployed application SHA and all 84 public asset digests independently verified. Later docs-only commits do not imply redeployment.
- Protected production: `calm-rice-1ea7`. Never modify or deploy.

## Latest user instruction and authorization

The user approved the concrete proposal to create **one new empty TradeFlow Pilot workspace** (`tradeflow_pilot_001`) and give their independently verified designated iCloud identity owner access **to that workspace only**. The approval was: “Sure keep running tasks and complete all”. They then requested: “Save what has already been done so my chat engineer can continue”.

**Provisioning was NOT executed.** No business or owner membership was created. Approval is recorded; do not ask for the same approval again. Before execution, independently recheck the exact Access identity/policy, target database, migration checksum and absence of the proposed business. Do not infer ownership from client-supplied identity/email. Do not expand this approval to another business, other users, Cloudflare administration, production or customer uploads.

The private, concrete proposal with verified issuer/subject and identity evidence is retained in the current workspace at `/workspace/artifacts/tradeflow-next-tasks/owner-provisioning-proposal.json` (not committed). If that artifact is unavailable to the next engineer, reacquire the designated identity through authorized Cloudflare management APIs and successful authentication logs; do not guess it. No tokens, cookies or OTP codes are needed in chat.

## Completed foundation

1. **Release stabilization:** failure-preserving CI shell, exact source manifest and all-asset verification, bounded rollout retries, browser release gates.
2. **Local recovery:** checksum-validated export, reviewed restore, pre-restore recovery snapshot, transactional rollback and browser/offline checks. IndexedDB remains `tradeflow-lite-v1`, schema **9**.
3. **Account UI/API:** existing Settings Account sign-in/status/logout, verified Cloudflare Access assertions, tenant memberships, fail-closed session handling. Official Access metadata/log confirmed successful designated-user sign-in; missing membership is the current cloud-access blocker.
4. **Tenant persistence:** shared catalogue of 20 business record types, linked-record validation, revision/CAS writes, execution-time membership checks and stronger permissions for newly supported financial types.
5. **Offline queue:** opt-in persistent operations, leases, bounded retries, conflict retention and verified read-back. No global automatic synchronization is enabled.
6. **Events/actions:** transaction-coupled local GUI/core event journal, deduplication and bounded read-only operational-intelligence review through the existing command registry/permissions. Existing Notifications reused.
7. **Reviewed cloud transfer:** Settings → Backup & restore → Review cloud transfer. Owner chooses business, explicitly opts into mapping `local-business`, reviews actual remote comparisons, downloads backup, acknowledges saving it and confirms transfer. Snapshot/identity-bound atomic staging; dependencies first; only approved operations drain; conflicts do not overwrite; repeated submission reconciles without duplicate writes. Original local records remain unchanged.

### Primary implementation files

- `public/local-recovery.js`, `public/account-session.js`
- `public/record-model.js`, `public/offline-conflicts.js`, `public/sync-queue.js`
- `public/migration-preview.js`, `public/migration-ui.js`, `public/migration-ui.css`
- `public/business-events.js`, existing `public/command-registry.js` and `public/core-integration.js`
- `public/app.js`, `public/index.html`, `public/sw.js` — existing UI/cache integration, no redesign
- `src/tenant-api.js`, `src/tenant-record-store.js`, `src/schema-capabilities.js`
- `src/oidc-verifier.js`, `src/tenant-security.js`, `src/backup-snapshot.js`
- `migrations/0003_extended_business_records.sql`
- `.github/workflows/library-pilot-preview.yml`, `automation/preview-release.cjs`
- `tests/reviewed-transfer.test.cjs`, `scripts/verify-cloud-transfer.cjs`

Read `docs/REVIEWED_CLOUD_TRANSFER.md`, `docs/EXTENDED_RECORD_MODEL.md` and `docs/TRADEFLOW_VERIFICATION_LEDGER_2026-10-29.md` for details.

## Actual infrastructure changes

Only isolated pilot D1 database `tradeflow-pilot-isolated`, ID `91eeef63-48d4-4925-a2f1-1a43b164754c`, was migrated. Preflight showed zero businesses, memberships, records and audits. A protected empty-schema recovery snapshot was saved and reconstruction tested. Migration 0003 applied in one REST batch with an empty-data CHECK guard, retained index/audit triggers, and journaled checksum:

`e19a6c3d3016403357488db2159d5ff3643672f6b6b2c4908a37a036cc69add0`

Readback confirmed 20 supported types, zero business/membership/record/audit rows, no FK errors and no staging tables. Runtime extended-type activation additionally requires the exact migration journal ID/hash; a config flag alone cannot activate an unmigrated schema. Backup server export/dry-run flags remain off. Production was untouched.

Cloudflare Access application ID: `ef3a7b4d-4515-4cd6-adc6-bd0d98124e94`. Existing successful sign-in evidence was observed at `2026-10-29T09:33:22Z`; recheck fresh metadata before provisioning.

## Executed validation

- Full Node suite: **290 passed, zero failed** locally and CI.
- SQL tests: schema expansion preservation/rollback, revision control, isolation, revoked membership and financial permissions passed.
- Ten targeted contractor regressions: **10/10**.
- Chromium contractor scenarios: **20/20** across phone/desktop; synthetic records, not measured contractor outcomes.
- Browser recovery/offline reload: passed on phone/desktop.
- Reviewed transfer: actual UI/IndexedDB, explicitly synthetic authenticated API/session fixtures, phone/desktop. Backup/approval gates, parent order, replay, unchanged local data and expiry denial passed.
- Live fresh phone browser: completed synthetic local-only onboarding, opened actual deployed Settings transfer screen, observed owner-membership requirement and no anonymous transfer controls; no horizontal overflow.
- Initial live smoke failed because it tried Settings before onboarding; corrected test setup passed. No production defect was concealed.
- Physical Safari, real signed-in transfer and multi-device consistency are **not yet verified**.

Local evidence directory: `/workspace/artifacts/tradeflow-next-tasks/` (not Git; may not transfer to another runtime). Includes `transfer-ci.log`, `final-full.log`, browser results/screenshots, `live-transfer-390.png`, protected provisioning proposal and schema readbacks. The workflow uploads regression/browser artifacts to the linked Actions run. No raw credentials are in this handoff.

## Next dependency-aware tasks

1. Execute the **already approved** empty-workspace/one-owner provisioning after fresh checks. Use an atomic, guarded D1 write and audit it; stop if the identity, scope or target differs. Read back exact membership/business and ensure no customer records were changed. Keep identity details out of public Git.
2. Have the actual authorized session read `/api/v1/me` and confirm the intended business/owner/capabilities. Never forge a browser token or treat management-API readback as a real user-session test.
3. Use the in-app transfer review/backup/confirmation with the owner for any actual records. The prior approval covers workspace access only, not automatic customer-data upload.
4. Complete secure cloud-to-device retrieval and explicit multi-device revision/conflict resolution using existing stores/APIs, not a second CRM. Current feature is a **one-time copy**, not full synchronization.
5. Extend event coverage to legacy direct/bulk/delete paths and browser-independent durable processing; current read-only local consumers require app activity.
6. Continue the ten workflows through real permissions/recovery/mobile acceptance, then authorized provider integrations and intelligence coverage. Never claim external sends, bank settlement or automation success without provider evidence.
7. Locate original 62-item research register in the user's Library/TradeFlow and map exact references. **0/62 pain points retired**; no contractor outcomes invented.

## Limits and guardrails

- Transfer limit: 200 business records per review, 30,000 bytes per record. No silent truncation.
- Settings, command journal/local audit and Library files are not transferred. Cycles, missing links and conflicting remote records block migration; manual merge/large-dataset tooling remains open.
- No automatic pull/sync, background server scheduler, broad automatic modification permissions or completed autonomous system.
- Live AI health previously showed binding present but secret not configured. No live sending/payment/provider success claimed.
- Keep established UI, navigation, microphone/Flow Wave and existing functionality intact.
- Do not overwrite user data, silently migrate browser storage, grant extra access or add recurring costs.

## Workspace continuation

Active worktree: `/workspace/Tradeflow-flow-wave`. Source and docs are pushed to the assigned branch. Other worktrees contain older unfinished work, especially `/workspace/Tradeflow`; preserve them and inspect before reuse. Do not reset or delete them. The original work was not blindly merged.

Useful commands (from active worktree):

```sh
npm test
npm run test:storage
npm run test:contractors
npm run test:browser
NODE_USE_ENV_PROXY=1 node automation/preview-release.cjs verify https://tradeflow-library-pilot-preview.bartoszszarafinski.workers.dev
```

Use `npm ci` for pinned dependencies. CI is Node 22. This runtime's existing browser installation was used via `PLAYWRIGHT_MODULE=/workspace/Tradeflow-lead-discovery/node_modules/playwright`; that path is environment-specific. Use failure-preserving shell (`set -euo pipefail`) for test output pipelines. Deploy only through the guarded pilot workflow; do not use an unqualified deploy command targeting the base Worker.
