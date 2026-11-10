# TF-MI-LEARN-01 Phase B — connected proactive detection, prioritization, governed learning and conversation adapter

Issue: [#79](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/79). Builds on Phase A (`docs/TF_MI_LEARN_01_PHASE_A.md`, commit `5cfca1f`).
Base: X01 integration head `4f0ca28a95da169c73319f14504c0a5e416303c6` (PR #65). Remote heads re-fetched 2026-11-10: no branch had moved since Phase A; PR #65 exact-head Actions run 42699147764 is still FAILURE on the G02 microphone-denial check.

## Scope delivered (all isolated paths; `public/app.js`, `public/sw.js`, `src/**`, migrations untouched)

| Deliverable | Files | Pain points |
| --- | --- | --- |
| D1 O3 crew/material readiness | `public/intelligence-proactive-operations.js` (`detectCrewMaterialReadiness`) | P13, P14, P21, P26, P41, P42 (detection only) |
| D2 O4 quotation follow-up | same module (`detectQuoteFollowUp`) | P02, P33 (P03/P34 not measured) |
| D3 prioritization and reconciliation | `public/intelligence-proactive-priority.js` (`prioritizeCases`, `validateProposalPreconditions`), Phase A `reconcileCases` now honours `resolvedSubjects` | — |
| D4 governed learning | `public/intelligence-learning-governance.js` | — |
| D5 conversation adapter | `public/intelligence-proactive-adapter.js` | — |
| B3 source-trusted events | `public/intelligence-proactive-events.js` | — |
| Reviewed additive projection | `public/intelligence-evidence.js` (`EVIDENCE_FIELDS`) | — |
| D6 T01 scenarios | `automation/simulator/proactive-scenarios.v1.json`, `automation/simulator/proactive-phase-b-evaluation.cjs`, `tests/t01-proactive-phase-b.test.cjs` | — |
| Tests | `tests/intelligence-proactive-{operations,priority,events,adapter,security}.test.cjs`, `tests/intelligence-learning-governance.test.cjs`; Phase A tests updated for the extended detector set | — |
| CI evidence | `.github/workflows/tf-mi-learn-validation.yml` (isolated, Node-only; S01 review requested) | — |

Nothing is retired: every P## above has detection and proposal preparation, not a verified contractor outcome.

## Additive evidence projection (reviewed contract)

`EVIDENCE_FIELDS` gained only existing scalar fields plus one bounded array:

- `jobs`: `startTime`, `durationMinutes` (Dispatch, `public/operations.js`) and `fieldUpdates[]` projected from the TF-RM-03 readback (`src/role-exchange.js`) as `{eventId, kind, actorId, at, acknowledgesEventId?}`; kinds limited to `job_blocker_reported` / `job_blocker_acknowledged`; the free-text note is **withheld**; max 50 entries (413 beyond).
- `quotes`: `sentDate`, `lastFollowUpAt`, `lastContactAt`, `followup_date` (written today by the app and `customer.contact.record`).
- `customers`: `contactRestriction` (optional; absent = `unrecorded`, never assumed).
- `supplyOrders` (new type, owner/admin only): `jobId`, `supplierId`, `status`, `documentStatus`, `plannedDate`, `poNumber`.

Projection stays idempotent, so `validateEvidence` still rejects any record carrying unprojected fields. Server rows for `supplyOrders` exist only with extended records enabled; otherwise the detector reports `material_orders_absent_from_snapshot`. The `job_blocker_acknowledged` entry is a **proposed additive shape** for D01's role-exchange write path; until it is written, blockers simply stay open.

## Detector behaviour

**O3** (`owner`, `admin`, `member`; viewer denied): one case per unacknowledged `job_blocker_reported` on an active job (`urgent` when the job date is today or past, `attention` otherwise; `missing_data` when crew/customer/date linkage is incomplete); same-crew same-day pairs are a conflict only when both recorded windows overlap, otherwise `missing_data: schedule_times_unrecorded`; purchase orders with a passed `plannedDate` and open status are `needs_review`, undated orders are `missing_data: supplier_eta_unrecorded`, several open orders for one job and supplier are `missing_data: duplicate_not_confirmed`. Crew availability is always an explicit unknown. An acknowledgment referencing the blocker's `eventId` is the only thing that resolves it (`supersedeReason: resolved:acknowledged`).

**O4** (`owner`, `admin`): `Sent` quotes with a strict Gregorian `sentDate`; latest touch = max(sent, lastFollowUpAt, lastContactAt); due after 14 days or when the owner `followup_date` is reached; a future touch is an unknown, not a case. No `sentDate` → `missing_data: sent_timestamp` with a data-quality recommendation. `contactRestriction` → `contactRestricted:true`, internal review only. `communication` is always `{drafted:false, approved:false, sent:false, acknowledged:false}`; this detector never drafts a message.

**Proposals** (`PROPOSAL_COMMANDS`): invoice → `invoice.followup.schedule`; quote → `quotation.followup.schedule` (`customerContact:'not_proposed'`); blocker → `draft.prepare` task (`crewReassignment`/`supplierOrder` `not_proposed`); crew conflict, material review and cash gap → `unsupported_capability` with reason. `validateProposalPreconditions` reports every check (command exists, actor permitted and same as case actor, tenant, evidence complete and server-confirmed, revision current, approval mechanism, internal effect, automation setting, parameters, duplicate) and prepares a proposal only when all pass; `delegationEligible` is always `false` this sprint.

**Priority** (`prioritizeCases`): integer weights for trust, completeness, conclusion, severity, verified due state and days, unacknowledged blocker, explicit goals (`cash_review`, `schedule_readiness`, `sales_follow_up`), same-subject rejection hint (−10), age > 12 h (−5). Every entry lists its reasons plus `financial_exposure:not_estimated` and `confidence:not_scored`. Equal scores share a rank with `uncertainty:'equal_priority_unresolved'`. Expired, superseded, resolved, duplicate, foreign-tenant and authority-bearing cases are excluded with reasons.

**Events** (`intelligence-proactive-events.js`): `triggerFromDomainEvent` maps a real `domain.event` to `local_pending` regardless of its `evidence`/`status`/`verified` fields; `deriveReconciliationTriggers` diffs two validated authenticated snapshots of the same identity/role into `authorized_reconciliation` triggers (created/updated/removed, refuses backwards revisions); `SERVER_COMMIT_CURSOR` is reported **BLOCKED on D01** and no code path mints `server_commit`.

**Learning** (`intelligence-learning-governance.js`): `governLearningCandidate` wraps a Phase A tenant-only candidate with actor, subject, source refs, original recommendation, feedback, receipts (`verified` only with references), measurement (`evidenceClass` user_feedback | verified_receipt | synthetic_simulation; `realBusinessImprovement:null`), unknowns, sensitivity `tenant_confidential`, access roles owner/admin, `approvalState:'unreviewed'`, applicability `generalizes:false`, `policyEffect:'none'`, `permissionEffect:'none'`, `financialCertaintyEffect:'none'`. `readLearning` denies other tenants and roles; `correctLearning` creates a new unreviewed version with lineage; `invalidateLearningOnRevision` and `learningStatus` handle stale sources and expiry; `aggregateLearning` counts per subject and always returns `universalRuleEligible:false`.

**Adapter** (`intelligence-proactive-adapter.js`): `buildProactiveTurn` derives the conversation scope from the validated evidence scope (never from a browser label), refuses synthetic, foreign-tenant, other-actor or authority-bearing cases, emits one assistant turn (`source:'proactive_case_review'`, ≤ 6000 chars, ≤ 8 `type:id@revision` refs, OBSERVED vs ANALYSIS labelling, untrusted record text never echoed, at most 5 cases) plus a separate `caseIndex`; `drillThrough` lists `record.open` navigation targets only.

## X01 integration patch (reviewed, not applied here — X01 owns these files)

1. `public/conversation-store.js`: add `'proactive_case_review'` to `SOURCES` and bump `VERSION` per X01 policy (one line).
2. `public/app.js` (same thread, no second assistant): on open/reconnect for owner/admin, after the existing authenticated context read, call `detectInvoiceDueDateReview`, `detectCrewMaterialReadiness`, `detectQuoteFollowUp` (and `detectCashCoverageEvidenceGap` when the D01 packet is fetched), `reconcileCases` against the in-memory case list, `prioritizeCases`, then `buildProactiveTurn({cases, scope, priority})` and `tfAiSaveTurn(turn.turn)`; keep `caseIndex` in memory for `drillThrough` → `record.open`. Render a badge for `source==='proactive_case_review'` like the existing `financial_missing_data` badge (`app.js:512`), e.g. “PROACTIVE REVIEW · OBSERVED RECORDS, NO ACTION TAKEN”.
3. `public/sw.js`: precache the seven new `./intelligence-*.js` modules and bump `CACHE`.
4. Proposals: route `validateProposalPreconditions(...).proposal` into the existing decision/approval UI; never call `commands.execute` from the adapter.

## Observed verification (local, Node 22.23.4, this head)

| Check | Command | Result |
| --- | --- | --- |
| Phase A contract tests | `node --test tests/intelligence-proactive-cases.test.cjs` | PASS 16/16 |
| O3/O4 detectors | `node --test tests/intelligence-proactive-operations.test.cjs` | PASS 9/9 |
| Priority and preconditions | `node --test tests/intelligence-proactive-priority.test.cjs` | PASS 3/3 |
| Events | `node --test tests/intelligence-proactive-events.test.cjs` | PASS 4/4 |
| Learning governance | `node --test tests/intelligence-learning-governance.test.cjs` | PASS 6/6 |
| Adapter | `node --test tests/intelligence-proactive-adapter.test.cjs` | PASS 5/5 |
| Security adversarial | `node --test tests/intelligence-proactive-security.test.cjs` | PASS 9/9 |
| T01 Phase A oracle | `node automation/simulator/proactive-evaluation.cjs` + test | PASS, 24 checks; 3/3 |
| T01 Phase B scenarios | `node automation/simulator/proactive-phase-b-evaluation.cjs` + test | PASS, 22 scenarios (S01–S21 + S01b); 2/2 |
| Full Node | `npm test` | 930 tests: 926 pass, **1 fail** (pre-existing `master-fluid-orb` missing 60-frame MP4), 3 skipped. Phase A head: 892/888/1/3 |
| Storage | `npm run test:storage` | PASS (6 groups) |
| Contractor workflows | `npm run test:contractors` | PASS TF-P01..P10 |
| Worker/security focused | `node --test tests/tenant-api tests/tenant-security tests/intelligence-context tests/role-exchange tests/financial-evidence-api tests/intelligence-financial-evidence tests/x01-missing-financial-bridge tests/advisory-authorization tests/cloud-intelligence tests/master-intelligence tests/conversation-store` | PASS 99/99 |
| X01 orb Chromium check | `node scripts/verify-orb-compact-browser.cjs` (launched through a wrapper pointing the project's Playwright 1.62.1 at the pre-installed Chromium 1243 build, because the pinned headless-shell 1234 is absent here) | PASS locally: 360/390/430/1280 journeys, exit 0. The CI failure at 4f0ca28 (`verify-orb-compact-browser.cjs:109`) did **not** reproduce with this browser build; not claimed fixed, CI browser differs |
| Browser GUI integration | — | NOT RUN (no GUI change in this PR) |
| Exact-head GitHub Actions | — | BLOCKED until the new workflow runs on the pushed head; the X01 workflow does not trigger on this base |

Synthetic scorecard (Phase B): 22/22 scenarios, 0 tenant leaks, 0 unauthorized actions, 0 model calls, 1 verified receipt (S20, existing device-local command host with harness-supplied owner approval), `realBusinessImprovement:null`, `alertPrecisionBaseline:null`.

## Blockers and dependencies

- **D01**: durable authenticated change cursor (`server_commit` triggers) and the `job_blocker_acknowledged` write path in role-exchange. BLOCKED, not fabricated.
- **X01**: conversation source registration, same-thread presentation, precache, proposal routing (patch above).
- **I02**: persistence/retention schema for governed learning records; everything here is in-memory.
- **S01**: review of the isolated workflow; ffmpeg orb build step mirrors X01's.
- **Q01**: independent negative-case review of the exact final commit requested.
- Issue #79 cases 15 (authority downgrade mid-plan) and 18 (uncertain external response) are represented only as "never claim success" behaviours; no delegated workflow exists to downgrade.
- No browser, voice, provider, Worker HTTP or physical device was exercised.
