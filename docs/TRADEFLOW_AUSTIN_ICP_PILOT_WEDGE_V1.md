# TradeFlow — Austin Electrical Contractor Beachhead ICP and Pilot Wedge v1
**Date:** 2026-11-01  
**Status:** Founder-provided preliminary research intake; product hypotheses, NOT independent verified market counts, buyer interviews or purchase commitments.  
**Priority:** Small commercial electrical projects plus related commercial service/maintenance. Residential service remains compatible but not the initial commercial pilot.

## Source and evidence separation

This document summarizes the *user-provided* "TradeFlow — US Electrical Contractor Market Research" assessment dated November 1, 2026. The associated Markdown report and 11-tab spreadsheet were described but **their underlying file contents were not attached or read in this engineering session**; do not claim verification of individual companies, competitor pricing, market counts, 30 pain-point entries or 20 scenario fixtures on that basis.

Preliminary report conclusion: **Conditional / validate first.** Census NAICS 238210 exact US employer firm counts, Austin SAM, employee distributions, observed willingness to pay and acquisition conversion data remain UNVERIFIED. Licenses, firms, establishments and nonemployers must not be conflated. A 5–9 + 10–19 Census proxy does not prove exact 5–15 population. All commercial revenue/pricing assumptions require validation.

## Three segments; single product architecture

1. **Primary:** owner-led commercial electrical **service plus small project** contractors. Employee hypothesis: 5–15; Austin metro. Work: tenant improvements (TI), renovations, short work orders, maintenance and smaller commercial jobs. Owner/GM buyer. Product wedge: labor capture, material attribution, budget-vs-actual contribution visibility, change-order tracking and invoice readiness.
2. **Secondary:** commercial service and maintenance specialists. Reuse customer, job, labor, material, invoice and scheduling data, with recurring work orders and service contract nuances.
3. **Tertiary:** residential electrical service. Preserve core platform flexibility; defer residential-specific dispatch/lead-conversion product claims.

Do not assume commercial is more profitable simply because average project tickets could be larger. Verify gross margin, working capital, operational constraints, sales cycle, churn and competitive displacement per segment.

## Target buying committee and adoption chain

- **Economic buyer:** owner/president/GM carrying job margin and cash-collection responsibility.
- **Implementing operator:** office administrator/bookkeeper; may need QuickBooks/import/export and invoice review.
- **Influencers:** estimator/project manager comparing bid allowance to actual job scope; foreperson ensuring field capture is quick and unobtrusive.
- **Adoption risk:** fields must be simple enough to collect on a busy site without increasing crew paperwork. A manager-only dashboard with untrusted field inputs does not validate the wedge.

## Highest-priority pains to test (NOT empirical prevalence ranking)

1. Unknown job profitability → verified contribution margin during work, with expenses and period completeness disclosed.
2. Late labor capture → time from field work to correctly attributed hours and confirmed rates.
3. Unapproved change orders → identified scope changes with auditable approval state.
4. Delayed invoicing → completed work to validated invoice-ready draft.
5. Unassigned material purchases → attributed costs with supplier receipts and unresolved links.
6. Estimate assumptions lost at handoff → verified bid-to-job scope/quantities.
7. Manual invoice follow-up → receipts/AR evidence and a reviewed task, not an unapproved message.
8. Disconnected field records → verified minutes to retrieve/enter/reconcile evidence.
9. Unbilled completed work orders → evidence-backed invoice readiness, not fictitious revenue recognition.
10. Inconsistent time coding → job/phase allocation accuracy with corrections logged.

## First paid-pilot product: “Job-to-Cash Visibility”

**Product promise to test:** 'Know which jobs need attention and which completed work is ready to bill, without chasing spreadsheets or asking your crew to do more paperwork.'

### Three linked capabilities

**A. Capture:** Quick, offline-first field capture of labor time, attributable material spend and relevant job notes; maintain user identity, job/phase, timestamp, original source, revision, edit history, receipt and sync status. Do not claim automatic payroll or vendor settlement verification.

**B. Explain:** Deterministic calculation of verified estimate vs recorded actual, missing cost categories, documented scope changes and invoice state. Expose `unknown` not false $0. Show confidence, period, units, record source revisions, and clear 'recorded vs independently verified' labels. Qwen only narrates permitted validated claims.

**C. Prepare:** Read-only AI identifies actionable exceptions and can prepare a typed internal cost review or invoice-ready draft through existing command/approval/audit infrastructure. Sending customer follow-up, issuing an invoice, charging money or modifying schedules requires distinct explicit permission and receipt validation.

### Concrete pilot acceptance scenario

