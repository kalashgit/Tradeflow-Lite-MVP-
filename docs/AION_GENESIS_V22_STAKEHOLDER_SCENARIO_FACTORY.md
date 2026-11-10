# AION Genesis Evaluation Laboratory v2.2 — Whole-Business Scenario Factory

**Scope:** a new, deliberately inexpensive, deterministic **synthetic
information-flow laboratory**. It generates source records and delayed
stakeholder deliveries that can later drive a causal business state
simulator and candidate Genesis agents. It is not live TradeFlow data and
does not prove a Genesis policy improved decision quality.

## What it was designed to reproduce

TradeFlow's founder-approved operating model is one tenant/job-scoped
business truth and bidirectional stakeholder network, not ten independent
applications. The source documents call for:
- owner/executive ⇄ office ⇄ project manager/dispatcher ⇄ field
  foreman/technician, with supplier/customer/inspector/finance exchanges;
- source-linked records with revisions, timestamps, access, receipts and
  explicit later verified outcomes;
- workflows covering opportunity → quote → job → crew/materials →
  field change → inspection → invoice → collection;
- **delivery ≠ acknowledgment ≠ approval ≠ committed action ≠ verified
  completion ≠ payment**;
- offline, stale, conflicting, delayed and denied information without
  inventing records or authorization.

