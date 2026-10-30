# TradeFlow v1.1 — evidence and acceptance handoff (incremental contract)
Source reviewed: [authoritative roadmap v1.1](https://docs.google.com/document/d/1_6HAHgumQ2EKrH4Yw2w-ZZ1CqVTMnfe_AVnrisaCX6o/edit), including its 2026-10-30 addendum. This file complements, not replaces, `TRADEFLOW_UNIFIED_ARCHITECTURE_BACKLOG.md` and original 62-item evidence register.

## Increment evidence contract
For each commit, record:
- **Source:** exact GitHub PR SHA, changed files, scoped behavior.
- **Product delta:** page/action and instructions to reproduce; say *internal-only* when appropriate.
- **Seed and paths:** fixture(s), test script(s), screenshot/recording artifact, safe local preview commands.
- **Checks:** focused/full Node counts, storage, ten contractor detectors, Chromium desktop/mobile, recovery/negative results, exact CI run, failures or unexecuted steps.
- **Four gates:** Code (source/tests); Product (synthetic browser and then physical device); Operations (real authorized contractor tasks); Outcome (measured baseline/delta). Never conflate gates.
- **Claims:** list observed, inferred, recommended and unknown separately; 0/62 retired unless original register has complete evidence.
- **Value hypothesis:** plausible effect on delay, errors, throughput, cash timing, contribution or quality; no fabricated savings or revenue.

## Reproduce current H03 recovery evidence
On the matching commit, `npm ci` and `npm run test:browser`. Inspect `artifacts/local-recovery/result-390.json` and desktop equivalent at the path produced by the script, plus screenshots and `artifacts/browser.log` from GitHub CI. The real-browser offline fixture creates a local customer sync intention while signed out, reloads, confirms no remote request, and checks `queued_local` / `externalCommitted=false`. It is a synthetic non-prod browser test, not a cloud-write acceptance test.

## Founder visible acceptance path — later, not yet verified
1. Open Settings > reviewed transfer in an authorized development preview; confirm it says automatic synchronization is off.
2. Prepare a migration review with a synthetic backup and business membership; inspect separately the *locally queued*, *remote readback verified*, and *conflict/manual recovery* counts.
3. Deny permission or disconnect network, reload and confirm local drafts remain and no cloud success is claimed.
4. Exercise conflicting updates and approval revocation on two devices with a safe test tenant; verify deterministic receipts and no cross-company data exposure.
5. Repeat uncoached with electricians and office staff; measure correctness/time and retain negative findings.

## Roadmap v1.1 improvements and dependencies
| Improvement | Prerequisite | Incremental implementation | Evidence / next gate |
|---|---|---|---|
| Visible product acceptance | Existing Playwright fixture and SHA CI | Include offline state in browser recovery result and screenshot evidence | Exact-head Chromium, later physical iPhone and founder preview |
| End-to-end business economics | H01 approval + H02 company/record identity + H03 revisions | Link inquiry/quote/job/crew/cost/invoice/payment provenance and missing-evidence flags; no settlement assumptions | Seeded end-to-end graph with missing payment proof and alternative diagnosis |
| Master Intelligence decision protocol | H03 authorization and H04 permission-filtered retrieval | Owner objective → evidence → flow → diagnosis and rival causes → alternatives/no action → economics/risk → observed/inferred/unknown → typed proposal → approval → receipt → outcome correction | Negative role, tenant, uncertainty and stale-approval tests |
| Cross-role handoffs | TF-R01 identity/membership and H03 secure sync | Offline field draft → server-validated sync → manager variance review → owner approval → receipt | Revocation and conflicting update tests before UI role promotion |
| Contractor value | Stable tested workflows and baseline | Uncoached task time, mistakes, owner use, willingness to pay and retention | Real electrical contractor records; no speculative ROI |

## Release constraints
PR #16 remains draft/unmerged/undeployed. Existing TF-P01–P10 and H01 are not replaced. No production tenant migration, customer communication, payment, secrets or permission change.
