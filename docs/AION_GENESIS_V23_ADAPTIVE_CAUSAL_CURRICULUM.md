# AION Genesis v2.3 — Adaptive Causal Business Laboratory

**Status:** research-only synthetic causal economics + bounded adaptive
curriculum. This is not a deployed AI, not a general machine-learning model,
not an external LLM judge, and not evidence of real contractor outcomes.

## Founder direction

The lab should do more than create random business stories:

1. Generate many distinct, internally consistent business worlds.
2. Give Genesis only what its authorized actor could have observed.
3. Let the simulated business react to its chosen actions over time.
4. Measure actual synthetic consequences independently.
5. Detect what worked, what failed and which causal factor may matter.
6. Choose harder, corrective and out-of-distribution scenarios.
7. Record candidate improvements, compare them with **strong controls**,
   and retry safely. Changes to the real policy/code require independent
   verification; never let the candidate rewrite its own test.

The engineering pattern:

```text
Versioned business parameter vector + dev seed
                  |
     Deterministic causal world factory
                  |
    Truth + delayed role-scoped receipts
                  |
   [Genesis policy adapter / fixed controls]
                  |
 Mock typed actions -> economic state changes
                  |
      Frozen independent numeric referee
                  |
    Evidence ledger + paired intervention
        /                      \
  Non-authoritative       Bounded dev-only
  qualitative LLM          curriculum learner
  critic / hypothesis       (harder / remediate /
  reviewer                  novelty / family balance)
        \                      /
         Candidate change proposal
                   |
      Separate pinned replay and tests
                   |
     External holdout + human approval
                   |
     Optional reviewed release (not built)
```

## What is now implemented

- `aion_genesis/eval_v2/causal_world.py`: A fictional project company
  with shared cash and projects, supplier deliveries, blocked crew
  assignments, owner change approval, verified invoices, customer
  disputes and actual delayed cash receipts. A supplier announcement
  is different from material actually arriving; an invoice request
  is different from verified billing; a payment event changes the
  cash balance only once. No real network or business tool is called.
- Typed `Case`/ `Job`/ `Shock` parameter vectors. Six scenario
  families: supplier shocks, field blockers, change approval, invoice
  disputes, working capital and compound disruptions. Difficulty
  1–5 and novelty 0–5 vary the values. Every case has explicit
  synthetic IDs, seed, family, horizon, costs and allowed operations.
- `public_view(role, tenant)` never exposes future shocks, source
  truth or cross-tenant private state. Non-PM roles get only routed
  messages; PM receives the authorized operational budget and its
  own tool receipts. This is a protocol contract, not a secure
  separate-process sandbox. It must be hardened before untrusted models.
- `aion_genesis/eval_v2/adaptive.py`:
  * Fixed, auditable reference strategies (`deadline_first`,
    `cash_first`, `risk_averse`, `no_action`).
  * Separate deterministic scorer for verified paid work, liquidity,
    fictional opportunity proxy and denied operations.
  * Dev-only `Curriculum`: if the selected rule does well against a
    fixed reference without safety violations, raise the challenge;
    on failures choose a corrective case; every fourth lesson
    forces coverage/exploration. Levels and novelty are bounded.
  * `OutcomeBandit`: a very small online learning mechanism that
    chooses among **pre-existing** policies using only observed,
    matched synthetic **development** returns. It learns a strategy
    preference, not new reasoning or model weights.
  * `contrast(...)`: compare the same policy and seed with and
    without one injected business shock. The result is *within-model
    intervention evidence*, not proof that the mechanism transfers to
    real companies.
  * `critic_packet(...)`: readable public-action traces plus
    independent scored outcomes for an optional **non-binding**
    LLM-as-judge. It can propose probable causes, counterexamples or
    candidate repairs; it cannot modify scores, hidden truth,
    test access, permissions or release status.
- `adaptive_runner.py`: seeded dev lessons → policy selector
  learning → frozen family-to-policy mapping → separate public
  validation cases with the original controls → hash-chained event
  ledger → deterministic replay and archived artifacts.
  Its default: 24 development lessons + 18 public-validation
  cases. **Validation is never used for learning**; protected
  holdout execution remains unavailable.

## Example: why connecting information to economic truth matters

