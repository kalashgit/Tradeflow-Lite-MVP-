# TradeFlow — Electrical Contractor Operating Intelligence Map V1
**Owner:** R01 | **Date:** 2026-11-09 | **Status:** Research candidate for M00 review; not implementation authorization.

## Evidence classifications
- **Verified external:** Primary-source statements linked below, with jurisdiction and applicability constraints.
- **Internal direction:** Founder Notion workflow catalogue, not evidence of implemented functionality or actual customer demand.
- **Product hypothesis:** Proposed TradeFlow assistance requiring customer validation.
- **Synthetic:** Test values below are fictional, not industry benchmarks.

## Internal baseline
Reviewed: [Canonical Control Center](https://app.notion.com/p/40cf639e237381be888be113c3d10565), [Development OS](https://app.notion.com/p/412f639e2373812fbb0dcd19e56ecf59), [V2 team](https://app.notion.com/p/412f639e237381fba5f5f58e2ce8f140), [Workflow Universe](https://app.notion.com/p/40df639e23738195a78ae4e0bfc81ebf), [Workflow Architecture](https://app.notion.com/p/40cf639e237381739d55fa4de1ece23c), [Academy](https://app.notion.com/p/40df639e237381928ea2eef4c1ea4d16), [Unified Intelligence Contract](https://app.notion.com/p/40ff639e237381c99438e163bef7a3cf), [Manager Handoff](https://app.notion.com/p/410f639e2373818a9cf5fc15da3e7a53), and [Workflow Catalogue](https://app.notion.com/p/40af639e237381aa9a68d617c06869ae). Existing catalogue is explicitly a working draft; do not infer production support.

## Ten-domain operating map
Each proposed capability is a **hypothesis**, not a proven customer requirement.

| Domain | Process / owner decision | Minimum records | Failure / proposed capability | Synthetic scenario | Gap |
|---|---|---|---|---|---|
| Customers and sales | Qualify, quote, follow up | Customer, site, opportunity, quote revision, contact permission | Stale quote; suggest reviewed follow-up | Unanswered quote | Actual conversion behavior |
| Estimating | Scope, takeoff, labor/material, bid/no-bid | Drawings revision, quantities, labor assumptions, vendor prices, exclusions | Missing scope; estimate completeness check | Missing supervision allowance | Licensed labor units and real estimates |
| Projects/job costing | Mobilize, cost tracking, completion forecast | Contract, costs, commitments, progress, approved changes | Labor overrun; review risk | Final cost exceeds estimate | Cost-code structures |
| Labor/scheduling | Assign qualified crew | Availability, qualifications, job readiness, assignments | Double booking; alternatives | Same electrician needed twice | Local licensing and actual staffing |
| Materials/procurement | Quote, order, receive, allocate | BOM, supplier quote, PO, receipt, delivery status | Delayed equipment; dependency alert | Late delivery | Supplier data availability |
| Invoicing/cash | Billing entitlement, collections, obligations | Contract terms, invoice, payment allocation, cash balance, payables | Invoice mistaken for cash; verified forecast | Partial payment | Accounting systems and contract terms |
| Change orders | Scope change, price, authorization, billing | Original scope, request, authorization, revision | Unapproved extra work; exposure warning | Unsigned change | Contract-specific requirements |
| Field-to-office | Reports, blockers, acknowledgment | Job, field report, timestamps, actor, receipt | Missing blocker; routed review | Offline report | Field adoption |
| Regulatory/safety | Licensing, permits, inspections, safety | Jurisdiction, edition, effective date, license, permit | Wrong rule; qualified review gate | State-code mismatch | City/state amendments |
| Owner strategy | Job mix, backlog, profitability, liquidity | Job outcomes, collections, capacity, goals | Misleading KPIs; transparent comparison | Profitable but cash constrained | Buyer validation |

## External evidence and limitations
1. [NECA Manual of Labor Units](https://www.necanet.org/education/publications/manual-of-labor-units): industry labor-estimating reference; proprietary units must not be copied without license. Applicability varies by installation conditions.
2. [ELECTRI International](https://www.electri.org/): research institution studying electrical contracting productivity; study-specific conclusions require review before generalization.
3. [OSHA construction electrical standards, 29 CFR 1926 Subpart K](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926SubpartK): federal construction safety, not a substitute for local licensing/code verification.
4. [Texas Department of Licensing and Regulation — Electricians](https://www.tdlr.texas.gov/electricians/): state-specific licensing and rule authority; verify effective edition and exceptions before any compliance recommendation.
5. [Austin Development Services](https://www.austintexas.gov/development-services): local permitting and inspection authority; verify project address and current requirements.
6. [Federal Acquisition Regulation, Part 32](https://www.acquisition.gov/far/part-32): federal contract financing/payment context; do not generalize federal terms to private contracts.

**Evidence limitations:** No new customer interviews, original contractor records, licensed labor tables, or quantitative benchmark samples obtained. No claim about national pain-point frequency or willingness to pay. Source links require dated, section-level review before automated knowledge ingestion.

## Ranked owner decisions (qualitative hypothesis)
1. Can upcoming obligations be paid? — cash, receivables, payables, payroll.
2. Which jobs risk losing money? — accepted contract, costs, commitments, remaining work.
3. Which invoices need attention? — due dates, disputes, verified receipts.
4. Is the estimate complete and correctly priced? — scope, labor, materials, pricing policy.
5. Which jobs should receive available qualified crew? — skills, availability, readiness, deadlines.
6. Which missing materials threaten the schedule? — requirements, stock, POs, delivery confirmations.
7. Is extra work proceeding without approval? — original scope, change requests, authorization.
8. Which bids merit estimating time? — fit, capacity, history, quote requirements.
9. What blocks field progress? — reports, assignments, inspection/material status.
10. Which customer/job segments should we pursue? — realized outcomes, collections, capacity.

## Engineering requirements for M00 review
- **TF-R01-001 Cash:** separate invoiced, due, disputed, collected and forecast cash; never mark paid without verified allocation. Data: balances, dated invoices, terms, payments, payables, payroll obligations. Test partial payment and duplicate receipt.
- **TF-R01-002 Job costing:** preserve accepted baseline and approved revisions; actual direct costs and estimated cost-to-complete must be distinct; missing cost-to-complete => unknown final margin. Gross profit = revenue - defined direct costs; gross margin = gross profit/revenue when revenue nonzero.
- **TF-R01-003 Estimate:** versioned scope, takeoff, labor assumptions, supplier price date, supervision, permits, exclusions and reviewed price. Do not conflate markup with gross margin: cost $8,000 at 20% margin => price $10,000; 20% markup => $9,600.
- **TF-R01-004 Scheduling:** no assignment proposal without availability, skill/license evidence, readiness and conflicts; do not infer licensing from job title.
- **TF-R01-005 Procurement:** quoted/ordered/shipped/delivered/received are distinct; no unapproved purchase or unreviewed electrical substitution.
- **TF-R01-006 Changes:** requested/quoted/approved/performed/billed/paid are distinct; contractual entitlement requires source review.

**Common contract:** tenant, actor, role, record ID/revision, currency, source timestamp, evidence status, uncertainty, approval policy, idempotency key and receipt. Finding ≠ approved command ≠ successful business outcome.

## T01 synthetic acceptance cases (all figures fictional)
| ID | Input | Expected oracle |
|---|---|---|
| T-R01-01 | Invoice $15,000; verified receipt $5,000 | Outstanding $10,000; collected $5,000 |
| T-R01-02 | Revenue $80,000; actual costs $58,000; estimated remaining $12,000 | Forecast cost $70,000; forecast gross profit $10,000 |
| T-R01-03 | Cost $8,000; target gross margin 20% | Price $10,000 |
| T-R01-04 | Same electrician assigned to overlapping jobs | Conflict, no silent double assignment |
| T-R01-05 | Equipment delivery shifts Monday to Friday | Dependent job-readiness warning |
| T-R01-06 | $4,000 work with unsigned change request | Exposure flag; not approved revenue |
| T-R01-07 | Duplicate payment event | One receipt allocation only |
| T-R01-08 | Unknown license status | Verification request; no compliance certification |
| T-R01-09 | Offline material-shortage report | Local pending state; single eventual verified event |
| T-R01-10 | Cash $12,000; known obligations $18,000 | $6,000 shortfall before uncertain inflows |

These are **proposed** oracle cases, not executed application tests. T01 must deduplicate against its existing suite and run actual runtime tests.

## Worker handoff
- **I01:** deterministic arithmetic, source-specific uncertainty, contradictory-evidence clarification, no unsupported financial certainty.
- **I02:** source registry with authority, edition, jurisdiction, date, license and review state; distinguish source registry from ingestion and from business memory.
- **W01:** map six candidate requirements to existing typed workflow and approval contracts; no second engine.
- **T01:** implement nonduplicative synthetic oracles with reset/replay, provenance, authorization and stale-event variants.
- **M00:** prioritize only after dependency and target-customer review; preserve existing labor-overrun and field-to-office integration gates.

## Open research gaps / next milestone
Conduct targeted owner/estimator interviews and obtain consented sample estimate/job-cost/cash-flow records. Compare service versus commercial-project billing and labor practices. Validate supplier integrations and local jurisdiction differences. Produce calculation dictionary and adversarial financial tests. No production actions, customer outreach, merge or deployment authorized.
