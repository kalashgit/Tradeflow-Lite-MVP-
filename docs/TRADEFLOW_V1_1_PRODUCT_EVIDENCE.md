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

## 2026-10-30 continuous execution — authorized context and seeded operating flow

**Internal-only**, no main-dashboard redesign and no live deployment. `GET /api/v1/businesses/:businessId/intelligence/context` (optional `jobId`) verifies the existing JWT/membership, filters permitted record types in SQL, returns source revisions, and rechecks membership before returning. Member/viewer contexts omit quotes, invoices, costs and payments; contact details/notes and arbitrary provider claims are excluded for all roles. Crew display role remains data, never authority. Oversized snapshots/critical fields fail explicitly; no silent invoice-line truncation or invented settlement. Contradictory customer links are review warnings, not auto-resolved.

The optional `createCloudReviewPort` in `public/cloud-intelligence.js` plugs into **existing** `createRuntime({ports:{review}})` / `intelligence.review`. It pins business/actor/role across the request, rejects redirect/expiry/offline/mismatched context, passes context to an ephemeral authorized callback and records only a minimal read summary. It does not silently replace the current app's local review port. No new AI writer, model invocation, persistent cloud company memory or automatic business operation was created.

Reproduce:

```sh
npm ci
node --test tests/sync-recovery-adversarial.test.cjs
npm run test:storage
node --test tests/intelligence-context.test.cjs tests/cloud-intelligence.test.cjs tests/contractor-operating-flow.test.cjs
node scripts/verify-intelligence-context.cjs
npm run test:browser
```

Browser context script starts a localhost-only host, signs a synthetic JWT, invokes actual server authorization/context code over HTTP and the existing browser command registry; its database is an explicitly synthetic read-only fixture. At 390×844 / 1280×900 it checks owner context, member withholding, mid-read downgrade, offline failure and zero API writes. Results: `artifacts/intelligence-context/results.json`. It is not evidence of a live Cloudflare session, real D1 synchronization or physical iPhone acceptance.

Seed: `tests/fixtures/contractor-operating-flow-v1.json`. Inquiry→customer→accepted quote→assigned job→recorded labor/material costs→invoice→manually recorded payment retains shared IDs, revisions and source timestamps. The existing detectors flag recorded cost/labor overruns. The recorded payment covers the invoice, while bank/provider collection remains unknown. Rival explanations include unimported confirmation and scope/estimate variation; no cause or profit is asserted. The fixture deliberately includes an unsupported settlement claim to prove it is not promoted to verification. No seeded business data is installed in the real app.

Limits: 200 permitted source records, 100 invoice lines and bounded scalar fields; larger datasets fail closed, not partial summaries. Existing four membership roles only; no job-scoped field-account grants or invitations. Future provider/model and financial-action orchestration remain behind authorization and real acceptance gates. **0/62 pain points retired.**

## H03 authenticated two-device replay and revocation demonstration

Run `node scripts/verify-two-device-sync.cjs` after `npm ci` and installing Chromium. Inspect `artifacts/two-device-sync/results.json` and the two **synthetic** SQLite snapshots. The test binds localhost port 4201, creates isolated temporary databases from committed migrations and signs an ephemeral test identity. It exercises real server JWT/membership/record SQL and two independent browser IndexedDB stores. It does not call Cloudflare, grant live access or require a provider key.

Observe revision **1→2** by device B, while A's offline draft becomes **conflict_needs_review**. A corrupt response after an actual commit becomes **indeterminate**, then **committed_verified** only after reload/readback, with one write/audit. Revocation yields actual server **403**, no new record and audit count **3→3**; A retains **queued_local**, never remote success. This is authenticated synthetic engineering acceptance, not two physical devices or a real Cloudflare deployment. The full CI browser gate now requires **26/26** named scenarios alongside restore/offline and reviewed-transfer suites.
