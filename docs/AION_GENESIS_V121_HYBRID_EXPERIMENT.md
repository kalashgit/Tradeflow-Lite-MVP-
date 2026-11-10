# AION Genesis — v1.2 contextual and v1.2.1 hybrid memory research report

**Status: NOT PROMOTED.** Synthetic, zero-model-call experiments; no business
records, live actions, hidden holdout evaluation, deployment, or proof of
longitudinal autonomous learning.

## Fixed code and independent replay

- Branch: `research/aion-genesis-v12-context-memory`, draft PR #84.
- Pre-report source commit: `c3bd5fa085f4c8cae3e24b242500b2b92df65bef`.
- [Full regression, v1.2 and v1.2.1 comparisons, deterministic independent replay](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42893973820): **PASS, 155 Python tests**, both synthetic experiment ledgers validated and replayed.
- [Legacy v1.1 safety replay](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42893973722): **PASS**.
- [Dedicated v1.2 branch check](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42893973753): **PASS**.
- The previous zero-job workflow failures came from referencing `runner.temp`
  in job-level `env`, where that context is not available. Both workflows
  now use valid static temporary output paths.

All observed performance numbers below are synthetic and describe *different*
prospective seed sets. Do not compare raw counts from different cohorts as if
they were matched.

## Frozen failed candidate: v1.2 contextual only

Config: `aion_genesis/lab/configs/genesis_v12_contextual_eval.json`.
Development seeds 210000+, validation seeds 220000+.

Against the existing additive v1 memory in **shifted** worlds:

| Partition | v1.2 contextual | v1 additive | Relative reduction |
|---|---:|---:|---:|
| Development | 88/180 harmful (48.89%) | 72/180 (40.00%) | -22.22% |
| Validation | 151/360 harmful (41.94%) | 133/360 (36.94%) | -13.53% |

Validation by family, contextual versus v1:
electrical procurement 22/120 vs 20/120;
hidden causal rules 42/120 vs 29/120;
resource allocation 87/120 vs 84/120.

The contextual candidate made the same choices as the memory-off
strategist on essentially all matched episodes. It did not meaningfully
recover the general memory effect. **This candidate failed and must not
be retuned using its revealed validation seeds as fresh data.**

## Separate hypothesis: v1.2.1 hierarchical hybrid

Config: `aion_genesis/lab/configs/genesis_v121_hybrid_eval.json`.
Fresh development seeds 240000+, validation seeds 250000+.
Reserved holdout seeds 260000+ were **NOT EVALUATED**.

New candidate policy `aion_v12_hybrid` retains the legacy v1 additive
verified-outcome correction by default and allows a maximum 15% contextual
blend only after at least two sufficiently similar, unexpired, complete-action
receipts. All action proposals still require human review. A separate
tenant/domain/scope model key prevents overwriting legacy memory.

Against v1 additive in **shifted** worlds:

| Partition | v1.2.1 hybrid | v1 additive | Relative reduction |
|---|---:|---:|---:|
| Development | 69/180 harmful (38.33%) | 69/180 (38.33%) | 0% |
| Validation | 142/360 harmful (39.44%) | 142/360 (39.44%) | 0% |

Validation by family, hybrid versus v1:
electrical procurement 23/120 vs 23/120;
hidden causal rules 28/120 vs 28/120;
resource allocation 91/120 vs 91/120.

Operational dependencies was scored at the episode level only because no
valid per-decision hindsight counterfactual is defined. Do not report
invented per-step harm values.

**Interpretation:** hierarchical fallback prevented the first candidate's
observable pooled degradation on this fresh cohort, but it failed to provide
measurable improvement over v1. The validation resource-allocation harm
rate remains 75.83% (91/120), above the existing prospective 70% family
ceiling. Neither candidate is eligible for promotion.

## Research next steps

1. Instrument **public-side** memory coverage, match support and actual
   correction contribution, without exposing hidden world truth or modifying
   independent evaluator criteria. Record when candidate and baseline choices
   diverge, and whether a context-specific receipt changed the ranking.
2. Diagnose the resource-allocation family using current public observations,
   verified receipts, paired regret and episode-level results. Separate missing
   information, modeling error and strategic selection error.
3. Evaluate a **bounded uncertainty-aware abstention or alternative-selection
   hypothesis** against a conservative no-action and v1 fallback, using *new*
   predeclared development/validation seeds. Do not weaken hard safety gates.
4. Freeze a candidate only after negative-transfer and distribution-shift
   tests. Reserve independent, access-controlled holdout evaluation for a later
   approved research gate.
5. Maintain distinct scientific and product acceptance: contractor-owner
   operational value is still not measured.

The engineering objective is **better decisions supported by evidence**, not
more memory records or a passing unit-test count.
