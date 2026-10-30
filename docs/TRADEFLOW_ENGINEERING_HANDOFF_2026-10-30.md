# TradeFlow — Master Engineering Handoff (2026-10-30)

**Current continuation:** the initial checkpoint below is historical. Read the appended continuous-session milestones and `TRADEFLOW_ENGINEERING_TASK_LEDGER.md` for the current source and evidence.

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

## R01 company-role and crew-assignment increment

H03 source `ec13e84e962107f14da273368eb5c5e7ffbef64b` is remote; exact-head runs 41106738415 and 41106731287 report SUCCESS. Detailed GitHub logs/steps remain unavailable through this runtime, so exact counts are independently observed locally, not inferred from badge.

Shared `public/record-permissions.js` distinguishes ordinary record editing, financial writes, and crew administration. Existing owner/admin roles administer crew; member/viewer cannot. The server API, record writer and sync/conflict checks consume the contract. Job `crewId` changes/removals require owner/admin at SQL execution; members can retain assignment while editing other job fields. No new roles, memberships or migration. A roster display role never grants account authority. SQL tests exercise downgrade, denied audit side effects, allowed member note edit and admin reassignment. Local **458/458** Node, storage, ten detectors and complete browser suites pass. Job-scoped field-user grants/invitations are still open, so do not advertise a finished field-account system.

## H03 explicit reconciliation and browser-fixture repair

R01 source `13215682367bb449ad3387139991d8264c810415` exact-head runs 41107309627 / 41107299060 report SUCCESS (detailed logs unavailable). Added `queue.reconcile(id)` for uncertain/exhausted operations: read-only, original actor/role and exact remote revision/payload required, race-checked local receipt. It cannot overwrite a conflicting record. Local focused recovery **11/11**, full Node **460/460**, storage/ten detectors and complete browser suite pass. Browser TF-P03 initially failed at both viewports because a subsequent prompt arrived before a listener was registered; fixed the test event subscription ordering and retained all application assertions, with **20/20** scenarios passing afterward. No deployment, live access changes or real customer data.

## Read-only intelligence context and seeded contractor flow

H03 explicit reconciliation source `dee36d8278ab87d63dafc889983a8f92c408b60a` is pushed. Exact-head run 41108277912 reports SUCCESS; duplicate PR run 41108268516 was still in progress at last check. Counts remain independently observed locally because detailed GitHub logs/steps were unavailable.

Implemented `src/intelligence-context.js` / GET `/api/v1/businesses/:id/intelligence/context[?jobId=...]`: existing verified identity/membership; SQL tenant/type/live-role filtering; bounded source snapshots and revisions; post-read authorization; field allowlists; explicit unknown/conflicting links; no invented settlement or authority. `public/cloud-intelligence.js` provides optional `ports.review` for the **existing** `intelligence.review` command. It rechecks actor/role, keeps full context ephemeral and leaves only a minimal read summary in the command journal. It is not silently installed as the main app's default local review and introduces no new command writer or AI provider.

Seeded inquiry→quote→job→crew/labor/material costs→invoice→recorded payment graph and existing detector compatibility are tested in `tests/contractor-operating-flow.test.cjs` with a synthetic fixture. Payment and labor evidence remain unverified; alternative scope/estimate and missing-import explanations are preserved, not asserted causes. Local focused **27/27**, full Node **476/476**, SQL/ten detectors, **24/24** named Chromium scenarios plus recovery and reviewed transfer passed. A synthetic signed-JWT localhost host invokes actual API authorization and browser shared commands; it is not live D1/user acceptance. The updated CI summary requires the new context scenarios and fails on missing/partial evidence. An initial TF-P07 child-process timeout was retained and reproduced; isolated and serialized reruns pass without increasing the timeout.

Reproduction and integration details: `docs/TRADEFLOW_V1_1_PRODUCT_EVIDENCE.md`; execution statuses: `docs/TRADEFLOW_ENGINEERING_TASK_LEDGER.md`. Remaining foundations include field-account/job-scoped authorization/invitations, actual signed-in two-device tests and physical/contractor acceptance. No deployment, live access change, provider/financial operation or 62-point retirement occurred.

## Final conflict-review and cloud-read revocation increment

H04/FLOW source `c80cfd9352f9879db267a0474181e375ad988006` exact-head runs 41109616847 / 41109605869 report SUCCESS. Detailed remote job steps/logs remain unavailable; local counts are independently recorded, not inferred from the badges.

Closed final-await conflict-review gaps: a different principal cannot enter the original actor's approval flow; actor/financial role is revalidated after the final remote consistency read. Added actual membership guards to ordinary single-record and catalogue SELECTs, correlated to the outer tenant, plus fresh authorization before returning data. Revocation cannot return private records or an empty-success catalogue. Existing company-role read policy is preserved; no job-specific field-user access is claimed. No schema migration or live ownership change.

