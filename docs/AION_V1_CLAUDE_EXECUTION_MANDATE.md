# AION Genesis v1.0 — Claude Code execution mandate

Status: founder-approved strategic direction; **implementation is not yet
complete**. This file is the comprehensive reference for an implementation
agent, while its launch message should remain short. Work must extend the
existing Python research package, not substitute a new project.

## Founder outcome

Build **one reusable, stateful, evidence-grounded intelligence** and an
**independent experiment/improvement laboratory** that can generate unfamiliar
causal scenarios, test changes to reasoning/learning methods, measure decision
quality and cost, and preserve verified improvements. TradeFlow is one optional
specialized domain adapter and future commercial client. The runtime, memory,
simulator and metrics must have no mandatory electrical-contractor dependency.

The founder's aspirational **100× acceleration** concerns **validated research
throughput per unit of cost and human supervision**. It is not a claim of 100×
intelligence, 100× decision accuracy, or self-improving model weights. Establish
the baseline and measure future speedups before making any multiplier claim.

## Known starting point — reconcile before work

- Repository: `kalashgit/Tradeflow-Lite-MVP-`.
- Isolated baseline branch: `research/aion-v06-qwen-bridge`.
- Last handoff commit: `1df89ac62109068dad31b1f50584fcea02b98725`.
  This is historical; fetch the actual head before implementation.
- Python research package: `research/aion-v06/aion_genesis/`.
- Established unit suite: **74 tests at that handoff**; rerun at current SHA.
- Existing components: hidden causal worlds, mechanism recovery, transfer
  experiment, model adapter/tournament scaffolding, synthetic contractor
  worlds, v0.8 SituationStore, v0.9 bounded StrategicPlanner, independent
  strategic evaluator, CLI and standalone HTML research dashboards.
- Known negative finding: v0.9 selected worse-than-wait/hold/quiet options in
  **14.5% of 200 shifted synthetic worlds**; no live strategic LLM learning
  established. The test worlds and cost estimates are fictional.

Read root `CLAUDE.md` importing `AGENTS.md`,
`docs/AION_CLAUDE_EXECUTION_PLAYBOOK.md`,
`docs/CLAUDE_TASK_PACKET.md`, scoped `research/aion-v06/CLAUDE.md`,
`research/aion-v06/ARCHITECTURE.md` and
`research/aion-v06/docs/RESEARCH_GATES.md`. Check for concurrent work and
avoid duplicate interfaces, stores, simulation engines or UI foundations.

## Architecture: one intelligence, several bounded capabilities

The required end-to-end logical contract is:

1. **Observe** a typed, source-linked event; validate tenant/domain scope,
   freshness, identity, provenance and monotonically ordered revisions.
2. **Update situation**: retain current facts, relationships, goal weights,
   known unknowns and superseded beliefs without laundering assumptions into
   facts. Existing `SituationStore` may be adapted compatibly.
3. **Route reasoning**: use deterministic cheap evaluation for obvious or
   urgent changes; invoke bounded model/strategic search only when justified.
4. **Investigate**: discover available alternatives, verify constraints and
   evidence, estimate consequences across plausible scenarios, calculate
   risk/goal tradeoffs, and choose a proposal or explicitly abstain.
5. **Review, not execute**: emit an evidence-linked, `pending_human_review`
   decision record. Only the host product's existing role-checked approval,
   command and receipt system may perform an external consequence.
6. **Learn from supplied outcome**: match a verified external/synthetic
   receipt to the prior prediction and source revisions; revise hypotheses,
   effect estimates or strategy preferences in memory, with provenance and
   reversible versioned promotion. Never invent outcomes.

### Minimal versioned interfaces (conceptual, not forced class names)

`ObservationV1`: `event_id`, `tenant_id`, `domain_id`, `scope_id`,
`subject_id`, `metric`, `value`, `source_revision`, `observed_at`,
`provenance`, `visibility`. Unknown and stale values are explicit; no
cross-tenant retrieval. Existing observation records need a compatible
migration/adapter, not a destructive rewrite.

`GoalProfileV1`: `goal_weights`, `hard_constraints`, `risk_tolerance`,
`decision_deadline`, `owner_preference_version`. A requested action may not
override a hard permission/safety constraint regardless of goal weight.

`DecisionRequestV1`: `case_id`, `observation_refs`, `goal_profile_ref`,
`available_capabilities`, `time_budget_ms`, `model_call_budget`,
`compute_budget`, `research_mode`.

`DecisionProposalV1`: `request_id`, `candidate_options`, `selected_option`,
`expected_effects`, `uncertainty`, `constraints_checked`, `evidence_refs`,
`alternatives`, `abstention_reason`, `approval_state`, `trace_id`. Never
report estimated utility as observed real financial benefit.

