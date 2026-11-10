# TF-MI-LEARN-01 Phase A — read-only proactive detector and learning contract

Issue: [#79 TradeFlow Master Intelligence: proactive learning and authorized operations](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/79).
Pain points addressed (detection only, nothing retired): **P10/P11** invoice due-date review, **P52** cash coverage evidence gap.

Base: X01 integration head `4f0ca28a95da169c73319f14504c0a5e416303c6` (PR #65), because the module consumes I01's
`strictFinancialDate` (PR #71) and the D01 financial evidence packet shape (PR #77) that are only present there.

## What was added (isolated paths only)

| File | Purpose |
| --- | --- |
| `public/intelligence-proactive-cases.js` | Pure ESM module. Versioned trigger/case/learning contracts, O1 and O2 detectors, dedupe/supersede, freshness inspection, internal proposal preparation, governed feedback → learning candidate, hint annotation. No storage, network, model or command execution. |
| `tests/intelligence-proactive-cases.test.cjs` | 16 positive/negative contract tests (issue #79 evaluation cases 1–13 and 17 where Phase A applies). |
| `automation/simulator/proactive-evaluation.cjs` | T01 memory-only oracle over the existing 5/12/20-person synthetic firms; writes `artifacts/t01-proactive/proactive-evaluation.json` (ignored). |
| `tests/t01-proactive-evaluation.test.cjs` | Runs the oracle; asserts 0 leaks, 0 duplicates, 0 unauthorized actions, 0 model calls, deterministic replay. |

Not touched: `public/app.js`, `public/sw.js`, `src/**`, workflows, migrations, D1, IndexedDB, conversation store, command registry.
The new module is **not yet loaded by the application**; X01 owns that wiring (same Master Intelligence thread, precache entry).

## Contracts (v1, in-memory only — no persistence schema approved)

- `tradeflow.intelligence.proactive.trigger.v1` — `source` ∈ `server_commit | authorized_reconciliation | local_pending`; `actorScope` is **derived** from the source and a caller-supplied value is rejected; `local_pending` carries `revision:null` and `confirmed:false`.
- `tradeflow.intelligence.proactive.case.v1` — fields from issue #79 (`subjectRefs`, `evidenceTrust`, `completeness`, `missingData`, `status`, `severity`, `priorityReasons`, `conclusion`, `modelInvoked:false`, `executionAuthority:false`, `expiresAt` = observed + 24 h, `dedupeKey`) plus `explanation`, `recommendation`, `unknowns`, `limitations`, `evidence`, `actor`, `triggerId`, `learningHints`, `proposals:[]`.
  The kind is intentionally **not** `tradeflow.intelligence.case.v1`: that kind already exists in `public/intelligence-case.js` with a different (owner-requested, 10-minute) shape. Issue #79's draft type name collides with it; this document records the deviation.
- `tradeflow.intelligence.learning.v1` — `scope:'tenant_only'`, `status:'candidate'`, `policyEffect:'none'`, `authorityChange:false`, `verifiedReceiptIds:[]`, `measurement.baseline:null`, 90-day expiry, note stored as `user_supplied_untrusted`.

## Detector behaviour

**O1 `invoice.due_date_review`** — input is the existing authorized context (`tradeflow.intelligence.context.v1` or the device-local context), validated by the existing `validateEvidence` (identity, role, approved fields, revisions, 200-record bound). Only owner/admin scopes evaluate; viewer/member return `denied` with no record identifiers. An invoice with an open recorded status and a strict Gregorian `dueDate` within the 7-day window yields one case per `(tenant, invoice, revision)`. Past-due with complete linkage → `needs_review`/`attention`; approaching/due today → `informational`; missing job linkage, withheld job, local-unconfirmed or synthetic evidence → `missing_data`. Missing/impossible/timezone-qualified due dates and unrecognised statuses are reported as `unknowns`, never as findings. Recorded payments are summed as evidence with `settlementVerified:false`; the text states that no non-payment is asserted. Untrusted record text (number, notes, currency) is never echoed; currency is accepted only as an ISO-4217 code.

**O2 `finance.cash_coverage_evidence_gap`** — input is the D01 packet. Requires cloud owner/admin scope whose issuer/subject/role match the packet actor and tenant, `sourceKind:'verified_tenant_record'`, matching `asOfDate`, valid `recordRefs`. Any of `status:'missing_data'`, `cash.availableMinor:null`, `bankVerified:false`, `obligationsComplete:false`, unverified receivable settlement or incomplete coverage produces exactly one owner-only evidence-collection case with `forecast:null` and `cashAvailableMinor:null`, listing the packet's missing data plus the derived gaps and a concrete checklist. A packet asserting a cash figure without bank verification still yields a gap case and the figure is never surfaced. A fully complete packet yields **no** case (`no_evidence_gap_detected_forecast_not_supported`); forecasting is out of Phase A scope.

**Dedupe / supersede** — `reconcileCases` keeps one case per dedupeKey (50 replays → 0 new, 1 suppressed), marks `superseded` with `source_revision_changed`, `record_absent_or_resolved` or `expired`, and never touches cases of other tenants or detectors. `inspectProactiveCase` reports `current | expired | stale_evidence | scope_changed | access_denied | invalid_time`.

**Workflow handoff** — `prepareInternalProposal` references the existing `invoice.followup.schedule` definition (approval `explicit`, effect `modification`) only for a server-confirmed, complete, past-due case, returning `status:'proposed_not_authorized'`, `receiptRef:null`, `executed:false`. Every other situation (cash gap, incomplete evidence, local/synthetic trust, not yet due, command missing or contract changed) returns `unsupported_capability` with a reason. Nothing is executed.

**Learning** — `recordRecommendationFeedback` accepts `accepted | corrected | rejected` from an owner/admin of the same tenant and produces a learning candidate; `applyLearningHints` annotates later cases of the same tenant/detector with `learningHints` and a priority reason. Severity, conclusion, status, proposals, dedupeKey and authority are unchanged; expired, foreign-tenant, non-`tenant_only`, policy-bearing or authority-bearing candidates are ignored.

## Observed verification (local, Node 22.23.4, at this head)

```
node --test tests/intelligence-proactive-cases.test.cjs      # 16/16 pass
node --test tests/t01-proactive-evaluation.test.cjs          # 3/3 pass
node automation/simulator/proactive-evaluation.cjs           # PASSED, 24 checks, 0 failures, exit 0
npm test                                                     # 892 tests: 888 pass, 1 fail, 3 skipped
npm run test:storage                                         # all groups PASS
npm run test:contractors                                     # TF-P01..P10 PASS
node --test tests/intelligence-financial-evidence.test.cjs tests/financial-evidence-api.test.cjs tests/x01-missing-financial-bridge.test.cjs  # 19/19
```

The single full-Node failure is pre-existing on the base: `master-fluid-orb` requires the generated 60-frame orb MP4 (`bash scripts/build-welcome-orb-media.sh`, ffmpeg) and is unrelated to this change. Baseline on the same base before this change: 873 tests, 869 pass, 1 fail, 3 skipped.

T01 scorecard (synthetic only): expected 4 cases / produced 4; tenant leaks 0; unauthorized actions 0; model calls 0; duplicates after 50 replays 0; `findingPrecision` 1.0 against the synthetic oracle only; `verifiedOutcomeCoverage` and `alertPrecisionBaseline` are `null` because no real outcome exists.

## Not verified / blockers

- No authenticated server read, Worker HTTP call, browser, voice, IndexedDB or command receipt was exercised; the module has not run inside the application.
- Exact-head GitHub Actions for this branch must be inspected before acceptance; X01's own orb Chromium failure (`verify-orb-compact-browser.cjs:109`) is unchanged and remains red.
- Issue #79 cases 15, 16 and 18 (authority downgrade mid-plan, real approved receipt, uncertain external response) are Phase B/C; none is claimed.
- No persistence, cursor, scheduler, notification or UI exists yet; cases live only for the call that produced them.

## Next dependency-ready steps (owners)

1. **X01** — surface `reconcileCases` output in the existing Master Intelligence thread on open/reconnect (owner/admin only), precache the module, no second assistant.
2. **D01** — authenticated change cursor or bounded reconciliation read so `server_commit` triggers can be created from real revisions; revocation between observation and proposal must deny.
3. **I02** — governed storage for `tradeflow.intelligence.learning.v1` with correction, export and expiry; still `policyEffect:'none'`.
4. **Q01** — independent negative-case review of this branch, including cross-tenant and viewer paths.
5. **I01** — O4 quote follow-up (missing `sentDate`/follow-up timestamp → `missing_data`, never a fake overdue) and O3 crew/material readiness on the issue #25 pilot.
