# AION Genesis Evaluation Lab v2.1 — Multi-Project Portfolio Benchmark

**Status:** separate public-fixture synthetic research track, not a secure holdout,
not a new Genesis decision policy, and not proof of real contractor savings.

## What the v2.1 simulator adds

The existing v2 lab tests the completion/recovery of **individual fictional
business jobs**. The new v2.1 portfolio environment tests *competing jobs*
which share constraints:

- One cash balance for all projects; up-front materials and crew spending.
- Shared crew assignments per simulated business day and limited supplier
  order slots.
- Material delivery delays and receivables paid *only after verified
  completion* and an explicit payment lag.
- Projects with separate deadlines, profit opportunities, approval caps,
  arrival dates and owner-defined priorities.
- Mid-run owner priority and scope changes.
- Injected tool errors before/after commits, an idempotency-key ledger,
  and independent post-timeout verification.
- A public-only agent observation contract. Candidate policies are never
  provided the `PortfolioCase` object, future owner changes, injected
  tool fault schedule or scored final state.

Versioned fictional dev fixtures: seeds 94100–94104, five portfolios.
Different *public* validation fixtures: 95200–95202, three portfolios.
These are authored repository fixtures and **not secure or independent
validation**, even if the candidate hasn't seen the IDs. No protected
holdout is available from this package.

The baselines are intentionally not all weak:
`deadline_first` handles urgent projects and recoverable commits;
`cash_aware` ranks estimated net value relative to spending;
`no_action` provides a control that is explicitly penalized with a
fictional missed-opportunity proxy where jobs are financially feasible.

**Candidate goal:** demonstrate portfolio-wide benefit under a
realistic-seeming resource constraint, not merely maximize per-job speed.

## Reproduction

```bash
cd research/aion-v06
python -m unittest discover -s tests -p test_eval_v21_portfolio.py -q

python -m aion_genesis.eval_v2.portfolio_runner run \
  --suite dev --out /tmp/genesis-portfolio-v21

python -m aion_genesis.eval_v2.portfolio_runner verify \
  --out /tmp/genesis-portfolio-v21
```

The default GitHub Actions **fast v2 workflow** runs public development
cases, verifies their complete deterministic replay, and stores separate
JSON, Markdown and hash-chained ledger artifacts. Full historical Genesis
v1 suites remain an independent parallel job.

## Required evaluation dimensions

| Dimension | What to measure | Why |
|---|---|---|
| Completion | jobs verified, jobs paid | A tool response is not a finished business task |
| Owner goals | priority-weighted verified work | A profitable job may be less urgent |
| Timeliness | on-time verified jobs | Delay has downstream cost |
| Liquidity | ending cash, net cash delta, blocked work | Spending one budget changes options for other jobs |
| Opportunity | explicit theoretical missed-opportunity proxy | No-action policies must not game harm-only metrics |
| Resource usage | idle crew and unused supplier slots | Overcommitment and idle capacity both matter |
| Safety | rejected approval/invalid actions | Profit never excuses unauthorized writes |
| Reliability | unknown commits, idempotency, replay | Prevents silent duplicate orders or invented results |
| Cost | CPU, model tokens and human review | Expensive planners must justify their use |

The composite number in the synthetic scorecard is
`cash_delta + 20*priority_weight - opportunity_proxy`.
It is a **descriptive convenience only**, not an independently
calibrated causal value model and not an automatic promotion gate.

**Never tune after examining public validation and then label that set
an unseen experiment.** Use development for failures and design changes.
If a policy changes after validation, pre-register a new version and
request a fresh independently custodial comparison.

## Claude Code: largest-impact Bet 1 and concrete engineering interfaces

The first major Claude assignment should be a **causal long-horizon
planner**, not a new collection of local heuristics. Use replaceable
interfaces:

```text
ObservationAdapter
       |
BeliefState / StateEstimator
       |
TransitionModel with delayed effects + uncertainty
       |
ScenarioRolloutPlanner  <---- budget/time constraints
       |
RiskGovernor (owner permissions, downside, liquidity)
       |
ReviewOnlyPolicyAdapter
       |
Independent Portfolio and Tool-Fault Labs
```

Build a candidate which handles at least these *counterexamples*:

1. Three jobs, enough cash to start one large project or two smaller
   projects; completing the small one releases delayed payment and
   unlocks larger future revenue.
2. One high-priority job suffers a scope increase mid-work, exhausting
   shared crew slots. The planner must reconsider, rather than follow a
   stale original ranking.
3. An order times out **after the external state already committed**.
   The planner must verify before retrying and never double-purchase.
4. Cash or owner permission makes the best-looking job unaffordable.
   The agent must choose a permissible alternative, wait or seek
   approval—never silently violate a hard constraint.
5. The transition model is wrong or uncertain. An overconfident
   forecast must not induce catastrophic spending or hide its
   missing assumptions.

**Architectural acceptance:** one explicit state-estimate API,
one interchangeable transition model, bounded planning with
risk-aware fallback, immutable traceable decisions, and a feature flag.
No mutation of existing v1 grader, public scenario truth, or results.
No production tool calls. Never merge or deploy without review.

**Scientific acceptance:** independently reproduced improvement in
verified completion and owner value relative to the *strongest* simple
baseline, no safety violations, no catastrophic liquidity regressions,
acceptable downside tails and operating costs, and a later independent
holdout/human review. A benchmark over only 5 dev and 3 public validation
portfolios is too small for promotion regardless of the score.

## Second and third bets

**Bet 2 — outcome-grounded strategic memory:** retain verified
intervention histories by domain and scope; reject invalid transfer;
estimate calibrated utility and uncertainty of applied corrections,
rather than maximizing receipt retrieval. Evaluate on repeated
portfolio episodes with changed owner goals, stale events, conflicting
receipts and company-level chronological splits.

**Bet 3 — verified workflow execution:** make the planner's chosen
high-level action run through a separately permissioned workflow
controller with retries, idempotency, pre/postconditions, approval
handoffs, compensation and verified final state. Evaluate ambiguous
partial commitments and multi-tool transactions with separate mock
connectors, not live customer systems.

## Remaining laboratory investments

- A larger **generative scenario factory** with orthogonal mutations
  rather than only hand-authored fixtures.
- Stronger economic / delay models and independently reviewed
  business assumptions, avoiding shortcuts in opportunity proxies.
- Real domain expert ratings on blinded cases; human review code
  exists, actual ratings do not.
- A genuinely separate, access-controlled holdout evaluator with an
  independent custodian; currently unavailable.
- Candidate sandbox/process isolation, hard token and time budgets,
  and secured tool adapter versioning.
- Separate measurement of test mechanics from model intelligence.

**Research hierarchy:** implemented -> tests pass -> synthetic replay
-> independent unseen validation -> expert calibration -> real pilots.
Only the first three are available in this branch.