`OutcomeRecordV1`: `proposal_id`, `chosen_action_ref`, `observed_effects`,
`receipt_ref`, `evidence_ref`, `observation_time`, `verified`,
`uncertainty`. Only verified/explicitly labeled synthetic outcomes can
inform promoted causal estimates.

`ExperimentRunV1`: `run_id`, `source_commit`, `candidate_version`,
`baseline_version`, `domain_version`, `world_family`, `seed_partition`,
`grader_version`, `model_identity`, `memory_mode`, `budgets`,
`metrics`, `failure_classes`, `artifact_hashes`, `verdict`.

Actual module names are Claude's choice if these contracts, safety boundaries
and compatibility tests are satisfied. Do not create a redundant second
authoritative business database or direct action executor.

## Work Package 1 — Unified AION Runtime (first)

**Goal:** a working `observe → situation → investigate → proposal → outcome`
cycle with deterministic replay and one invocation interface for domain packs.

**Required implementation:**

- Coherent public Python API, module-level contracts and JSON serialization.
- Durable tenant/domain-scoped event and outcome history, with explicit
  correction/supersession and evidence lineage. Reuse existing storage.
- Deterministic fast path plus bounded deeper-planning interface.
- Pluggable domain adapter and model adapter; no hard dependency on Qwen.
- Existing TradeFlow synthetic case and at least one unrelated synthetic
  domain (e.g. equipment maintenance) through the *same* core.
- Versioned proposal and abstention records; no external actions.

**Required proof:** all existing tests pass; new tests cover event revision,
idempotency, stale evidence, tenant boundaries, missing goals, unknown facts,
invalid model replies, deadline/budget exhaustion, and no-action authority.
At least two domain packs execute the same typed API. No voice/GPU/cloud
hosting, aesthetic redesign or real TradeFlow mutation is in this package.

## Work Package 2 — Genesis Experimental Control Plane (second)

**Goal:** repeatable, measurable improvement experiments without the coding
agent being trusted to declare its own successes.

**Required implementation:**

1. **World registry/generator:** at least three distinct families initially:
   hidden causal rules, resource-allocation constraints, and multi-step
   operational dependencies. Expose only valid observations/actions; support
   stochastic outcomes, partial observability, and a distribution-shift
   variant per family. Add more world families later through the same API.
2. **Scenario/experiment runner:** frozen source commit, versioned configs,
   deterministic seed partitions, matched-world shocks, policy/model
   variants, memory-on/off modes, global inference/time budget, bounded
   retries and reproducible JSONL event traces.
3. **Independent referee:** held-out hidden state, typed validations,
   counterfactual oracles only where the simulator defines them, and a
   protected final holdout. Planner/model paths must never import hidden
   outcome code or consume scorer labels before decisions. Module separation
   in one process is not a security boundary; document any such limits.
4. **Baselines:** safe no-action, fixed-rule, current v0.9 strategist, and
   memory-disabled version of each learning candidate. Pair comparisons on
   identical scenarios and budgets. Real LLM runs are conditional on
   configured inference and explicit cost ceiling; mock runs are labeled.
5. **Experiment ledger:** immutable identifiers, code/config hashes,
   validation partition, raw outcomes, failure classes, costs, timing and
   actual model-call status. Store every failed candidate, not just winners.
6. **Promotion gate:** prespecified thresholds, baseline/holdout comparisons,
   regression and safety checks, confidence intervals, human review for
   promotion. A candidate may propose but cannot change judge rules, hidden
   test worlds, permission policy or its own promotion decision.
7. **Observatory:** reuse current standalone HTML dashboard machinery first.
   Produce phone-readable scorecards, trends, model/cost comparison, failure
   explorer, per-episode replay and PASS/FAIL/INCONCLUSIVE/BLOCKED labels.
   This is a research dashboard, not the customer's TradeFlow app.

**Required proof:** one CLI can run a bounded seeded comparative experiment
and produce the event ledger, a machine-readable result and an HTML report;
the same run reproduces identical logical outcomes; different seeds expose
variation. An independent validation job checks negative cases and rejects
falsified/inconsistent reports. No reward editing after seeing a holdout.

## Work Package 3 — Strategic Learning Upgrade (after 1 and 2)

**Goal:** make decision discovery and memory measurable within the new lab.

- Generate evidence-grounded alternatives beyond the v0.9 finite grammar,
  deduplicate, validate constraints and bound search cost.
- Compare consequences across plausible futures, choose/abstain under
  owner priorities and risk limits; retain a no-action baseline.
- Record prediction-versus-verified-outcome discrepancies and update a
  provisional effect model. Keep evidence facts, hypotheses, and learned
  policies in separate versioned layers.
- Prespecify a **fresh** shifted-world comparison to target the previous
  14.5% synthetic harmful-choice rate. The target is at least a 25% relative
  reduction with no greater than 5% drop in mean nominal utility; report
  uncertainty intervals and cost. This is a research target, not a promise.
