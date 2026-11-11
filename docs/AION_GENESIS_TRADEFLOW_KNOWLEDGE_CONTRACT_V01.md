# AION Genesis ↔ TradeFlow — domain intelligence contract (research proposal v0.1)

**Founder direction, 11 November 2026:** Genesis is a standalone reasoning and
learning system. TradeFlow is one application/domain integration, not the owner
of Genesis's memory architecture. Give it deep electrical-contractor knowledge
and current *authorized* company context so its decisions are useful.

**Status:** architecture and information requirements only. No bulk corpus has
been ingested, no live connector is enabled, and no customer data is admitted
to the current synthetic-only Genesis runtime. No merger, deployment, model
spending, new permissions, or live business actions are authorized here.

## 1. Separation of responsibilities

| Independent Genesis core | Replaceable TradeFlow domain pack | Existing TradeFlow host |
| --- | --- | --- |
| Context understanding, fast/deep selection, uncertainty, source-based reasoning | Contractor vocabulary, workflow graph, curated playbooks, company-specific retrieval plans | Authenticated tenant/actor scopes, current original records, source revisions |
| Outcome attribution, episodic strategy memory, model/provider-independent evaluation | Domain action/risk semantics, expected constraints, scenario builders | Authoritative capability registry, explicit approvals, atomic authorization, persisted receipts |
| Causal hypotheses and held-out tests | Contractor-specific causal assumptions clearly labeled as assumptions | Readback-confirmed business outcomes; neither payment nor permissions may be invented |

The core must not import TradeFlow application internals. A domain adapter
implements typed, versioned interfaces; another product could replace it.
No single giant prompt or embedding store should be treated as company truth.

## 2. Four distinct information planes

### A. Curated domain library — broadly reusable, source-linked

Organize into machine-readable families, each with version, source URL/record,
jurisdiction, effective date, owner/reviewer, update cadence, and uncertainty:

1. **Commercial lifecycle:** lead, qualification, site visit, estimate, bid,
   quote, change, award, job, closeout, invoice, collection, service/retention.
2. **Electrical operations:** tasks, labor units, crews/skills, schedule
   dependencies, material BOM and substitutes, supplier lead times, dispatch,
   field blockers, inspections, handover and safety checklists.
3. **Financial meaning:** budget versus actual, committed versus paid cost,
   cash balance versus forecast, gross margin, WIP, approved scope, aged
   receivables, invoice issued versus *verified funds collected*. Calculations
   must be deterministic with explicit inputs and missing-value flags.
4. **Authority and people:** owner/office/PM/foreman/technician duties,
   approval thresholds, permissions, segregation of duties and escalation.
   Descriptive knowledge cannot become a permission grant.
5. **Compliance and locality:** applicable codes, safety, licensing, permits,
   inspections, labor and tax references *by jurisdiction and effective date*.
   Legal/safety requirements are never assumed universal or current.
6. **Contractor playbooks:** typical supplier, scheduling, customer, dispute,
   change-order and closeout failure modes, rival explanations, recovery
   actions, decision trees, measurable outcomes and known counterexamples.
7. **TradeFlow product map:** actual module/record types, field meanings,
   routes, existing detectors, typed command contracts, receipt states,
   offline conflict behavior, capability limitations and known gaps.

Source priority: verified original records and authoritative primary guidance
for facts; approved curated SOPs for recommended process; external web search
only for explicitly missing/stale knowledge and never as command authority.
Track knowledge coverage and quality per family; do not replace missing pages
with generated generic text or assert an invented catalog is complete.

### B. Live tenant evidence — never mixed into the general library

Retrieve only records the authenticated role may see, for the current case:
business/job IDs and revisions, estimates, actual labor/material usage, crew
availability, purchase/order state, schedule, blockers, changes, approved
scope, invoices, payment evidence, company objectives and policies. Preserve
`source_ref`, `source_revision`, `observed_at`, visibility, uncertainty and
correction/supersession. Minimize personal/contact data; suppress sensitive
financial fields for unauthorized roles.

The existing TradeFlow `GET /api/v1/businesses/:businessId/intelligence/context`
and shared command/receipt infrastructure are candidate *host interfaces* to
inspect, not proof of a live Genesis integration. Genesis `ObservationV1`
currently accepts **synthetic** provenance only; real company observations
require a separately designed, permission-reviewed schema/version and adapter.