Local focused **53/53**, full Node **480/480**, storage, **10/10** detector regressions, **24/24** named Chromium scenarios plus recovery/offline/reviewed transfer pass. A prior overlapping browser run had three localhost load/reload timeouts (17/20); serialized rerun passed without raising thresholds or weakening assertions. Keep the negative artifacts. Evidence root remains `/workspace/artifacts/tradeflow-continuous-2026-10-30/`, final raw logs use `final-revocation-*`.

Remaining work is explicitly open: job-scoped field-account grants/invitations and local account-data isolation; deliberate app host binding for cloud intelligence; scalable retrieval beyond bounded context; actual authenticated two-device, physical-device and contractor acceptance; provider/model integrations and external receipts. Do not reinterpret queued/local/manual records as external completion. No production/environment/access/provider/financial operation was performed. The failed external production-linked Cloudflare build check was not changed or treated as a passing regression. PR #16 remains draft/unmerged/undeployed; 0/62 retired.

## H03-05 two-device acceptance and concurrent coordinator reconciliation

Remote coordinator commit `2b1df685868178dde1b9c6c7f3ccde513482a1fc` advanced only the ledger during final testing. Preserved its downloaded-job-log evidence for H04 source c80cfd9 (run #262 / 41109616847: 114 focused, 476 full Node, 24 Chromium) and its explicit next task. Recovery patch and own stash were retained; safely fast-forwarded and merged only documentation. Claimed H03-05 in `34d1ac6`; named the separate final read/review fix **H03-06** to avoid reusing its task ID. H03-06 source is `c540adbb864047dc6384e3ded9345cddfaef2f2f`; runs 41111917488 / 41111906173 were QUEUED at last observation, not claimed passed.

Implemented H03-05: `node scripts/verify-two-device-sync.cjs`. Two independent browser stores use the real account-session/queue/transport/API/JWT verifier and actual SQLite SQL/CAS/audit triggers on an isolated temporary fixture initialized from committed migrations. It tests actual read revision→offline draft→other-device edit→conflict, corrupted acknowledgement after committed write→indeterminate→reload/readback without replay, then offline membership revocation with direct server 403 and no audit/record effects. JSON observations and synthetic database copies are saved in `artifacts/two-device-sync/`. No live credentials, D1, account provisioning or physical devices are involved. The HTTP host binds localhost only and the fixture database is temporary; no provider/API keys are exposed to the frontend.

Local **481/481 Node**, storage, **10/10** detector regressions, **26/26** named Chromium scenarios plus recovery/offline and reviewed transfer pass. CI requires the additional 2/2 two-device marker and fails on absent/partial evidence. Documentation of the fixture and exact acceptance is in the authoritative task ledger and v1.1 evidence doc. Next gated R01 field/job-specific grants require the role/access contract identified by the coordinator; do not infer new account permissions from crew records or model output. Real cloud/device/contractor and outcome gates remain open. PR #16 draft, unmerged, undeployed; no live access/production/financial/provider operation.

## Final verified source — e43010d (continuous session)

Actual source **e43010d619cd3dc7eb2256074d24ad327ff357eb**, branch feature/cloud-record-discovery, draft PR #16. Exact-head Actions **#269 / 41112441769**, job **124257898455**, SUCCESS. Independently read decoded job log via GitHub connector: **118/118 focused**, **481/481 full Node**, storage/SQL/revocation/audit stages, **10/10** detectors, recovery/offline/reviewed-transfer and **26/26** named Chromium. Duplicate run 41112452708 reports SUCCESS. CLI logs/steps were empty, but the connector resolved actual evidence; baseline 534b7a8 job log also verified **111/111 focused, 443/443 full, 22/22 Chromium**. Do not carry the earlier CLI access limitation forward as an unresolved missing-test claim.

Code milestone commits: **ec13e84** (actor/leases/uncertainty), **1321568** (crew/assignment authority), **dee36d8** (read-only reconciliation/dialog fixture), **c80cfd9** (authorized context/shared read port/seeded flow), **c540adb** (final review/read revocation), **e43010d** (actual-SQL two-device browser acceptance). Coordinator **2b1df68** and worker claim **34d1ac6** were preserved. All tested changes are committed/pushed; a later documentation-only SHA does not imply different deployed code. No deployment occurred.

Next dependency: R01 job-scoped field/office grant contract, explicitly required by the coordinator. Requested its approved location/rules from the founder; do not invent new account permissions. Real Cloudflare Access/D1 multi-device acceptance, physical iPhone, contractor operations and measured outcomes remain unverified. The production-linked external Cloudflare build check remains failed/untouched. PR is draft/open/unmerged/undeployed, no live access/production/provider/financial changes, 0/62 retired. See authoritative task ledger and v1.1 evidence for reproducible tests and boundaries.

Final read-only external-check diagnosis: saved handoff `a0ba09c0706cf6b4580421bbaa5774e4705175f4` passed both GitHub regression checks (41113255846 / 41113248698). Cloudflare build `bd46c29d-c59b-433f-bb0e-431dbaaa0639` uses beta `npx wrangler preview` and fails configuration validation for a missing `previews` block. Retrieved its untruncated 47-line log via read-only GET; no production configuration or deployment changes. Leave the production-linked pipeline untouched under current authorization. This explains the separate failed check and must not be confused with passing exact-head application regressions. The founder's approved role/access-contract location/rules were requested and remain pending; do not treat silence as authorization for new grants.

## Next-phase H04-02 deterministic decision protocol

Reconciled #274 (41113749206) actual log against 7748b09: 118 focused, 481 full, 26 browser all passing. Claimed independent H04-02/03 and recorded a **non-approved** R01-02 proposed matrix in the existing ledger; no role grants implemented.

Implemented public/intelligence-evidence.js and public/master-intelligence.js; server context reuses the same projection. Existing detectors remain authoritative for findings. Decisions distinguish observations, unproven rival causes, recommendations and unknowns; include no action; generate only registered explicit-review cost/labor commands. Local snapshots use content fingerprints and null revisions, never invented cloud identity/revisions. Proposal preparation re-fetches scope/evidence and uses existing runtime.prepare only. Approval/execution remains in the host; cloud mutation is explicitly not connected. Receipt evaluation reads runtime history/outcome and the actual linked task and never declares financial/payroll/contractor resolution.

Local 26 focused, 496 full Node, storage, ten regressions and existing 26 named browser scenarios plus recovery/transfer pass. Current milestone is internal-only. Next: wire one real job-dossier journey and browser proof through the existing command engine, then provider-neutral interfaces when stable. Legacy missing currency is unknown; do not silently backfill records. No deployment/live operations, no roles invented, 0/62 retired.

## H04-03 / H03-07 implemented — owner-visible reasoning and uncertain-command recovery

Preserved concurrent coordinator documentation commit `3ea43c2db92ba15d31fba91f3b9acf2a069f2392` by fast-forwarding and combining both ledger additions. Independently retrieved actual H04-02 job log 124273058920; source 127fbbf passed 496 Node and 26 named browser scenarios. No newer application code was overwritten; recovery stash/patch retained.

**H04-03:** Existing job dossier now opens an inline Operational reasoning review. It distinguishes observed evidence, unproven alternative causes, unknowns and no action, then prepares only existing cost/labor review commands. Native explicit approval, current source/permission validation, transactional execution and actual saved-task receipt are required. Existing navigation and TF-P05/P06 controls remain. Job-scoped snapshots exclude unrelated records before bounded projection; legacy ambiguous expense links and unverified currencies block affected financial proposals. Unsupported detector inputs are explicitly unassessed rather than generating false missing-evidence claims. New USD cost form submissions retain the form's stated currency; existing records are untouched.

**H03-07:** Shared registry inspects same-actor/business/command/record requests with unverified execution. A fresh request key cannot bypass them. The dossier requires read-only receipt reconciliation before another attempt; no second queue or executor. Cancel/no-action do not create tasks. Source changes during approval fail; prior acknowledged task remains exactly once after offline reload and synthetic lost-journal recovery.

Local acceptance: **48/48 focused**, **502/502 full Node**, all six SQL/storage groups, **10/10** detectors, **28/28 named Chromium** plus recovery/offline and reviewed transfer. Phone 390×844 and desktop 1280×900 screenshots/results: `artifacts/decision-journey/`. Browser flow: overview budget warning → actual job dossier → explanation → cancel/no action → second-tab stale edit rejected → refreshed explicit approval → one saved review task and canonical receipt → offline reload → uncertain-journal receipt inspection without replay → actual USD cost form submission, legacy record unchanged. Initial fixture title mismatch and duplicate recovery button failures were corrected and rerun; negative logs retained. Browser evidence is synthetic local IndexedDB/SQLite, not physical iPhone/live cloud/contractor outcome. CI summary now requires both journey scenarios (28 total); exact-head CI is pending publication of this increment.

Security/release: local device identity is labeled as such; cloud contexts remain read-only. No provider request, migration, role grant, live data, deployment or pain-point retirement. R01-02 remains blocked on approved role contract; PR #16 remains draft/unmerged/undeployed. Next dependency-ready increment: server-only advisory provider/credential contracts, disabled by default and mock-transport tested without live calls or spending.
