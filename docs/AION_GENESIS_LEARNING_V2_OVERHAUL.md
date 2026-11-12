# AION Genesis — Learning Architecture v2: first correction to the learning factory

**Status:** Research-only, opt-in, no model promotion, no deployment or customer data.

**Base:** GML-01 in draft PR #102, approval research PRs #103–104. This change does not edit GML-01's frozen protocol, original model code, historical evaluation results, or existing production command pathways.

## 1. Why this change

Claude's previous GML-01 run showed that some targets were missing the observations necessary to learn meaningful decisions. In particular, the `denied` classification head had no positive training labels and the delivered-within-four-ticks prediction failed its precommitted test. The reported world-model verdict was **FAIL** despite an improved job-payment head.

Blindly increasing the size of Qwen, adding more simulations of the same actions or changing the evaluator would not resolve these evidence problems.

The new opt-in data/learning architecture addresses four mechanisms:

1. **Outcome coverage:** `coverage_report` counts verified positive, negative and missing labels per head, with one-class gates and a minimum class-support threshold. Censored/unknown outcomes are never counted as negatives.
2. **Active causal interventions:** `collect_training_probes` runs real synthetic `World.step` counterfactuals within the development-only world: order without revocation versus order following a hidden authority-revocation shock; normal supplier delivery versus a delayed supplier shock. Outcomes are read from the *actual world*, not fabricated labels.
3. **Non-deterministic causal evidence:** `combine_training_evidence` preserves differing verified outcomes for identical model-visible state and action, so the model can learn that a hidden transition introduces genuine uncertainty. The earlier dataset factory deduplicates by input/action and can discard exactly this critical variation.
4. **Generational accountability:** `GenerationLedger` records immutable parent/checkpoint/dataset/memory/curriculum/architecture lineage plus evaluation records linked by SHA-256. Comparisons require the same evaluation cohort and evaluator identity. No in-process string-based signature authorizes promotion.

## 2. What the agent can see

The model-visible step features come from `laboratory.step_view`, derived from role-scoped `World.public_view` receipts only. It never receives a counterfactual shock, simulator hidden state, future payment or evaluator score as part of the input.

Hidden counterfactual mechanism and outcome remain **training-side verification evidence** and may be used as labels.

For revocation, the action is a *deliberately simulated, rejected intervention*, not an action that Genesis or TradeFlow is authorized to attempt in production.

At a hidden revocation tick, the public authority state may still be `unknown` due to delivery lag. This is an important feature of the problem: a learned predictor cannot infer permission from absence of a revocation message. A real host governor must still fail closed independently.

## 3. Development-only evidence and metric contract

The new CLI can retrain two separately initialized world models with the exact same seed and hyperparameters:

- **Control:** Original development training examples.
- **Candidate:** Control plus independently verified causal probes.
- **Check:** A separate, fixed, development-only scenario cohort, never used for training, with equal blinded probe mechanisms.

The check reports **Brier score** for each original model head, including label class counts, model weights/lineage, training steps, and changes relative to control.

This experiment **does not** examine the GML-01 public validation or protected test partitions. The old failure remains unchanged. The candidate is not released or promoted, regardless of development-only score.

This is intended to answer a falsifiable question: *Does adding actual missing counterexample labels improve prediction under unseen development seeds?* Merely obtaining balanced counts is not evidence of prediction improvement.

## 4. Generational measurement

Every model candidate should eventually have these linked identities:

- Parent generation, source and architecture revision.
- Model checkpoint hash (actual saved weights).
- Training data, curriculum and memory hash.
- World/scenario mechanism and evaluator identity.
- Task success, cash/utility, denied operations, negative transfer and total compute on matched cohorts.
- Rejected-candidate evidence and reproducible lessons.

The current `GenerationLedger` is **a local research audit log, not tamper-proof trusted custody**: someone with write access to its SQLite database can rewrite the entire chain. Production authority must use externally controlled signatures, audit storage and identity.

## 5. Commands

```bash
cd research/aion-v06

# No PyTorch or Qwen required for data quality
python -m unittest discover -s tests -p test_genesis_learning_v2.py -v
python -m aion_genesis.gml.learning_v2_cli audit --out /tmp/genesis-learning-v2

# Requires CPU PyTorch. Trains and compares two actual parameterized predictors
python -m aion_genesis.gml.learning_v2_cli compare --out /tmp/genesis-learning-v2-compare

# Full inherited tests
python -m unittest discover -s tests -q
```

## 6. Next engineering gates

- If the development-only predictor actually improves, preregister a **new independent external holdout**, with the evaluator outside the candidate's mutable tree. The old inspected cases are *not* fresh evidence.
- Extend the probe planner beyond simple permission/delivery interventions to cash pressure, changed-scope approvals, conflicting supplier messages and delayed customer payment.
- Use measured failure reduction and calibration, not raw uncertainty, to update the academy's training curriculum.
- Train a Qwen LoRA adapter from higher-quality, independently verified decisions after validating the label and preference quality; compare matched base+memory and adapter+memory on fresh cases.
- Build a signed generation approval service and cross-generation retention/forgetting diagnostics. Do not trust self-issued local verdicts for production releases.
- Request Q01 independent review before any merge. No live TradeFlow actions.
