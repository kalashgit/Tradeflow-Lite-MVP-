# AION Genesis — Evaluation Laboratory v1 and Three Architectural Bets

**Founder objective:** spend coding-agent usage on transformative Genesis architecture,
not repetitive setup, test writing, benchmark bookkeeping or chasing isolated
numeric improvements. The laboratory is independent infrastructure.

**Status:** infrastructure foundation only. This document does NOT claim any
new candidate improved decision quality or that any proposed world exists today.

## Existing capabilities, confirmed in the repository

The existing `research/aion-v06/aion_genesis/lab` already supports:
- Four deterministic synthetic families: electrical procurement, hidden causal
  rules, resource allocation, and operational dependencies.
- Nominal versus shifted variants, fixed baselines, candidate memory on/off,
  scheduled matched seeds, append-only hash-chained traces and source hashes.
- Independent scorecard, bootstrap intervals, human promotion checks, full
  ledger replay, and CI.
- v1.2.4 unpromoted result: **117/288** shifted harmful choices, identical to
  v1 on the same cohort; resource allocation **72/96** harmful in both.
- Separate memory evidence diagnostics. Recall and prediction adjustments are
  **not themselves** proof of more valuable decisions.

### What is not tested

This is **not** currently a general agent-ability benchmark. Existing synthetic
worlds do not validate live tool use, role permissions, hostile or corrupted
inputs, action rollback, recovery after partial failure, month-scale memory
decay, voice, cross-application task completion, human trust, or customer
operational savings. A low harmful-choice rate against a no-action control
can also be gamed by doing nothing.

## Evaluation laboratory architecture

```text
          Scenario Registry + Provenance
                     |
           Scenario / Mutation Factory
          (frozen seeds, approved variants)
                     |
             Policy / Agent Adapter
   (baseline, v1, Claude branch, memory-off,
        simple heuristic, no action)
                     |
       Permissioned Synthetic Environment
       + fully logged tool/observation traces
                     |
            Independent Grader
    (outcomes, safety, costs, regret, truth)
                     |
           Immutable Run Ledger
         (SHA, configs, seeds, trace hash,
          judge version, agent version)
                     |
       Independent Reproduction Service
                     |
        Evaluation Review / Failure Mining
          + Coverage / Confidence / Costs
                     |
       PASS / FAIL / INCONCLUSIVE / BLOCKED
                + human review
```

**Hard boundary:** simulations and scoring rules are defined outside
candidate policy code. No Claude Code overhaul may change the judge,
baseline results, scenario truth, frozen seeds, or promotion criteria to
improve its score. Judge changes require a **new protocol version**,
an independent migration review and fresh unseen validation.

### Workstream A — Existing lab hardening (our responsibility)

**New in this branch:** `lab/review_fabric.py` reads only previously
independently reproduced dev+validation results and hash-chained traces.
It builds a per-family, per-variant matched multi-metric comparison, returns
explicit not-measured states, separately tracks action changes, abstentions
and safety, and rejects a holdout-containing run.

The new review file is a **diagnostic overlay**, not a replacement for
`scorecard.py`, `promotion.py`, `referee.py`, or `validate.py`.
The review should never assert that an invalid/partial run is a success.

Next framework tasks, ordered:

1. **Scenario manifest v2**: typed cases with capabilities, difficulty,
   preconditions, perturbations, public/hidden evidence, provenance and rights,
   failure class and scoring specification. No automatic generation into a
   protected validation set.
2. **Metamorphic and fault-injection suite**: controlled permutations of
   irrelevant feature names, changed objectives, conflicting receipts,
   missing facts, stale evidence, tenant swaps, tool timeouts, and rollback
   demands. Properties must be specified before running candidates.
3. **Tool-workflow sandbox**: no real customer applications; mock connectors
   with ACLs, irreversibility levels, idempotency, retry rules, external-state
   verification and an attention budget for human approval.
4. **Longitudinal case simulator**: recurring goals, multiple departments,
   side effects, cash/time constraints, state drift and delayed outcomes.
   Train/evaluate by company and time, not randomly split repeated records.
5. **Evidence calibration**: human-adjudicated samples, independent judge
   agreement, seeded canary cases, and counterfactual-oracle limits.
   Grade abstention, harmful action and missed-opportunity cost together.
