# AION Genesis v1.2.4 — Domain-General Memory & Relevant Recall Results

**Status:** Experimental, not promoted, not deployed, no merge.

## Purpose

An earlier v1.2.3 experiment demonstrably restored selective context recall,
but stored the entire provisional model under a tenant/domain/**scope** key.
The frozen v1 general outcome memory was domain-wide, so procurement cases
with new batch scopes could silently lose past learning. This is a genuine
architectural regression, not simply a threshold-selection problem.

v1.2.4 preserves the already evaluated v1.2.3 policy as a distinct comparator.
Its new `aion_v124_domain_relevant` model maintains:

- **General:** one tenant-and-domain `EffectModel` to preserve cross-case
  additive memory, including for domains with no relevance schema.
- **Local:** versioned, bounded receipt-backed contexts (max 32 scopes, 128
  receipts per scope), only eligible when an adapter declares relevant public
  target/resource features. Contextual transfer does not leak between scopes.
- **Audit:** selected proposal carries per-objective evidence reasons,
  matched receipt refs, time eligibility, general prediction and bounded
  local correction. Feedback is supplied for the action *actually* taken.
- **Safety:** no tool execution, all proposals remain pending review,
  no hidden-state access, no other tenant's memories, and no automatic
  promotion.

## Exact evidence

- **Base:** `research/aion-genesis-v123-relevant-memory`.
- **Exact tested code SHA:** `cb6de65b6809541790ff89950e059da4c5a545a7`.
- **Draft PR:** https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/87
- [Main CI](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42905420270): **PASS**, **176 Python tests**, historical v1.2 and v1.2.1 synthetic results reproduced, v1.2.3 and v1.2.4 separate prospective dev/validation comparisons both reproducibly validated, passive memory diagnosis completed.
- [v1.1 safety workflow](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42905420232): **PASS**.
- [v1.2 research workflow](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42905420301): **PASS**.
- **Prospective v1.2.4 partitions:** dev seeds 390000–390007;
  validation 400000–400015; reserved/unrun holdout 410000+.
- **Evidence tier:** entirely synthetic, zero real model calls and no
  customer records, actions or verified real-world operational benefit.

## Engineering correctness: recovered fallback

Regression tests compare v1 and v1.2.4 decisions, realized effects and
prediction errors across changing procurement scopes, including both
nominal and shifted settings. These comparisons passed.

In prospective evaluation, the v1.2.4 policy matched v1's harmful counts,
utility and regret for procurement, hidden causal rules and sequential
operational dependencies (the latter has no meaningful per-decision harmful
counterfactual). This is expected where no relevant-context feature
contract is declared; the candidate falls back to the shared v1 model.

Resource allocation continues to exercise local relevant recall. On
**shifted validation** (96 decisions) the v1.2.4 passive trace recorded:
- 27 context-supported option occurrences;
- 54 matched verified receipt occurrences;
- 10/96 proposals with at least one context-supported option;
- 76/96 proposals where some estimated effect changed relative to raw
  domain predictions (the count includes *general* memory effects);
- 44/96 diagnostic raw-vs-adjusted score leader changes.

These demonstrate functional recognition and evidence application in a
prospective cohort, **not** superior chosen actions.

## Scientific outcome: no measured improvement

Validation under **shifted** conditions:

| Metric | Memory-off v0.9 | Additive v1 | v1.2.4 |
|---|---:|---:|---:|
| Three measurable families pooled harmful choices | Not reproduced here | 117/288 (40.625%) | **117/288 (40.625%)** |
| Resource allocation harmful choices | 74/96 (77.08%) | 72/96 (75.00%) | **72/96 (75.00%)** |
| Resource allocation mean regret to oracle | 21.275 | 25.750 | **25.875** |
| Resource allocation mean episode utility | -170.5375 | -175.0125 | **-175.1375** |

Validation **nominal** resource allocation: v1 and v1.2.4 both had
65/96 harmful decisions; regret **26.5** vs **26.6**, respectively.

The pooled v1.2.4-v1 shifted harm difference is **exactly zero** on
the matched synthetic validation. Resource allocation remains above
the predeclared 70% family harm ceiling. **No promotion.**

Other shifted validation by family: electrical procurement v1 and v1.2.4
both 22/96 harmful; hidden causal rules both 23/96. Under sequential
operational dependencies, measure episode utility and regret, not
fabricated per-step harm.

## Remaining problem and next research

We have now separated **correctly retrieving a receipt** from **correctly
choosing an action**. The primary remaining bottleneck is *risk-aware
decision selection and calibrated expected benefit*, particularly for
resource spending where preventive maintenance can be costly and
counterfactual failures are unseen.

A new, separately versioned experiment should test conservative
incremental-value thresholds and uncertainty-aware fallback against
v1 and no-action. Define a multi-metric objective **before** examining
new validation: harm, episode utility, regret, worst-decile outcomes,
abstention/inaction rates, and per-family nonregression. A policy that
always does nothing can appear perfect under the harmful-relative-to-
no-action metric, so that metric cannot be optimized in isolation.

Use fresh predeclared dev/validation seeds, maintain an independent
referee and protected holdout, and require human approval for all
business-facing recommendations. No system can learn the outcome of
an untried action from an observed-action receipt alone without a
separately justified model of counterfactuals.
