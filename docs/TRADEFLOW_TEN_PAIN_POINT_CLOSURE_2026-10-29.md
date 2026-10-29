# TradeFlow — First 10 contractor pain-point closure programme
Date: 2026-10-29
Branch: feature/library-universal-intake
Evidence generator: node automation/run-ten-pain-points.cjs
CI artifact: tradeflow-ten-pain-points

## Scoring policy
These ten items are provisional scenario mappings from the existing engineering rollout. They do not claim to reproduce verbatim rows of the underlying 62-item research register. The original register row IDs and wording must be reconciled before retirement.
Each item must pass four independent gates:
1. CODE: target test and full regression suite pass on the exact deployed commit.
2. PRODUCT: actual preview interaction works on iOS Safari and desktop, including persistence and navigation.
3. OPERATIONS: owner approvals, safety boundaries, reconciliation and error handling work with realistic data.
4. OUTCOME: a contractor verifies resolution of the original register problem, with before/after time, errors or cash outcome.
No item is 4/4 or retired on a code test alone. Baseline retired: **0 of 62**.

| ID | Candidate contractor pain point | Current feature | Specific field acceptance | Code | Product | Operations | Outcome |
|---|---|---|---|---|---|---|---|
| TF-P01 | Stale quotation not followed up | Existing Notifications + quotes | Create sent, old and recently contacted quotes; old uncontacted quote appears, resolved quote clears, action remains draft-only | Pending CI | Open | Open | Open |
| TF-P02 | Unpaid invoice overlooked | Revenue + Notifications | Issue invoice, record partial payment, verify remaining balance and accurate overdue warning; paid/draft excluded | Pending CI | Open | Open | Open |
| TF-P03 | Crew booking collision | Calendar and Dispatch | Book overlapping work with same resource; receive conflict; separate crew/cancelled work excluded | Pending CI | Open | Open | Open |
| TF-P04 | Extra work without approval | Existing Job + change orders | Propose added work, see review; record genuine independent approval evidence, alert clears without fake invoice | Pending CI | Open | Open | Open |
| TF-P05 | Job budget overspend missed | Existing Job Costing | Enter budget, actual costs and expenses; overrun alert appears and clears on genuine correction | Pending CI | Open | Open | Open |
| TF-P06 | Labor hours exceeded estimate | Job Costing + Notifications | Enter estimated and actual quarter-hour time; variance appears with accurate arithmetic; no false time-tracker claims | Pending CI | Open | Open | Open |
| TF-P07 | Payment discrepancy overlooked | Invoices + Notifications | Enter duplicate/excess payment, wrong currency and customer; warn without claiming bank settlement | Pending CI | Open | Open | Open |
| TF-P08 | Bidding without readiness checks | Opportunity dossier | Pursue bid without scope/capacity/invitation confirmation; see alert; complete verified fields and clear | Pending CI | Open | Open | Open |
| TF-P09 | Quotation reuse loses control | Quote dossier | Duplicate accepted quote as unsent draft, no inherited customer, signature or approval; revise/save independently | Pending CI | Open | Open | Open |
| TF-P10 | Customer account value unclear | Customer dossier | Inspect receipts/costs in one customer; mixed-currency or wrong-customer entries excluded and incompleteness highlighted | Pending CI | Open | Open | Open |

## How automation operates
- Every push changing tests, source, public app, automation or CI on feature/library-universal-intake enters the existing Library pilot workflow.
- Before deploying, the workflow runs the whole Node test suite plus targeted scenarios.
- Each target's test log, machine-readable results JSON and Markdown summary are uploaded even on failure. On any target regression, the deployment job stops.
- The report intentionally sets contractorVerifiedRetired to 0. It is not a fabricated field-study result.
- The Access-protected /api/v1 endpoint is not used for app feature tests; identity and account access remain separate security gates.
- Manual contractor validation should later be linked to exact existing register rows and the actual run SHA/artifact; only then can an item be retired.

## Prerequisites not bypassed
- Latest Actions run result must be read from the actual push workflow, not inferred from a source commit.
- iPhone and desktop testing, IndexedDB preservation, and meaningful after-reload scenarios.
- Connected inbox, accounting and payment integrations must be verified before promising autonomous sending, settlement or real-world follow-up.
- Do not introduce duplicate Notifications/Jobs/Quotes/Customer screens or classify local drafts as external outcomes.