6. **Governed holdout**: externally protected, access-controlled seeds and
   results; single approved release-time evaluation, cross-branch usage
   registry, and independent evaluator, rather than today's local-only
   holdout-reuse guard.

Do not claim these six items are implemented simply because they are listed.

### Measurement hierarchy

| Tier | Purpose | Metrics | Cadence |
|---|---|---|---|
| 0 Contract | Catch broken builds | imports, schemas, determinism, allowed actions, permission isolation | every commit |
| 1 Mechanics | Verify a component works | relevant recall support, memory influence, tool success, rollback, context boundaries | every candidate |
| 2 Decision | Test choices in matched worlds | harm *and* utility, episode regret, prediction error, tail loss, coverage and no-op rate | every PR |
| 3 Robustness | Test distribution shift | unseen worlds, negative transfer, adversarial traces, corrupt/stale evidence, recovery | milestone |
| 4 Transfer | Test unseen customers and time | new-company and chronological separation, abstention calibration, domain transfer | pre-release |
| 5 Product | Verify business value | task completion, minutes actually saved, intervention acceptance, dollars at risk, customer trust | real pilot |

**Research gate:** no safety failures; no material negative-tail regression;
measurable benefit beyond simpler alternatives; non-zero usefulness/action
rate so that "always abstain" cannot game the harm metric; replay and frozen
holdout required before any promotion. Preserve already-set thresholds until
a separately versioned research protocol is approved.

**Budget reporting:** CPU seconds, model tokens, tool calls, external-action
requests, human review minutes and dollars should be distinct. Mark unknown
costs **not measured**, never zero.

### Experiment registration contract

Each experiment must declare, before evaluation:
- Hypothesis, mechanism, owner, expected failure classes and control policy.
- Exact candidate SHA, environment hash, source of task data, model identity,
  tool versions and request parameters.
- Family/variant coverage, split seed ranges and policies (including memory-off
  and the simplest viable baseline).
- Expected primary outcome and *secondary anti-gaming* metrics, per-family
  nonregression gates, hard safety gates, worst-tail gate and allowed abstention.
- Max CPU seconds, model calls/tokens, retries and human review budget.
- One development cycle, then freeze candidate, run validation independently.
  Any tuning after validation creates **a new registered candidate and new
  independent cohorts**, not a rebranded old run.

Default verdicts: `BLOCKED` (invalid/contaminated),
`FAIL` (regressed/gate violated), `INCONCLUSIVE` (insufficient
evidence), `PASS_FOR_HUMAN_REVIEW` (all prespecified gates passed). Never
auto-merge or auto-deploy.

## Three potentially transformative Genesis architecture bets

These are **competing research work packages**, not a simultaneous rewrite.
Use feature flags, separate branches, stable policy adapters and compare each
against frozen v1, memory-off and the best simple heuristic.

### Bet 1 — Causal World Model + Long-Horizon Strategic Planner

**Why:** Genesis currently makes bounded choices from declared effects. A truly
different intelligence would model consequences across departments and time,
including delayed schedule, cash, crew and supplier effects.

**Claude Code mission:** build a replaceable typed world-model API and
candidate planner with uncertainty ranges, intervention simulation,
multi-step action branching and explicit "what could go wrong" scenarios.
Use structured rules and belief updates before expensive foundation-model
reasoning. An action is chosen only if expected benefit and risk-adjusted
tails pass a goal-and-constraint check. Keep the planner review-only.

**Tests:** delayed consequences, nonlocal dependencies, multi-step reversals,
confounding, owner-goal changes, unseen world dynamics, alternative
selection against no-op and simple heuristics, worst-case budget and risk.

**Kill condition:** no reliable reduction in regret and negative-tail outcomes
on unseen long-horizon worlds, or any hard-safety violation.

### Bet 2 — Outcome-Grounded Learning + Transferable Strategic Memory

**Why:** a memory record can be correct yet yield an incorrect action; v1.2.3
restored relevant retrieval, and v1.2.4 restored cross-scope fallback, but
neither raised decision quality over v1 on the fresh measured cohorts.

**Claude Code mission:** make memory hypotheses falsifiable, transfer gated
by context/role/tenant, recalibrate against contradictions, measure whether a
memory changes actual ranking, and estimate uncertainty. Explicitly
distinguish observation, intervention, causal belief and owner preference.
No false claims about untried counterfactuals. Improve outcomes, not memory
count. Introduce independently testable and replaceable learning interfaces.