A supplier may *message* the PM that the delivery is delayed. This
does not spend money a second time or mean materials arrived.
An actual material receipt changes readiness. A foreman then reports
a blocker; continuing to dispatch before it is resolved cannot
produce completed work. A scope change requires owner approval;
work requirements increase only upon the accepted change. Finance
verifies an invoice after actual work is done; cash arrives after a
separate payment delay. A customer dispute can interrupt collection
until a finance handoff resolves it.

The agent must decide from the messages delivered up to the current
turn. The independent referee sees the complete synthetic business
state after the episode. It measures outcomes rather than declaring
a tool response 'success' merely because a command was accepted.

## Quantities to track (keep all, not just a victory score)

**Economic:** realized cash change, paid vs unpaid verified invoices,
spending, liquidity, hypothetical missed opportunities.

**Operational:** committed orders, delivered materials, blocked
work, approved scope, crew shifts, downstream dependencies,
verification and cash collection.

**Epistemic:** observed and stale revisions, missing handoffs, actor
visibility, uncertainty, contradictions and unauthorized disclosure.

**Risk and trust:** denied writes, wrong-tenant data access, role
revocation, idempotency, recoverable vs irreversible outcomes.

**Generalization:** dev vs unseen, new combinations, seed families,
remedial vs escalating, negative transfer, worst-decile losses and
abstention frequency.

**Compute:** scenario generation throughput, inference cost, retries,
review time, and context budgets.

The v2.3 benchmark has only a *subset* of these. In particular it does
not yet test a real Genesis model or statistically robust holdout
generalization. Do not aggregate different units into an unjustified
single "intelligence" number.

## How a self-improvement cycle should operate

1. Freeze the scorer, baseline policies and synthetic world version.
2. Produce one seed-manifested development cohort and collect
   independent outcome receipts.
3. When a strategy succeeds, introduce an orthogonal complication
   and increase a bounded difficulty factor.
4. When it fails, preserve the original failure, identify a
   falsifiable hypothesis and generate paired controlled
   interventions changing one factor at a time.
5. Require the modified strategy to reproduce improvement on
   the original failure *and* avoid regressions on unrelated tasks.
6. Test a frozen candidate on public validation exactly once.
   Use truly independent custody for any sealed holdout.
7. Use external human/expert evaluation for evidence validity,
   regulatory risk and qualitative action appropriateness.
8. Only after independent safety, value and generalization proof,
   submit a reviewed code/model change. **Do not grant the
   learning loop write access to the deployed TradeFlow business.**

A model can suggest code edits, but only a separate engineer or
authorized controlled tool should stage them as a draft PR. It must
not choose the grader, remove failed examples or mutate validation
until a "pass" appears.

## Next major development work

1. **Unify the factory layers:** connect the v2.2 ten-stakeholder
   event network with this v2.3 causal state transition engine.
   Today they are independently testable slices. Source events
   should derive from committed world transitions; *no scripted
   'paid' event without underlying invoice and cash settlement*.
2. **Real Genesis policy interface:** run an actual frozen model
   as a sandboxed policy with strict read/write role capabilities,
   bounded token budgets, deterministic tool schemas and safe
   retries. Compare against the best observed fixed rule on
   matched development cases before validation.
3. **Causal hypothesis memory:** record context, intervention,
   prior belief, controlled comparison, outcome, uncertainty,
   counterevidence and expiry. Prefer the proven improvement
   over remembering a convincing explanation.
4. **Curriculum diversity:** independent domain archetypes,
   cross-tenant and multi-company complexity, owner goals,
   commercial subcontractors, bidding, scheduling, cash,
   permits, inspections and field-to-office surprises. Develop
   coverage metrics that reject near-duplicates.
5. **External custodial benchmark and calibration:** hidden
   seeded worlds outside candidate-visible repositories,
   expert scenario review, blind human-judgment packets and
   protected one-shot policy submission.

## Commands

```bash
cd research/aion-v06
python -m unittest discover -s tests -p test_eval_v23_causal_curriculum.py -q
python -m aion_genesis.eval_v2.adaptive_runner run \
  --train 24 --validation 18 --out /tmp/genesis-causal-v23
python -m aion_genesis.eval_v2.adaptive_runner verify \
  --out /tmp/genesis-causal-v23
```

**Truth labels:** implemented ≠ passing tests ≠ proven model learning ≠
human-reviewed ≠ general real-world intelligence. Only the first
two can be claimed once CI confirms the exact commit.
