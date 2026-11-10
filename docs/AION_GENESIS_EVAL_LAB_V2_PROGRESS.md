# AION Genesis Evaluation Laboratory v2 — Mock Workflows, Recovery, and Human Review

**Status:** First research vertical slice. This is a *new experimental lab track*,
not a change to Genesis v1's fixed referee and promotion gates.

## What is implemented

- New independent package:
  `research/aion-v06/aion_genesis/eval_v2/`.
- Versioned, authored, **entirely fictional** contractor workflow cases with
  separate dev and public-validation fixtures. They are not secured secrets.
- Multiweek mock operational timelines (5–8 fictional weeks, with tick = simulated
  workflow turn), procurement, scheduled crew assignments, explicit approval
  limits, cash budgets, delayed materials and mid-job scope changes.
- Deterministic injections: unknown-before-commit, unknown-after-commit,
  permission denial and stale supplier reads. The mock tool runtime supports
  stable idempotency keys, operation verification, and no double invoice payouts.
- Three matched reference policies: `no_action`, `safe_rule` (verifies
  uncertain commits before retrying), and `eager_rule` (negative control).
  No actual LLM agent is plugged in yet.
- Independent simulator scorecard: verified completion, deadline, net cash,
  *explicitly labeled* missed-opportunity proxy, authorization/invalid-call
  attempts, tool faults and prevented duplicate writes. No claims that the
  fictional opportunity proxy is a true counterfactual oracle.
- Hash-chained mock tool and episode traces. A separate replay command checks
  trace chain, artifact hashes, original manifest and reproducible scores.
  Attempts to overwrite a nonempty run folder fail.
- Blinded human review packets containing **public observations, proposed
  mock calls and mock tool responses**, not the internal scorer, policy identity
  or future scenario truth. Human reviewers must independently submit 1–5
  rubric labels for evidence adequacy, risk handling and next action quality.
  The calibration job computes agreement and flags adjudication; **no human
  labels were supplied** during automation.
- A fail-closed external-holdout *request* contract. This does not pretend
  that a protected holdout is secured or executable in this GitHub repository.

## Simple commands

```bash
cd research/aion-v06
python -m unittest discover -s tests -q

python -m aion_genesis.eval_v2 run \
  --suite dev --out /tmp/genesis-workflow-dev

python -m aion_genesis.eval_v2 verify \
  --out /tmp/genesis-workflow-dev

python -m aion_genesis.eval_v2 packet \
  --run-dir /tmp/genesis-workflow-dev \
  --out /tmp/genesis-review-packet.json \
  --reviewer-id "reviewer_1"

# After at least two real, independent reviewers fill out their labels:
python -m aion_genesis.eval_v2 calibrate \
  --packet /tmp/genesis-review-packet.json \
  --labels /path/reviewer_1.json /path/reviewer_2.json \
  --out /tmp/genesis-calibration.json
```

**CI only runs development fixtures**, not the public validation set or a
protected holdout. A standalone developer can run public validation but that
is not an independent sealed evaluation. GitHub Actions archives development
evidence; it does not produce human ratings.

## Major weaknesses that remain

The simulator is deliberately an inexpensive vertical slice. Do not call it
a complete realistic contractor model:

- Authored examples are few; scenario IDs and fixtures are in source and are
  visible to any candidate with repository access. There is no enforced
  process sandbox preventing code inspection, and no securely hidden oracle.
- No actual production integrations, financial records, owner instructions,
  human verification, or model-inference evaluation.
- Failure injections are fixed at known ticks, not a randomized fault search.
  A comprehensive mutation factory with deterministic seed families is next.
- The planner interface receives public view and prior tool response, but no
  standardized high-level task plan, memory history or model-token budget.
- The financial opportunity estimate is a fictional proxy, not true hindsight
  value; don't optimize it without business validation.
- This cannot measure real cost savings or demonstrate deployment readiness.
- Two synthetic reviewers in a **unit test** would be fixtures, not evidence
  of real independent human ratings.

## Building the reliable lab from here

**Track L1 — Better, broader simulations.** Add deterministic scenario
mutations around all failure stages; larger, evolving job portfolios;
parallel supplier and crew constraints; delayed invoicing; changing owner
goals and approval expiry. Store each fixture/provenance digest.

**Track L2 — Agent/tool evaluation adapters.** Run candidate agents in a
restricted separate process with public-only tool interfaces and hard CPU,
token and retry budgets. Add recovery, interruption, stale/contradictory
observations, cross-tenant exposure attempts and idempotent verification.

**Track L3 — Human-judgment calibration.** Invite at least two independent
domain reviewers to assess the same blinded public traces. Record agreement,
disagreement escalation and judge calibration without retroactively
changing benchmark labels. This is *not* complete until actual humans rate.

**Track L4 — Protected holdout custody.** Move unreleased cases, seeds and
scorer to an independent private evaluator controlled by reviewers.
No pull-request code author should be able to read the sealed cases,
secrets or raw holdout scores. Require pinned code SHA, protocol hash,
approval of one submission, audit of every access, and release only aggregate
metrics. This document is a design—not proof an independent custodian exists.

**Track L5 — Promotion protocol.** Combine safety, task completion, net value,
worst-case downside, abstention and opportunity loss, tool failure recovery,
compute and human-attention cost. Green tests indicate **engineering
correctness** only. A single metric or endlessly idle policy is insufficient.

## Three architecture overhauls Claude Code should evaluate

| High-leverage bet | New capability | New required lab scenarios | Kill condition |
|---|---|---|---|
| **1. Causal world model + strategic planner** | Belief over state, delayed effects, scenario branching, uncertainty-aware decision selection | Job chain dependencies, conflicting schedule/cash/crew needs, counterfactual forecasts, changing owner goals | More complexity with no improvement in matched regret, completion and downside |
| **2. Outcome-grounded memory + policy learning** | Memories as tested hypotheses, context transfer with contradiction and staleness limits | New job, repeated contractor, false/corrupt history, changing project types, negative transfer | More retrieval but equal/worse actual outcomes |
| **3. Verified autonomous workflow system** | Plan -> approval -> execution -> verification -> recovery with idempotent tools | Partial writes, timeout-after-commit, permission changes, human interrupts, state discrepancies | Fails to complete verifiable sandbox outcomes safely and economically |

**Suggested Claude split:** Give Claude one major architecture implementation
at a time. Let deterministic GitHub Actions run unit tests, v1 paired
experiments and v2 tool-workflow lab. Do not let Claude modify hidden
environment rules, outcomes, score weights or protected holdout cases to
raise its own score. An independent reviewer must approve any judge change
under a newly versioned evaluation protocol.

**First Claude packet:** Build Bet 1 as a replaceable `StateEstimator`,
`TransitionModel`, `RolloutPlanner`, `RiskGovernor` and
`PolicyAdapter` interface, preserving review-only decision contracts and
v1 fallbacks. Require two demonstrations on fictional multi-step contractor
cases: (a) it correctly identifies a future cash/schedule conflict that a
myopic policy misses; (b) it abstains or selects a safe alternative when
confidence is insufficient. Validate on new independent scenarios, not
handpicked successes.

See `docs/AION_GENESIS_EVALUATION_LAB_AND_MOONSHOTS.md` for full missions.

**Truth hierarchy:** coded -> unit-tested -> synthetic benchmarked ->
independently replayed -> human-reviewed -> contractor-piloted -> safely
deployed. Never silently promote an item between these categories.