1. Owner opens company dashboard, asks 'Which active small commercial jobs are outside their labor allowance and which completed jobs are ready to bill?'
2. H04-01 checks current tenant role and retrieves bounded authorized evidence. No cross-tenant records or unauthorized finance fields.
3. Trusted calculations evaluate hours vs allowance (distinct from fully burdened monetary variance), incomplete material allocation, available change-order records and invoice/link status. Missing rates → no dollar overrun claim.
4. Assistant cites revision-bound records, explains why certain work needs review, and offers **Prepare review** or **Prepare invoice draft** (no execution by text generation).
5. Owner reviews fields, approves through existing command pipeline, sees verified receipt or clear uncertain state; offline interruptions cannot blindly replay.
6. Text and eventual voice transcripts share one persistent TradeFlow AI thread. Voice is optional and has no additional authority.
7. Owner/crew usability is measured with a baseline, not presumed.

## Ten-day validation fixtures (fictional, not research observations)

| Fixture | Seeded input | Expected result |
| --- | --- | --- |
| Small TI labor exception | 120h allowance, 158h recorded | 38h over allowance; $ impact **unknown** without valid labor rates |
| Service payment follow-up | issued $8,000 invoice, verified recorded receipts $3,000 | $5,000 recorded open balance, external settlement uncertainty and owner-reviewed next step |
| Missing materials | approved PO not yet matched to attributable expense | incomplete cost basis; margin unknown |
| Change order awaiting owner | extra work performed, no approved amount | show unapproved scope; do not assert recoverable revenue |
| Finished job unbilled | completed job, no linked issued invoice | candidate invoice-readiness review, not recognized revenue |
| Quote without award | $7,500 estimate outstanding | potential opportunity, not secured revenue |
| Cross-tenant prompt | role lacks project financial permission | no job-cost leakage |
| Revocation during response | membership changes after evidence read | discard previous answer; deny |
| Offline sync uncertain | server receipt lost after draft-save | reconcile idempotency; no duplicated invoice |
| Voice interrupted | TTS speaking; owner says 'Wait' | old audio stops; same thread gets new *final* user transcript only |

## Market validation — 30 day decision gates

**Days 1–5:** construct deduplicated 100+ **candidate** Austin firms from license/business records; verify entity, employee band, commercial work type, actual office/owner and usable contact. Do not equate seeds with qualified prospects.

**Days 6–12:** 20 structured owner/GM interviews (targets, not completed); observe recent consented estimate, time, materials, change order and invoice workflows. Record quantified economic consequence and current solution.

**Days 13–19:** identical synthetic task fixtures against TradeFlow and at least four competing tools. Score speed, correct status, workflow count, offline correctness, export/accounting interoperability and failure recovery.

**Days 20–25:** specific offer/WTP tests and genuine paid-pilot requests. Record actual yes/no, objection, decision cycle, migration burden; **verbal excitement ≠ commitment**.

**Days 26–30:** revise firm-level TAM, employee/work-mix SAM, Austin reachable universe and economics using observed cohort evidence. Explicit go/narrow/no-go decision; do not expand nationally by assumption.

Research report's proposed *experimental thresholds* (not benchmarks): ≥8/20 owner interviews substantiate meaningful recent margin/billing problems; ≥5/8 observed workflows improve without added administrative work; ≥3/8 qualified pilot firms make genuine paid commitments. These denominators must remain honest if actual recruited counts differ.

## Commercial and engineering priority rule

Product focus is the **owner's job-to-cash decision loop**, not premature replacement of mature FSM systems. Connect to common software only when real interview/export evidence warrants specific adapters; do not claim QuickBooks sync before verified integration.

Continue the existing code architecture, draft PR #16, tenant isolation, offline-first records, shared approval/receipt command infrastructure. Do not merge/deploy, migrate production D1, enable real billing, provision live identities or contact customers without explicit approval.

## Research gaps to close before numerical claims

- Extract and verify US NAICS 238210 **firm-level** SUSB 5–9 and 10–19 sizes with vintage and definition; compare CBP employer establishments and NES separately.
- Build complete deduplicated Austin employer prospect universe; confirm employees, commercial mix, active license, likely buyers and software used.
- Validate job profitability problem frequency/economic severity through direct evidence; compare with vendor capabilities, not just marketed feature lists.
- Verify subscription price tolerance, onboarding/migration hours, provider inference/voice cost, sales cycle, churn and conversion from observed cohorts.
- Obtain actual Markdown report and Excel workbook if precise 15 account leads, 30 hypotheses and 20 scenarios need to be imported or cited.

**Validation status:** No completed contractor interviews, signed pilots, conversion measurements, independently verified SAM/TAM or claimed product outcomes from this intake.
