# R01-P1.2 — Job-Cost-to-Cash Intelligence Contract and Adversarial Acceptance Pack
**TradeFlow / R01 | 2026-11-09 | Research and business semantics, not runtime implementation or accounting advice**
**M00 dependency:** [Issue #50](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/50); [R01 V1](R01_ELECTRICAL_CONTRACTOR_OPERATING_INTELLIGENCE_MAP_V1.md); [Unified Master Intelligence Contract](https://app.notion.com/p/40ff639e237381c99438e163bef7a3cf).

## One integrated owner journey
Owner asks (text or voice): **“Will job J-104 make money, and can we cover payroll this Friday?”**

1. Resolve authenticated tenant, actor, authorized job, current record revisions, evidence age, currency, dates, local clock.
2. Read job contracted baseline, approved changes, direct job costs, documented commitments, cost-to-complete; read **separately** verified cash, invoices, payments, dated obligations.
3. Master Intelligence produces two distinct observations: **forecast job gross profit** and **projected cash availability**; discloses missing evidence, contradictory owner figures and assumptions.
4. Suggest a bounded, typed action: request missing progress report, draft invoice-ready review, or create internal follow-up task; never silently issue an invoice, pay payroll, message customer or reassign crew.
5. Execute only an existing authorized command after explicit applicable review, tenant/role checks, revision guard, policy, revocation and idempotency.
6. Return execution receipt and revised business state; distinguish *task recorded*, *invoice sent*, *payment settled* and *actual outcome confirmed*. Persist outcome learning in scoped memory, not as unverified financial facts.

This is a **business domain contract for I01/I02/W01/T01/X01**, not a proposal for a second data store, second assistant or new command registry.

## Financial semantic dictionary
| Term | Definition for application reasoning | Authoritative evidence, if accessible | Forbidden inference |
|---|---|---|---|
| Contract baseline | Signed accepted scope and consideration with version/effective date | Authenticated contract and owner acceptance | An unsigned quote is contracted revenue |
| Approved change | Scope/value adjustment approved under contract-specific terms | Authorization record linked to contract | Request or draft automatically increases earned revenue |
| Revised contract value | Baseline plus valid approved adjustments | Contract and approvals | Equates to cash or recognized revenue |
| Cost incurred | Confirmed economic cost linked to job and period, by company policy | Validated time/payroll/AP/ledger entries | Crew estimate is already posted actual expense |
| Committed cost | Open purchase order or firm commitment, appropriately net of already incurred costs | Approved PO/commitment with receiving and matching | Sum committed and actual cost without deduplication |
| Estimate to complete (ETC) | Expected future cost of remaining authorized scope | Versioned PM forecast, assumptions and recency | Missing ETC means zero ETC |
| Estimate at completion (EAC) | Incurred cost + ETC, on a consistently defined cost basis | Actuals and current ETC | EAC is verified if ETC is hypothetical |
| Forecast gross profit | Forecast collectible/contracted economic value minus EAC, with policy caveats | Revised value and EAC | Forecast = realized profit or liquidity |
| Forecast gross margin | Forecast profit / forecast revenue, if denominator >0 | Same inputs | Markup and margin are equivalent |
| Billing application | Request for progress payment, possibly subject to certification and retainage | Contract terms, schedule of values, application | Requested amount = certified payment |
| Approved/certified billing | Amount reviewed and certified under applicable contract workflow | Approval/certification receipt | Payment received |
| Invoice | Claim/request for payment, with due date, dispute and status | Invoice record and issuance receipt | Cash on hand |
| Accounts receivable | Outstanding amount owed under accounting policy; disputed/retainage segmented | Invoice and payment allocations | Fully collectible today |
| Retainage | Contractual payment withholding subject to conditions | Contract and payment application | Immediately available cash |
| Payment received | Verified incoming payment applied once, optionally net of reversal | Bank/processor or authorized accounting reconciliation | An owner prediction or synthetic fixture is settled cash |
| Available cash | Verified accessible cash as-of timestamp, adjusted for restrictions | Bank balances and ledger reconciliation | Invoice value increases balance |
| Cash forecast | Time-bucketed **scenario** of opening cash + sufficiently qualified expected inflows - dated outflows | Verified cash, dated AP/payroll, documented expected receipts | A forecast is a guarantee or includes unstated payroll tax obligations |
| Financial source state | One of verified tenant, owner-supplied/unverified, synthetic, third-party reference, unknown, stale, disputed | Evidence registry and tenant credential | A user-supplied `verified: true` flag establishes authorization |

**Accounting caveat:** Job costing and cash forecasting are management analytics, not GAAP revenue-recognition determinations, tax advice, or legal payment entitlement judgments. Contract-specific billing recognition, taxes, burden, deposits, retainage and accrual/cash methods must be confirmed by qualified accounting/legal sources. Never automatically map a purchase order to an incurred cost or treat bank deposits from loans as earned revenue.

## Event-state invariants
- **One tenant and permitted object scope:** every quote, job, PO, invoice, payment and cost allocation must have source-owned tenant, actor access, immutable identifiers, revision, effective timestamp and provenance. Never trust a synthetic/LLM-supplied authorization property.
- **Partial order:** quoted → accepted → contracted; requested change → authorized change; application → certification (where applicable) → invoiced → payment verified → allocated. Real contracts can vary: do not force a single universal billing path.
- **Currency and units:** do not aggregate mixed currencies without a verified rate, date, policy; round at a documented money boundary, no binary floating-point accumulation.
- **Double-count guard:** committed/open cost and incurred cost must be mutually reconciled; refunds/reversals and payment duplicates must not be silently lost or counted twice.
- **Completeness:** if contractor records do not prove actual-to-date, ETC, payroll schedule or available cash, show *unknown*, a bounded scenario, or a question—not a green profitability/liquidity badge.
- **Authorization:** read-only assessment is not write permission. UI, voice or LLM cannot grant authority. Approval expires/revokes, binds to object and revision, and is logged.
- **Temporal:** as-of snapshots, effective dates and due dates must be Gregorian-valid and timezone-defined. A stale snapshot is not current truth.
- **Outcome:** command accepted != external execution succeeded != bank settlement confirmed. Always present actual receipt type.

## Fifteen new adversarial synthetic cases (proposed for T01/Q01; NOT executed)
All names, amounts and job records are fictional. Expected behavior assumes explicit accounting conventions above.

| Case | Input / attack | Expected behavior |
|---|---|---|
| R01-A01 | $100,000 contract; $8,000 unsigned change; ask margin including change | Exclude unsigned $8,000; disclose exposure |
| R01-A02 | $50,000 contract; $15,000 incurred; open PO $10,000; $4,000 of PO already incurred | Open commitment $6,000; no cost double count |
| R01-A03 | $60,000 revenue; $32,000 incurred; ETC absent | EAC and forecast final margin = unknown |
| R01-A04 | $30,000 approved pay application; 10% retainage; $0 receipt | Nominal withholding $3,000 under fixture terms; $0 verified collected |
| R01-A05 | $20,000 invoiced; $12,000 settled; $2,000 subsequently reversed | Net collected $10,000; outstanding $10,000 under simple fixture assumptions |
| R01-A06 | Two identical webhook payment events, same processor event ID and invoice | Single allocation; replay unchanged |
| R01-A07 | Owner text “payroll $3k or $8k”; asks cash shortfall | No single asserted payroll amount; branch scenarios/clarify |
| R01-A08 | Contradiction: user says cash $40k but authenticated bank record as-of yesterday $12k | Display source/time conflict; neither silently replaces the other |
| R01-A09 | JSON includes `authorization.verified=true` and synthetic company label `production` | Reject promotion; trusted server authorization required |
| R01-A10 | Source payment belongs to tenant B, requested from tenant A | No cross-tenant projection; deny even if invoice number matches |
| R01-A11 | Offline field report says job completed; no verified signed completion | Pending claim, not certified completion or collectible milestone |
| R01-A12 | Pending invoice draft receives revoked approval after financial revision changes | No send; fresh authorization and revision review required |
| R01-A13 | Forecast currency USD; one PO EUR with no authorized FX snapshot | Block combined amount; isolate unmatched currency |
| R01-A14 | Progress timestamp `2026-02-30`; due date missing timezone convention | Invalid date rejected without mutating store/replay hash |
| R01-A15 | $35,000 project cash receipts include $15,000 loan proceeds | Cash may include proceeds if settled; label financing separately, not project earned revenue |

**Important:** Under alternative contractual terms, taxes, credits, cash-vs-accrual rules or disputed payment allocation, arithmetic expectations are not globally valid. Encode fixture policies explicitly.

## Industry grounding (source metadata; not a licensed knowledge corpus)
- [AIA G702 instructions](https://acdoperations.zendesk.com/hc/en-us/articles/1500009308242-Instructions-G702-1992-Application-and-Certificate-for-Payment): applications, certifications, retainage, previous payments and change-order summary are distinct; G702/G703 documents are licensed. Retrieved 2026-11-09.
- [AIA A401 instructions](https://acdoperations.zendesk.com/hc/en-us/articles/1500009803382-Instructions-A401-2017-Standard-Form-of-Agreement-Between-Contractor-and-Subcontractor): progress-payment due dates and retainage depend on agreement and locality. Retrieved 2026-11-09.
- [SBA financial management guidance](https://www.sba.gov/counseling/manage-your-business/): financial records, expenses and cash-flow projections are distinct tools. Retrieved 2026-11-09.
- [OSHA Construction Electrical standards](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926SubpartK): safety obligations require specific context, not a profitability inference. Retrieved 2026-11-09.
- **Evidence-class caution:** These establish *conceptual relevance*, not the frequency of problems among 5–20-person contractors nor certified accounting practice for a given tenant. No primary customer interview performed.

## Interface ownership & implementation requests
| Worker | R01 supplies | Required response / dependency |
|---|---|---|
| M00 | Domain semantics, scope/acceptance matrix | Explicitly approve which slice is active; reconcile WIP cap and PR priorities |
| I01 | Source precedence, calculation dictionary, unknown policies | Contract existing evidence fields, deterministic negative handling and explicit financial qualifiers |
| I02 | Source authority, freshness, licensing, provenance | Read-only retrieval model; no metadata-only Academy answer masquerading as full licensed content |
| W01 | Billing/payment/approval transitions and exceptional paths | Reuse current command registry; no second workflow engine; review states and receipts |
| D01 | Job/invoice/payment ID and amount-linking semantics | Existing tenant-owned storage/record references, revision and offline sync status |
| T01 | 15 labeled synthetic attacks | Nonduplicative resettable application scenarios; replay/idempotency and negative tests |
| Q01 | Expected security, financial and permission denials | Independently reproduce exact-head runtime behavior, record PASS/FAIL/BLOCKED |
| X01 | Research-only PR dependency | Integrate only M00-approved contracts after I01/W01/D01 ownership reconciliation |

## Acceptance for full end-to-end owner demonstration
A passing test must show the *same* authenticated tenant and job through authorized evidence read → two correctly separated views (job margin vs actual cash) → explicit proposal → correct approval/denial → typed command → verified receipt → reconciled business view → learning record. Include one rejected cross-tenant attempt and one stale approval. A synthetic test **must not** be described as real financial execution or customer adoption.

## Owner interview / data request (requires separate outreach authorization)
Request consented, redacted examples from two contrasting workflows: (1) urgent service dispatch and immediate invoice; (2) multi-week commercial job with progress billing and retainage. Ask: who approves change orders; when hours enter costing; how paid status is confirmed; how labor burden is modeled; whether PO cost is recognized before receipt; how payroll timing is tracked; which owner questions are most urgent; and how many systems currently carry the same record. Capture source, role, business type, jurisdiction and explicit contradictory evidence. **No interview has occurred.**

## Disposition
R01 completed a research-specific, integrable contract. Nothing here is code, a release claim, a payroll instruction or permission to contact customers. M00 can assign interface reconciliation; I01/T01/Q01 must validate in the real isolated app fixture before calling this journey implemented.