- Include memory-on/off ablations, unfamiliar domains, misleading-memory
  negative controls, stress/counterexample search and graceful abstention.

Do not implement Work Package 3 before core and laboratory contracts are
working, unless a tiny compatibility increment is necessary and tested.

## Intelligence scorecard — measured, not invented

Every benchmark report includes both numerator and denominator, sample size,
confidence interval when applicable, scenario/domain version, runtime cost,
baseline delta, and evidence tier. Unavailable metrics must be `null` or
`not_measured`, never fabricated as a passing score.

**Capability dimensions:**

- Option discovery: valid unique proposals, coverage of a **separately
  specified** admissible set, unsupported/duplicated alternatives.
- Decision quality: expected/realized utility, regret to simulator hindsight
  oracle, worst-decile harm and proportion worse than the no-action policy.
- Learning: paired memory-on/off delta, prediction error, Brier/calibration
  when probabilities are issued, forgetting, stale-memory counterexamples.
- Adaptation/transfer: drift detection, recovery samples, failures under
  shifts, untouched-domain performance and abstention appropriateness.
- Speed/economics: p50/p95 end-to-end latency, CPU/GPU assumptions, model
  calls, tokens, wall time and monetary spend (real or explicitly estimated).
- Proactivity: true useful interventions versus false alerts and owner
  attention budget; research-only proxies until user evidence exists.
- Reliability: cited evidence validity, tenant/role isolation, authorization
  violations, malformed tool/model responses and replay determinism.
- Product value (separate, no synthetic substitution): contractor task
  success, duplicate-entry rate, invoice readiness, source accuracy,
  minutes saved, real-device acceptance and customer willingness to pay.

**Research throughput KPI:** accepted and independently reproduced
improvements / human review hour / compute cost, plus total candidate trials
and false discoveries. A 10× then 100× throughput increase is a **long-term
aspiration**. It is not interchangeable with higher decision intelligence.

## Constraints that protect the founder's vision

- AION is a portable intelligence; TradeFlow specializes it. The product
  continues to work with deterministic intelligence if research fails.
- The end-user sees one assistant and consistent text/GUI/voice context.
  Realtime voice, mobile UI and hosted background execution belong to later
  integration milestones; do not fake their completion in v1.0.
- AION may recommend; only the existing TradeFlow permissioned command,
  approval, revision-check and receipt path can act. No second writer.
- Preserve user data, existing branches, tests, research negative results,
  frozen baselines and real-world acceptance blockers.
- No credentials, real contractor records, unredacted PII, production DB
  access, live purchases, customer contact, migrations, deploy or merge.
- Do not spend paid LLM/API budgets or pull large model weights without a
  configured runtime and explicit budget. Offline seeded tests remain viable.

## Claude Code work protocol and usage economy

1. Audit current code and exact remote head once. Inventory reusable modules
   and identify contradictions. Keep the audit concise and move into code.
2. State one implementation plan ordered by dependency, then implement the
   first safe vertical slice. No repeated speculative architecture rewrites.
3. Use focused tests while editing, full existing suite at each milestone,
   exact-commit remote verification when publishing; stop rather than
   overrun an unresolved auth/permission gate.
4. Prefer standard-library/repo-installed tools, reusable scripts and
   deterministic batch runs over repeated high-token model conversations.
5. Capture machine-readable checkpoints. If available usage becomes limiting,
   preserve tested work and a clear handoff before starting another package.
6. Work on an **isolated research branch** derived from the latest verified
   research baseline. Do not write concurrent shared product files, force
   push, merge, deploy or alter the main TradeFlow development line.

### Final delivery format

For each package report: **implemented behavior, exact files/commit,
interfaces, positive and adversarial tests, reproducibility commands,
benchmark cohort/baseline, actual model inference, latency/cost, negative
results, remaining blockers, founder decisions and next bounded task**.
Never call a mock/synthetic improvement live learning or an unrun CI green.

## Scope and completion gate for the first Claude allocation

**Mandatory:** Work Package 1 plus a functioning minimal Work Package 2
(three test families, independent referee, outcome ledger, reproducible
comparison CLI, scorecard and standalone HTML). All previous unit tests must
remain green; new safety/holdout tests must pass. Publish a draft PR on a
dedicated research branch only after reconciling branch ownership.

**Stretch if capacity and tests permit:** begin Work Package 3's controlled
option-generation baseline and memory ablation. Do not start realtime voice,
production integration or model weight training in this allocation.

**Definition of complete:** another engineer can check out the exact commit,
run one documented command to reproduce the lab outcome and inspect a
phone-readable research report, with honest measures of what improved and
what did not. This is a technical research milestone, not AGI or a sellable
TradeFlow release.