### C. Capabilities — current authority, not remembered expectations

For each action, the host supplies a typed descriptor: allowed actor/role,
tenant/subject scope, required source revisions, effect class
(read / propose / approve / reversible internal commit / irreversible),
approval binding, cost/capacity preconditions, idempotency key and reconciliation
path. Genesis chooses a *proposal* and records assumptions; the TradeFlow host
must revalidate authorization/cash/capacity atomically at commit time.

If authority is missing/stale, an acknowledgment is indeterminate, or a
source revision changed, the system must fail closed or request fresh evidence.
The v2.5 denial trace shows this is not repairable by switching to deep
reasoning: eight of thirteen revoked-authority attempts were deep decisions.

### D. Outcome and strategy memory — verified and tenant-scoped

Distinguish action receipt, direct action effect, goal-level outcome and
unfinished/censored horizon. Only independently supported action-level effects
can train trusted action-success statistics. A paid job containing multiple
actions does **not** causally credit each action. A not-yet-paid job is not
automatically a verified failure. Preserve contradictory cases and age/staleness.
No real tenant-derived learning transfers to another tenant by default,
including aggregated statistics, until a separate privacy/product review.

## 3. Minimal exchange contract (proposed, not implemented)

Every retrieval/request should bind:

```text
KnowledgeQuery  = domain_version, question, workflow_stage, jurisdiction,
                  business_scope, actor/role, permitted_record_types,
                  as_of, freshness_budget, evidence_budget
KnowledgeResult = items[{source_ref, revision, observed_at, origin,
                         visibility, claim, uncertainty, applicable_to}],
                  missing, conflicts, stale, exclusions
ActionProposal  = intent, expected_effects, alternatives, source_refs,
                  source_revision_hash, risks, human_review_state
HostDecision    = authority_result, scope, actor, subject, exact_revision,
                  receipt_id, commit_state, verified_effects, unknowns
```

Retrieval order: current scoped company facts → curated domain playbooks and
known constraints → contextual episodic memory → explicitly bounded external
research if warranted. A source's mere presence never makes its advice valid.

## 4. Implementation sequence and acceptance

1. **Inventory what is already real:** reconcile the existing synthetic
   electrical `domains/electrical_contractor.py`, `electrical_strategy.py`,
   `runtime/domain.py`, TradeFlow context API and command/receipt contracts.
2. **Versioned knowledge manifest and first 50 source-backed records:** cover
   the job-to-cash chain, operational risk and financial/authority terminology;
   include sources and deliberate unknowns. The exact count is a pilot goal,
   not evidence that hundreds of business facts have already been collected.
3. **Read-only TradeFlow adapter:** use authenticated synthetic tenant data and
   strict role/field filtering, revision invalidation, stale-source rejection,
   citations and offline missing-state behavior. Do not copy entire customer
   databases into model context.
4. **Capability-aware proposal adapter:** proposals only; verify actual host
   approvals and current revisions. Add revocation-before-delivery, uncertain
   receipt, capacity, cross-tenant and role-downgrade tests.
5. **Causal outcome adapter:** distinguish job goal, action effect and censored
   outcomes, with no automatic cross-company learning.
6. **Evaluation:** compare knowledge on/off, memory on/off and baseline policies
   using preregistered **new** synthetic cohorts first, then separately approved
   real-use studies. Measure paid jobs, cash tail, prohibited attempts,
   missed opportunities, citations, freshness, cost, usefulness and calibration.

Every completed increment needs an exact SHA, synthetic/real evidence label,
independent replay and Q01 review. The protected holdout, real customer trial,
company privacy policy and production approval remain distinct gates.

## 5. Source precedence and related work

- [Genesis direction and research decisions (Notion, 10 Nov)](https://app.notion.com/p/414f639e2373815e9d0cfee659dcd3fd)
- [TradeFlow canonical product and architecture hub](https://app.notion.com/p/40cf639e237381be888be113c3d10565)
- [TradeFlow bidirectional roadmap addendum v1.2](https://app.notion.com/p/40cf639e2373817381c8ee70b7e68368)
- [ASIL v2.5 frozen draft PR #96](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/96)
- [ASIL v2.6 corrective issue #97](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/97)

**Proposal, not completion:** neither 50 curated records nor live TradeFlow
retrieval exists by writing this contract. They must be separately built and
verified before claiming domain integration.
