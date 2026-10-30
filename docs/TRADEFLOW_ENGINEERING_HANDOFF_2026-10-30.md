# TradeFlow — Master Engineering Handoff (2026-10-30)

**START HERE FOR THE NEXT ENGINEER.** This is a source-grounded continuity checkpoint, NOT a release approval. GitHub exact code/CI overrides statements in this document.

## Current remote state at handoff creation
- Repository: https://github.com/kalashgit/Tradeflow-Lite-MVP-
- Active PR: https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/16
- Branch: `feature/cloud-record-discovery` -> base `feature/library-universal-intake`.
- **Last verified code HEAD before this handoff commit:** `87e986c7a10a52b7ae7bf250004bf00846a1cf7d`.
- This handoff is itself a new Git commit: **re-fetch PR head for the true new SHA**. Do not mistake the pre-handoff code SHA for the new branch HEAD.
- Exact-code CI [run #252](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/41102038805) was **QUEUED at last check, NOT green**. Some recent runs remained queued for extended periods; investigate GitHub Actions availability. Do not assume queued jobs executed.
- Last unequivocally green historical code checkpoint: `15c28a0f93c86d4de2a6a2dcf2362cf4bc9c4036`, [run #240](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/41099697213): **433/433 full Node and 22/22 synthetic Chromium**, plus storage and contractor detector stages. Later code is NOT verified by that earlier result.
- PR stays **DRAFT / OPEN / UNMERGED / UNDEPLOYED**. Never merge, deploy, run production migration, send messages, handle payments/refunds or provision permissions without explicit founder authorization. Original research register: **0/62 pain points formally retired**.

## Roadmap and product vision
**Authoritative v1.1 roadmap:** https://docs.google.com/document/d/1_6HAHgumQ2EKrH4Yw2w-ZZ1CqVTMnfe_AVnrisaCX6o/edit (read successfully during this engineering work; successor should refresh live contents).

North star: **one unified offline-first, intelligence-native business operating system for US electrical contractors**, initially established contractors (~10–30+ employees per roadmap). Master Intelligence is the primary context and orchestration layer but does NOT execute its own business write logic. GUI, text and voice must all use the **existing shared authorization/command/receipt infrastructure**. Retain owner approval, permissions, provenance, revision checks, recovery, offline business usability, and premium fast GUI. BYOAI/BYOC/OAuth later, by tested dependency and contractor demand.

**Sequence to preserve**:
0. Reconcile GitHub/PR/exact SHA CI and implemented code.
1. Finish TF-H01 command authorization, concurrency, idempotency, stale approvals, atomic auditing, interruption recovery and TF-P01–P10 regression; begin role/tenant foundation TF-R01 without restarting.
2. Finish H02 record identity/ownership/revision compatibility, then H03 offline-first authenticated sync, conflict/revocation and crash recovery.
3. Build **Codex-led Master Intelligence**, read-only permission-filtered evidence first, then diagnosis/options/economics/uncertainty/typed proposals, *explicit approval*, existing command execution, verified receipt, correction/outcome.
4. Validate one BYOAI provider, one BYOC deployment path and OAuth integration under server credentials/scopes; avoid competing command engines.
5. Refine existing GUI/dossiers/text/voice.
6. Continuously validate synthetic automated tests, real devices, contractor operations and measured outcomes.

## Source code and existing foundations — inspect, do not rewrite
- `public/app.js`, `public/index.html`, `public/sw.js`, `public/local-recovery.js`: working local GUI, cached browser/offline access, IndexedDB **v9** and backup/restore; physical-device proof incomplete.
- `public/command-registry.js`, `public/core-integration.js`, `public/business-events.js`: shared proposal/explicit approval/execution/audit/reconciliation. **local-owner is not authenticated server identity/tenant boundary.**
- `public/operational-intelligence.js` and existing dossiers: synthetic/local read-only detectors, not full secure cloud Master Intelligence.
- `public/record-model.js`, `public/offline-conflicts.js`, `public/migration-preview.js`: business/record identity, offline revision/conflict evaluation and explicit mapping previews.
- `public/sync-queue.js`, `public/migration-ui.js`: opt-in persisted action intentions, lease/retry, remote readback, explicit conflict resolution and backup-approved one-time transfers; **NOT app-wide automatic sync**. `queued_local` is NOT external success. State projection: queued_local, syncing_unverified, conflict_needs_review, failed_needs_review, indeterminate, committed_verified.
- `src/tenant-api.js`, `src/tenant-security.js`, `src/oidc-verifier.js`, `src/tenant-record-store.js`, `src/schema-capabilities.js`: tenant/OIDC/revision API foundations. Not sufficient evidence that all multi-role/cloud writes enforce tenant isolation.
- `public/voice-command.js` and `public/launch-more-commands.js`: voice and local command/navigation surfaces, not a second AI writer.
- `public/integrations-v2.js`: integration catalog/manual handoff, not implemented OAuth provider connections. BYOAI provider adapter, full BYOC portability and real OAuth lifecycle unverified.
- Existing detailed docs: `docs/TF-H01-command-safety-hardening.md`, `docs/TRADEFLOW_UNIFIED_ARCHITECTURE_BACKLOG.md`, `docs/TRADEFLOW_V1_1_PRODUCT_EVIDENCE.md`.

## Ten contractor workflow candidates and research evidence
These have **synthetic engineering coverage**, not contractor adoption/verified financial outcome:
P01 quotation follow-up (register #2); P02 overdue invoice (#11); P03 standalone scheduling conflicts (#13); P04 change orders (#9); P05 job profitability (#12); P06 labor overrun (#7); P07 discrepancy review (adjacent to #22, not full remedy); P08 bid qualification (#4); P09 quotation reuse (#38); P10 customer profitability (#61).
Some contacts, labor and payments are **owner-attested/manual**, NOT verified message delivery, payroll, settlement or cash collection. Avoid invented ROI, customer payments, deployment or retirement of any of 62 pain points.

## Milestones and exact evidence
- `471373af`: TF-H01 guard against forged owner approval; 7 adversarial tests; CI #224 success.
- `ab776a84`: command capability guard at approval/recovery + 3 tests; CI #226 success, architecture backlog.
- `24fef213`: actual Chromium two-tab command contention; CI #228 success.
- `d387fcbf`: fail-closed machine-readable test-count verification; CI #230 success.
- `a37c79ff`: staged-write transaction rollback + test fixture syntax repair; CI #234 success.
- `57a919a5`: H02 business-scoped record identity and migration preview compatibility; CI #238 success, Node 429/429, Chromium 22/22.
- `15c28a0f`: H03 status projection; CI #240 success, Node 433/433, Chromium 22/22.
- `6ffabc8a`: reviewed transfer shows verified-vs-unresolved; CI #242 **FAILED** due to browser fixture still expecting old success wording.
- `b0fd4ba5`: offline browser queued-not-committed assertion and v1.1 evidence template.
- `108630a9`: browser acceptance wording repair; successor must verify exact-head CI.
- `80ec64d7`: H03 conflict review rechecks membership and remote revision after approval; 3 tests.
- `3f34eec5`: snapshot exact approved conflict proposal, reject changed object/company/ID; 2 tests.
- `87e986c7`: pin actor principal where available, financial conflict review limited to owner/admin, including role downgrade; 3 tests. **CI #252 queued at last check.**
- This handoff file is documentation-only and is not evidence that these later tests passed.

## How to start and run the suites
```bash
git fetch origin
git switch feature/cloud-record-discovery
git pull --ff-only origin feature/cloud-record-discovery
git rev-parse HEAD             # compare with PR and Actions
npm ci                         # Node 22 used in CI
npm test                       # all Node regressions
npm run test:storage           # Python tenant migrations
npm run test:contractors       # TF-P01–P10 synthetic detector checks
npx playwright install --with-deps chromium
npm run test:browser           # recovery, cross-tab, contractor, cloud transfer
```
Focused: `node --test tests/sync-queue.test.cjs tests/sync-intent-status.test.cjs tests/record-identity-contract.test.cjs tests/reviewed-transfer.test.cjs`.
CI definition: `.github/workflows/cloud-record-discovery-ci.yml`; exact-head checkout, focused/full Node, Python storage, ten detector check, Chromium mobile/desktop, strict summary and logs/screenshots in `artifacts/`.
**Do NOT run `npm run deploy`.** Current tests use synthetic data. No verified private preview URL is available.
UI acceptance: Settings > reviewed transfer; prepare synthetic backup, review remote revisions, stage explicitly, inspect verified/unresolved status; disconnect and reload, confirm locally queued does not imply cloud success. Real iPhone and real contractor tests remain open.

## Next engineer's immediate action list
1. Recheck actual remote PR HEAD, changed files, Actions #252 and any newer run. Resolve queued/failing CI or verify locally; **do not mark newer H03 changes green from an older CI run**. Verify new handoff-only commit separately if required by process.
2. Inspect `public/sync-queue.js` `resolve`, `drain` and `stageMigration` with `tests/sync-queue.test.cjs`: conflict during approval, role revocation, actor switch, tenant mismatch, version conflict, lost acknowledgment, crash/reload, lease expiry and ambiguous write. Require server authoritative write permissions.
3. Complete TF-R01 organization/role/job/crew permission contracts and offline revocation; do not rely on UI hiding or local flags. Test cross-tenant and field→PM→owner handoffs.
4. Incrementally connect **approved** local business draft changes to durable H03 sync envelope with server revision/idempotency/reconciliation. Never auto-mark external success; no autonomous external writes.
5. Preserve all TF-P01–P10 regression behavior. Add one seeded inquiry→quote→job→crew/time/materials/cost→invoice→**verified collection** example, with provenance and missing-evidence uncertainty; do not equate marked paid to bank settlement.
6. After secure data/permissions, build read-only permission-filtered Master Intelligence context using existing command engine, then typed plans and explicit approval; no disconnected writer.
7. Report exact SHA, files/behavior, test counts/CI, screenshots/repro, negative findings, remaining gates and next dependency on every increment. Update this handoff and PR rather than writing another competing roadmap.

## v1.1 improvement integration
- **Observable progress:** exact SHA and browser fixtures/screenshots, a founder repro path; hardening = demonstrated negative/recovery scenario, not invented GUI feature.
- **End-to-end intelligence/economics:** shared business IDs, links, revisions, provenance and missing information from lead→cash; metrics and alternatives only where evidenced.
- **Master Intelligence protocol:** objective→permission-filtered evidence→flow→constraint/rival causes→options/no action→economics/risk→observed/inferred/unknown→typed proposal→human approval→verified receipt→measured correction.
- **Cross-role workflows:** company memberships/crews/assignments/field offline submissions/manager review/owner approval under server authorization.
- **Contractor value:** code/product/operations/outcome gates, actual uncoached contractor tasks and baseline/error/time/cash/retention measures; no imagined sales or ROI.

## Explicit outstanding gates and safety
**Code:** historical green through #240; later H03 exact-head checks pending. **Product:** synthetic Chromium is not physical iPhone/user acceptance. **Operations:** no verified actual contractor end-to-end use. **Outcome:** no measured contractor impact. **Original research:** 0/62 formally retired.
**No merge, deploy, migration, user messaging, payment, credential/storage secret change, live tenant access change or production side effect.**

## Copy/paste successor prompt
> Continue TradeFlow from the actual GitHub HEAD of **draft PR #16**. Read `docs/TRADEFLOW_ENGINEERING_HANDOFF_2026-10-30.md`, the authoritative v1.1 Google Doc and existing architecture/evidence docs. Verify exact SHA and CI (including the formerly queued #252), inspect real code/tests, then continue H03 server-authorized, revocation-safe, conflict-safe offline synchronization without duplicating existing systems. Maintain TF-P01–P10, run complete tests, commit small safe increments, report verified evidence and blockers, keep the PR draft/unmerged/undeployed and do not claim the 62 pain points solved.

## Continuous session — H03 actor/lease/uncertainty hardening

Fetched actual PR #16 HEAD `534b7a89110ec3d53a4bc23e49bd9196bfab6bcb`. Both GitHub checks report success, but jobs return empty steps and downloadable logs are empty; artifact download was denied at the storage endpoint. Local baseline independently passes Node 443/443 plus storage and ten detectors. The separate production-linked Workers Build check is failed, not a passing engineering check; no attempt was made to modify production or its configuration.

The single current execution ledger is `docs/TRADEFLOW_ENGINEERING_TASK_LEDGER.md`. H03 changes pin the draining/reviewing actor, fence expired leases, persist uncertainty before sending, require fresh authorization before receipts, and freeze migration inputs during approval. Adversarial tests reproduce actor switch, downgrade, lease takeover, crash, lost acknowledgment, post-write revocation and non-boolean approval. These are internal safety/recovery changes; the existing Settings UI projection shows uncertain requests as indeterminate rather than committed. Real cloud, physical-device, contractor and collection evidence remain unverified. PR remains draft, unmerged, undeployed; no live access provisioning despite older authorizations in earlier sessions.

H03 local milestone completed: **55/55 focused**, **453/453 full Node**, storage/10 detector regressions, recovery/offline browser, **22/22** contractor/two-tab scenarios and reviewed transfer passed. Writes carry the pinned expected actor and server rejects a different verified principal. Local evidence under `/workspace/artifacts/tradeflow-continuous-2026-10-30/`. Exact source commit/remote CI evidence will be appended after publication.
