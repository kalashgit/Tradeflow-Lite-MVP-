# Genesis v1.2.3 — Relevance matching: functional recovery, no promotion

**Tested code commit:** `f0aa8155348632c217dcabb9a5fa0b99af133eca`
**CI:** https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42903129748
**Draft PR:** https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/86

## Verified result

- Full regression suite: **170/170 tests passed**.
- Dev+validation independent ledger replays: both verified and reproduced.
- The protected holdout (`350000+`) was not evaluated. No deployment, merge, promotion, model calls or real customer evidence.
- Decision-relevant recall now demonstrably supports local corrections: in new resource-allocation shifted validation, **50 supported option occurrences**, **105 matched receipt occurrences**, and **16 of 96 proposals** with at least one supported relevant option. This is an actual retrieval recovery from v1.2's zero matches.
- The model's `evidence()` records source receipt references, consistency, time eligibility, and the bounded local delta. It cannot infer the correctness of untried alternatives.

## Matched prospective safety outcome — still not good enough

Resource allocation, shifted validation, **96 decisions**:
- v0.9 memory off: **76/96 harmful**, mean regret **3.320833**.
- additive v1: **76/96 harmful**, mean regret **3.364583**.
- v1.2.3 relevant: **76/96 harmful**, mean regret **3.691667**.

Resource allocation, nominal validation:
- v0.9 memory off: **61/96 harmful**.
- additive v1: **64/96 harmful**, regret **4.583333**.
- relevant v1.2.3: **64/96 harmful**, regret **4.533333**.

Across the three families with per-decision counterfactuals, shifted validation showed 126/288 harmful for the v1.2.3 candidate versus 127/288 for additive v1, a 0.79% relative reduction with an episode-cluster confidence interval spanning zero. This is neither a credible positive effect nor sufficient for promotion.

## Additional defect discovered from family-level outcomes

The v1.2.3 general `EffectModel` fallback is currently stored using a **tenant+domain+scope** key. The historic v1 memory model is **tenant+domain**. Therefore when a case changes scope, v1.2.3 loses domain-level learning and can behave like memory-off rather than preserving the v1 fallback. This affected electrical procurement and other rotating-scope simulations.

**Correction must be separately versioned.** Do not silently change the studied candidate, reuse these revealed validation seeds as fresh, or promote this result. Next version should retain general v1 memory across scopes within one tenant+domain while applying contextual transfer only under explicit adapter-defined public relevance schemas. Compare it on entirely fresh dev and validation cohorts and preserve the old v1.2.3 negative checkpoint.

## Acceptance boundary

Memory being available, matching relevant conditions and producing corrections is **necessary but not sufficient**. Decision quality requires independently judged realized utility, harm, worst tails, regret, calibration and negative-transfer protection. Even a genuine relevant memory can justify the wrong action under hidden fragility, rare failure shocks or the opportunity cost of preventive spending.