Reference architecture, direction and constraints:
- [TradeFlow canonical source](https://app.notion.com/p/40cf639e237381be888be113c3d10565)
- [Bidirectional operating network roadmap](https://app.notion.com/p/40cf639e2373817381c8ee70b7e68368)
- [Canonical software/data contract](https://app.notion.com/p/40cf639e237381caadc7d007fb3fa835)
- [Founder workflow universe](https://app.notion.com/p/40df639e23738195a78ae4e0bfc81ebf)

These sources provide **intended contracts**, not proof the full shared
network is already operating in production.

## V2.2 implementation — generated source truth and stakeholder knowledge

New code:
`research/aion-v06/aion_genesis/eval_v2/network_factory.py`
`research/aion-v06/aion_genesis/eval_v2/network_runner.py`

The seeded factory produces a fictional tenant with **2–6 interleaved
projects** and an event stream for **10 stakeholders**:

owner, office, project manager, dispatcher, foreman, technician, supplier,
inspector, finance and customer.

It covers seven workflow families: quote-to-job, supplier/materials,
dispatch/field, change orders, permitting/inspection, invoice readiness,
and collections. Cases rotate through **12 distinct disruption modes**:
normal flow, supplier shortage, delayed field blockers, scope changes,
inspection rejection, invoice dispute, late payment, out-of-order source
revision, approval revocation, contradictory field reports, lost supplier
acknowledgment, and owner priority conflict.

Per scenario: stable fictional IDs, actor, source record stream, revision,
origin time, evidence pointer, job, amount, event status, stakeholder
recipient, delivery time/channel, and event provenance digest.

The independent evaluator stores the **complete fictional truth**.
A candidate-facing `public_view(role, tick, tenant)` receives only
previously **delivered** messages for that exact business and stakeholder.
Later deliveries and source events are not shown early. A higher revision
wins even if older information arrives afterward. Other tenants and
revoked roles are denied. The simulator tracks missing and stale
information per authorized role without exposing its hidden truth.

This allows specific scientific questions:

- Can Genesis detect that the crew has sent a blocker, but the PM has not
  received it yet, without falsely claiming the PM knows the answer?
- Can it relay an appropriate request to the office or supplier without
  leaking financial information to a technician?
- Can it distinguish a supplier *acknowledgment* from delivery or job
  completion and a customer *payment received* from ledger reconciliation?
- Does a corrected fact supersede a prior revision even when older
  offline messages arrive late?
- Does an updated owner priority or withdrawn quote approval invalidate
  a previous plan?
- Can it preserve provenance and identify information it cannot verify?

### Scale and artifacts

The default dev generation is **120 scenarios** from seeds
620000–620119. The public, disjoint validation seed range begins
720000 and is **not** an independently sealed holdout. A generator
run is deterministic for a pinned Python version and exact code SHA.
The fast CI job outputs:
- `result.json` aggregate scenario, workflow, disruption, role
  and information-lag coverage;
- `ledger.jsonl` append-only hash-chained source events, deliveries,
  point-in-time role audits;
- `review.md` readable coverage and limitations;
- `manifest.json` artifact SHA256 integrity;
- `timing.json` measured local throughput (environment-dependent,
  excluded from replay).

The replay service regenerates every source and delivery and verifies
the ledger and report. It does **not** use an LLM, real accounts,
network connections or production actions.

Run:
```bash
cd research/aion-v06
python -m unittest discover -s tests -p test_eval_v22_business_network.py -q
python -m aion_genesis.eval_v2.network_runner run \
  --split dev --count 120 --out /tmp/genesis-business-network-v22
python -m aion_genesis.eval_v2.network_runner verify \
  --out /tmp/genesis-business-network-v22
```

## Important scientific limitations

**This is a scenario factory, not yet an end-to-end agent tournament.**
The source-truth and stakeholder knowledge model is a first horizontal
slice. It does not simulate every company accounting state or every
jurisdiction's permits and laws. All scenarios share a simplified process
grammar despite varied events and disruptions. Next we need a richer,
independently authored behavior and state-transition library.

**Knowledge and authority are separate.** A message visible to a
stakeholder does not authorize that stakeholder to execute a purchase,
invoice, payment, employee role change or job revision. In future
versions permission checks must use source-validated capabilities,
not the label `owner` in the event stream.

**This is not a security isolation boundary.** Scenarios and their
truth-generating code exist in the repository. The candidate must be
isolated in a separate restricted evaluator to make the information
boundary adversarially reliable. The public validation set is not
protected.

**More scenarios are not necessarily better tests.** The generator
must be evaluated for ecological validity, diversity, coverage,
contradictions and withheld factors. Repeated variations of one
oversimplified grammar must not be counted as 120 independent
business situations. Human expert review and independent unseen
world-authoring remain critical.

## Next four development packets

1. **State-transition engine:** combine the network envelopes with
   simulated quote, job, crew, supplier, inventory, receivable and cash
   ledgers in the existing v2.1 portfolio sandbox. The independent world
   decides truth; Genesis only sees permission-filtered evidence.
2. **Scenario grammar v2:** independently authored contractor task
   archetypes; per-domain typed event contracts and causal prerequisites;
   orthogonal randomized cost, delays, roles, disruptions, objectives
   and process state. Use seed manifests and independent reviewer
   calibration, not random stories alone.
3. **Agent adapters + benchmark:** candidate may read authorized
   snapshots and propose typed actions. Judge tests real simulated
   downstream effects, information fidelity, missed opportunities,
   tail risk, harmful execution, and adaptive recovery against simple
   deterministic policies. Keep original frozen v1 scorer unchanged.
4. **Protected external custody:** scenario generation and hidden
   dynamics for true release-time evaluation must move outside
   candidate-visible repos and CI. Pinned code and budgets, one-use
   access approval, aggregate release and independent adjudication.

## Claude Code architecture implications

Claude should focus on three potentially transformative designs:

**A. Causal operational world model:** infer business state from partial
actor-scoped evidence; represent dependencies, epistemic uncertainty,
delayed effects and cash/resources. Plan action sequences across jobs
and roles under hard owner-goal, authorization and budget limits.

**B. Evidential long-term memory:** learn from actual verified
source/receipt/outcome chains, not just similar texts; preserve
actor/tenant/source revisions and invalidate stale lessons. Separate
observed event, belief, counterfactual hypothesis and measured result.

**C. Verified multi-stakeholder workflow operator:** plan, request
approval, route handoffs, execute *only authorized typed actions*,
verify receipts, reconcile uncertain commits, and recover.

Give Claude major architecture tasks and interfaces; run scenario
generation, metamorphic tests, replay and monitoring in CI without
paying for Claude to write one-off tests for every change.

**No new model candidate, human calibration, customer pilot,
secure holdout or release promotion has been completed by this
v2.2 infrastructure work.**
