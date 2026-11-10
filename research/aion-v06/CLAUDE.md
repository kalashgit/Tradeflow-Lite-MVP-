# AION Genesis — scoped Claude instructions

Read `README.md`, `ARCHITECTURE.md`, `docs/RESEARCH_GATES.md` and the root
`CLAUDE.md`/`AGENTS.md` before selecting an experiment.
The prospective v1.1 safety gate, unexamined holdout policy and dev/validation
CI contract are documented at repository-root
`docs/AION_GENESIS_V11_SAFETY_HANDOFF.md`.
For the current v1.0 implementation milestone, also read the repository-root
`docs/AION_V1_CLAUDE_EXECUTION_MANDATE.md`: build the reusable runtime and
independent experimental control plane before option-discovery upgrades.

## Current Genesis architecture sprint — use Claude for major bets only

Before touching architecture, read repository-root
`docs/AION_GENESIS_EVALUATION_LAB_AND_MOONSHOTS.md` and the latest validated
`lab-review.md`. The new `aion_genesis.lab.review_fabric` is the shared
diagnostic reviewer, not an alternate grader.

**Current priority:** Bet 1 (causal world model and long-horizon planner),
followed by outcome-grounded learning/transfer and verified permissioned
workflow completion. Work on **one opt-in candidate** on an isolated branch
and one draft PR at a time. Do not spend high-cost model usage rewriting
evaluation harnesses, adding cosmetic features, duplicating report tooling,
or repeatedly modifying the same candidate after seeing validation results.

The expensive agent's responsibility is the **major architectural invention**
and integration to a stable policy adapter. The independent GitHub laboratory
owns routine regression, seeded comparisons, replay and research reporting.
Do not change `lab/referee.py`, `lab/scorecard.py`,
`lab/promotion.py`, `lab/hidden/`, or scoring thresholds to make an
architectural candidate look better. Treat green tests and active memories
as engineering facts, **not** business-quality gains. Historical negative
experiments and the protected holdout remain frozen. No real-world
business actions or merges/deployments are authorized.

## What is presently proven

The Python standard-library harness, synthetic causal worlds, memory ablations,
v0.8 situation evidence store and v0.9 bounded decision planner have offline
tests. **Real LLM learning, open-world option discovery and real business
decision improvement have NOT been demonstrated.** The most recent published
v0.9 baseline was 74 local tests, but recheck the active commit and suite.

## Design constraints

- Keep `aion_genesis/` reusable. Electrical-contractor logic belongs in
  `aion_genesis/domains/`; TradeFlow adapters may depend on core, not vice versa.
- Preserve a separately held-out, seeded evaluator. The planner, model,
  domain pack and its prompts must not inspect hidden transition rules,
  oracle outcomes, test labels or withheld scenarios.
- Do not represent retrieval or a stored preference as learned causal insight.
  Demonstrate improvement using matched no-memory, no-model and fixed-rule
  baselines, plus unfamiliar held-out conditions.
- Capture evidence IDs, revisions, scopes, uncertainty, owner priorities,
  candidate set, costs, latency, abstentions and errors for each recommendation.
- No real tenant records, live credentials, external writes or unreviewed
  consequential actions. Synthetic cost estimates are fictional.
- Do not silently retune on a holdout after reading it. Predeclare the new
  candidate strategy and compare it against the frozen baseline with a fresh
  independent test set.

## Verify

`python -m unittest discover -s tests -q`

For v0.9 synthetic strategy checks:

`python -m aion_genesis.strategic_cli plan --output /tmp/aion-plan.json`

`python -m aion_genesis.strategic_cli benchmark --worlds 200 --seed 8000 --regime unexpected_failure --output /tmp/aion-shift.json`

Report findings honestly even when a candidate is slower or worse. A failed
transfer gate is useful scientific evidence, not a reason to conceal the run.
