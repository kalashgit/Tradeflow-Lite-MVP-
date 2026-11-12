# Genesis Autonomous Academy v3 — self-directed bounded research loop

**Research scope:** Qwen remains the planned foundation language model. This milestone makes the **PyTorch causal predictor** train itself iteratively under deterministic host budgets. It does **not** train Qwen weights, teach executable application skills, release production policies or enable open-ended deployment.

## 1. New capability

A researcher launches one bounded run and Genesis independently:

1. Trains a baseline world model from existing receipt-backed learning records and paired permission/delivery interventions.
2. Evaluates its known weaknesses using a development-only cohort.
3. Chooses a target prediction capability (payment, denial or delivery) based on actual class-balanced Brier error and missing training-class coverage.
4. Passes family-level error measurements to the existing `academy.Curriculum` so the next batch targets difficult, underexplored causal environments.
5. Simulates those training cases and constructs verified step labels and, when eligible, paired interventions.
6. Fine-tunes a *copy* of the current champion neural model's weights using additional verified evidence.
7. Saves and reloads its actual checkpoint, with hashes, training data and configuration lineage.
8. Compares the candidate to the parent on the same **development** cohort, including class-balanced Brier per head and family regressions.
9. Automatically retains the better **research-only** checkpoint or rejects the candidate and preserves the old champion.
10. Records a non-executable, evidence-linked skill/capability hypothesis for the target domain. It does not fabricate an executable new skill.
11. Repeats until the configured cycle, simulation, gradient-step or wall-time budget expires.

No human is needed *between these bounded synthetic research steps*. The model is not allowed to invent its own compute budget or examiner.

## 2. Trust boundary

- Candidate learner sees model-visible features from role-scoped observations only.
- Training labels originate from real simulated `World.step` consequences, and remain on the trainer side.
- Development evaluation is consulted each cycle for steering, so it is **not** an untouched holdout or independent certification; repeated tuning to it may overfit.
- Public validation, historical protected tests and adversarial partitions are not accessed in this module.
- The human or separately authenticated evaluation service must still approve any release to TradeFlow.
- This prototype creates **no external or customer effects**, has no deployment permissions, contains no Qwen API calls and cannot merge its own code.
- The ledger is a local hash-linked journal rather than tamper-proof external custody. No self-issued attestation can authorize promotion.

## 3. Example

```bash
cd research/aion-v06
pip install torch --index-url https://download.pytorch.org/whl/cpu

python -m aion_genesis.gml.autonomous_academy \
  --out /tmp/genesis-academy-v3 \
  --rounds 2 --batch-cases 8 --seed-cases 16 \
  --check-cases 40 --initial-epochs 24 --step-epochs 12 \
  --max-training-steps 300 --max-wall-seconds 420
```

Inspect `result.json`, `generations.sqlite3`, every `datasets/generation-*.jsonl` and `models/generation-*/model.pt`.

The default CLI has no background schedule and does not buy compute. The opt-in GitHub Actions job proves that the controller can complete multiple learning cycles without receiving human instructions between cycles. Job orchestration is not enabled for production.

## 4. Exact measurement goals

For a candidate to become the local development champion, the following must all hold:

- Mean class-balanced Brier improvement on available heads ≥ 0.002.
- No individual head's class-balanced Brier worsens by more than 0.02.
- No evaluated family's average raw Brier worsens by more than 0.03.
- No target head is missing the positive or negative class in the development cohort.
- Checkpoint and per-generation hashes are recorded; every rejection remains auditable.

These thresholds are **development steering heuristics**, not claims of statistically significant generalization. Increasing observed performance on these reused cases does not constitute scientific proof of a new model generation.

## 5. The next two gates

**Gate A — Independently evaluated Qwen policy learning:** Use training-only verified `build_policy_datasets` examples to train a Qwen3 LoRA on explicitly authorized hardware, then compare trained vs frozen Qwen on a genuinely protected, externally custodied set of unfamiliar causal mechanisms. Include same-memory and same-compute ablations. This Academy may *request* a bounded Qwen training run; only a trusted host with an approved compute budget may schedule it. No claim of a better Genesis decision policy before that evidence exists.

**Gate B — Autonomous verified skill creation:** Represent each proposed tool skill as a typed contract with sandbox execution, capability prerequisites, reproducible test cases, provenance, scoped permissions, negative-transfer and regression checks, plus an independent authorization gate. Research auto-admission may be allowed only within controlled synthetic sandboxes. No uncontrolled self-modifying code, permission changes, cloud billing or writes to real TradeFlow customer records.

The key principle is **bounded self-direction within an independent testing and authorization structure**, not arbitrary uncontrolled self-modification.