**Tests:** selective relevance, stale data, drift, conflicting receipts,
cold start, long term retention, transfer between *authorized* scopes,
incorrect past advice, abstention, and protection from negative transfer.

**Kill condition:** matches or memory usage increase without improvement
in paired decision quality, or worsened tails on unseen contexts.

### Bet 3 — Verified Business Workflow Engine + Adaptive Agent Control

**Why:** an assistant that recommends changes is not the same as an agent
that reliably finishes a real workflow, verifies the result, and respects
the user's authority.

**Claude Code mission:** build the domain-neutral plan->simulate->approve->
execute->verify->recover lifecycle, with idempotent actions, permission
checks, transactional / compensating actions, audit receipts, bounded retries,
and a verified final-state checker. Initially run against *simulated*
TradeFlow applications and replayable mock tools only. No autonomous
production operations.

**Tests:** multi-tool tasks, failures after partial progress, duplicate
commands, unauthorized operations, delayed updates, ambiguous approvals,
interruptions and task resumption. Require verified external state and
minimal unnecessary human interruptions.

**Kill condition:** cannot complete end-to-end sandbox tasks with acceptable
correctness, safety, recovery and operating cost.

## Claude Code usage discipline

Claude should **not** spend its expensive run constructing eval scaffolding
or rewriting reports. Give it the lab's locked interfaces and one Bet at a
time. One PR per bet. Request architecture + interface and counterfactual
failure analysis first, then implementation. Budget only a short smoke
evaluation during coding. Full matched evaluation, replay, failure
triage and reporting should run on GitHub Actions without Claude.

Assign Claude **one architect/implementer**, not many redundant agents.
Use a separate independent reviewer for safety and meaningful results.
Don't have the same agent change the grader and the candidate. Freeze the
old research histories.

The recommended first bet is **Bet 1**, the causal world model and
long-horizon planning. It potentially improves decision quality directly,
whereas repeatedly refining retrieval alone has not.

## Copy-paste Claude Code mission (single high-value task)

> Work in `kalashgit/Tradeflow-Lite-MVP-`. Start by reading
> `docs/AION_GENESIS_EVALUATION_LAB_AND_MOONSHOTS.md`,
> `research/aion-v06/aion_genesis/runtime/`, and
> `research/aion-v06/aion_genesis/lab/`.
>
> **Mission:** architect and implement Bet 1: Causal World Model +
> Long-Horizon Strategic Planner as a separate opt-in candidate. Replace
> myopic point-estimate choices with explicit scenario states, delayed
> consequences, uncertainty-aware action ranking and strict owner-goal
> constraints. The system must work through the existing policy adapter,
> never call a production business command and never change the frozen
> grader, world truth, baseline or historical seeds.
>
> Deliver: (1) short architecture rationale and anti-goals; (2) typed
> interfaces and replacement boundaries; (3) implementation with tests;
> (4) cross-domain scenario cases and explicit failure hypotheses in a
> *new*, independently versioned evaluation protocol; (5) benchmarks vs
> v1 memory, memory-off, no-action and simple rules; (6) exact commit,
> tests, CI and unresolved safety/regret regressions. Treat increased
> model or tool usage as a cost, not a capability victory.
>
> Do not spend usage on cosmetics, unrelated features, documentation
> sprawl or small optimizations unrelated to decision quality. Stop if a
> benchmark would require changing its scoring rules to look better.
> Open a **draft PR only**. No merge, production deployment or protected
> holdout evaluation. Independent lab review decides whether progress
> is real.

## Adoption of external eval tooling

The evaluation lab does **not** depend on a paid platform. UK AI Safety
Institute's open-source **Inspect** is a potential future adapter for
tool-using, coding and multi-agent evaluations. Treat third-party
components as optional runners; source-of-truth scenario versions and
independent scores remain in this repo. Evaluate costs, licensing and
security separately before integration.

## Benchmark integrity and practical limitations

The current GitHub lab and validation jobs are not physically isolated
from an adversarial candidate; independent scorer modules in the same Python
process are an engineering convention, not a security boundary. A truly
high-assurance protected holdout needs separate secrets, infrastructure
and restricted access. Human calibration is required before claims about
contractor business performance.

**Success = independently reproduced, useful, safer and more valuable
decisions under new conditions—not a green CI badge or more elaborate AI.**
