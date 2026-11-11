# Genesis GML-01 run

Synthetic simulation only. No protected external holdout. A verdict here is a research record, never a deployment or automatic promotion.

Source commit `d3f0eaa8fa1a4e9166943766345a064d4616195f` · limit `None`

## M1 experience factory

240 sealed trajectories from 240 training scenarios; 235 supervised examples, 917 preference pairs, 7231 transition examples.

## M2 learned world model — verdict FAIL

| Partition | Head | n | Learned Brier | Constant | Heuristic | Untrained |
|---|---|---:|---:|---:|---:|---:|
| public_validation | job_paid | 891 | 0.04431 | 0.09812 | 0.14598 | 0.23672 |
| public_validation | denied | 1653 | 0.0 | 0.0 | 0.0 | 0.28394 |
| public_validation | delivered_within_4 | 276 | 0.06279 | 0.06735 | 0.06735 | 0.28563 |
| protected_test | job_paid | 1814 | 0.1127 | 0.27525 | 0.20032 | 0.24278 |
| protected_test | denied | 3523 | 0.0 | 0.0 | 0.0 | 0.30162 |
| protected_test | delivered_within_4 | 567 | 0.50024 | 0.48509 | 0.48509 | 0.24267 |
| adversarial | job_paid | 1003 | 0.17017 | 0.25563 | 0.22943 | 0.24739 |
| adversarial | denied | 1808 | 0.0094 | 0.0094 | 0.0094 | 0.29808 |
| adversarial | delivered_within_4 | 308 | 0.49111 | 0.45516 | 0.45516 | 0.24778 |

## M4 curriculum — verdict INCONCLUSIVE

Adaptive vs uniform final relative Brier gain +0.81% (threshold 5%, single run, no interval).

## M3 policy training — COMPLETED

Base `gml-fixture-tiny-gpt2` (**fixture, not a real language model**); 177 steps on 235 examples; loss 5.61387 → 4.79243; adapter reload verified: True.

| Arm | Protected test success | Mean regret | Denied | Inaction misses |
|---|---:|---:|---:|---:|
| base | 96/120 | 120.21 | 0 | 0 |
| base_with_memory | 96/120 | 120.21 | 0 | 0 |
| base_with_counterfactual_trials | 96/120 | 120.21 | 0 | 0 |
| trained | 96/120 | 120.21 | 0 | 0 |
| trained_with_memory | 96/120 | 120.21 | 0 | 0 |
| constant_risk_averse | 96/120 | 120.21 | 0 | 0 |

**Verdict: INCONCLUSIVE** — trained minus base +0.000, 95% CI [0.0, 0.0]; trained minus always-risk_averse +0.000, 95% CI [0.0, 0.0]; always the same choice: True; blockers: ['fixture model: mechanics only, not evidence of learning'].

