# AION Genesis v1.2.2 — Memory Effect Instrumentation & Resource Allocation Diagnosis

**Status: passive diagnostic implementation, independently tested; NO candidate promotion.**

## Scope, boundary and evidence

- Parent branch: `research/aion-genesis-v12-context-memory`; isolated
  draft PR [#85](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/85).
- Exact tested source SHA:
  `9689cbc4fbfe95b90e6ecb84aa58cd11a6ef24cf`.
- [Primary GitHub Actions: 161/161 tests + both pre-existing reproducible
  research experiments + memory diagnostics](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42898469271): **PASS**.
- [Legacy v1.1 research-safety replay](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42898469136): **PASS**.
- [Dedicated v1.2 safety/replay](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42898469111): **PASS**.
- New diagnostic cohorts: **dev** seeds `270000..270007`;
  **validation** `280000..280015`. Both nominal and shifted;
  six steps each, four matched policies. The tool rejects any other cohort
  or partition (including `holdout`).
- Results are **synthetic simulation only**. No language-model calls,
  business records, actions, product adoption, real contractor validation,
  or claimed real-world improvement.
- The unchanged independent referee supplies harmful-choice, realized-value
  and regret labels *after* the policy has made its decision. The passive
  observer reads public observations, reviewable proposals and each policy's
  own tenant-scoped model only. It cannot change a chosen action.

## Diagnostic definitions

- **Memory available:** a versioned effect model was present when a
  decision proposal was created.
- **Memory applied:** at least one option's predicted objective effect
  differed between its raw and adjusted proposal values.
- **Score-leader flip:** recomputing a diagnostic Pareto-aware score leader
  from raw versus adjusted public option estimates gave different leaders.
  This is not itself evidence that the final policy changed action.
- **Actual choice divergence:** the applied action differed from a
  matched memory-off `v09_strategist` on the same seed, variant, step.
- **Memory helped/hurt a divergent action:** the independent evaluator's
  realized utility was higher/lower than for the matched memory-off choice.
- **Retrieval stages:** every proposed candidate option is checked against
  its own memory records for an exact action key, outcome recency (up to
  32 logical ticks), and sufficient similarity on the entire public numeric
  context (threshold 0.82). Counts are *option occurrences*, not unique
  interventions or causal effects.

## Key result: contextual retrieval is too restrictive in this laboratory

**Shifted resource allocation, validation: 96 decisions per policy**.

| Measurement | Memory-off v0.9 | Additive v1 | Contextual v1.2 | Hybrid v1.2.1 |
|---|---:|---:|---:|---:|
| Memory version available | 0/96 | 77/96 | 77/96 | 77/96 |
| Changed any option estimate | 0/96 | 77/96 | **0/96** | 77/96 |
| Changed chosen action vs memory-off | 0/96 | 35/96 | **0/96** | 35/96 |
| Harmful choices vs no action | 77/96 | 75/96 | 77/96 | 75/96 |

**Contextual v1.2 retrieval, shifted validation option occurrences:**

| Filtering stage | Occurrences |
|---|---:|
| Options examined | 587 |
| Exact action had any prior receipt | 152 |
| Action had a fresh-enough receipt | 127 |
| Action + fresh receipt + similar public context | **0** |

The hybrid policy also had **zero** qualifying contextual matches,
so its observed benefit came from the inherited additive v1 fallback
instead of the contextual component.

**Conclusion supported by these traces:** missing action history and
aging remove some candidates, but the decisive *additional* bottleneck
is full-context similarity. No qualifying contextual corrections
were available to change choices on this cohort. This does not prove
which new similarity representation will generalize.

## Separate resource-allocation failure

**Shifted validation** had 96 decisions per policy:

- Additive v1: **75/96 harmful (78.13%)**, despite the memory component
  changing the applied action in **35/96** cases.
- Memory-off: **77/96 harmful (80.21%)**.
- Of those **35** changed choices, v1 realized *higher* utility in **17**,
  *lower* utility in **8**, and the **same** utility in **10**.
- V1 inspection choices: **67/75 harmful (89.33%)**.
- Active maintenance (inspection or overhaul): **75/87 harmful (86.21%)**.
- Overhauls: **8/12 harmful (66.67%)**.
- Technician availability <=4 hours: **31/41 harmful (75.61%)**.
- Above 4 hours: **44/52 harmful (84.62%)**.
- Missing/stale capacity information: **3/96**; these decisions
  abstained and showed no harmful-choice flag.

**Nominal validation:** v1 incurred **68/96** harmful choices versus
**62/96** for memory-off. Among **27** different choices, eight had
higher utility, twelve lower utility, and seven tied.

**Important interpretation:** in this experimental metric, no action
has zero *harmful relative to no action* by definition. It may still
have substantial opportunity cost or regret to the oracle. These
descriptive group counts are correlated, overlapping groups and do
not establish that inspection is bad in the real world.

## Recommendation for next research cycle

**Two distinct hypotheses; do not mix them:**

1. **Retrieval design:** test a new versioned *selective-context*
   candidate using stable feature selection or explicit feature groups
   instead of the minimum similarity across every volatile metric.
   Require evidence coverage, adequate support, stale-data rejection,
   bounded influence, and explicit negative-transfer checks. Use
   *new* dev/validation seeds, not the revealed validation cohorts
   in this report. Keep v1, v1.2 and hybrid unchanged as comparators.
2. **Resource decision quality:** investigate calibrated benefit versus
   prevention cost, expensive/uncertain intervention selection and
   abstention thresholds. Compare with no-action and v1 on new matched
   scenarios; measure regret, mean utility, harm, worst decile and
   missed opportunities. Never infer that no action is universally best
   just because of the chosen harm definition.

Preserve the independent referee, fixed safety thresholds, tenant
isolation, approval-only proposal contract, and unexamined protected
holdout. No merge or deployment from this diagnostic work.

## How to reproduce

```bash
cd research/aion-v06
python -m unittest discover -s tests -q
python -m aion_genesis.lab.memory_effects --partition dev --output /tmp/genesis-memory-dev.json
python -m aion_genesis.lab.memory_effects --partition validation --output /tmp/genesis-memory-validation.json
```

The workflow publishes full per-decision synthetic JSON artifacts with
`genesis-v122-memory-effects-` prefix (14-day retention). This permanent
report retains the key figures after artifact expiration.
