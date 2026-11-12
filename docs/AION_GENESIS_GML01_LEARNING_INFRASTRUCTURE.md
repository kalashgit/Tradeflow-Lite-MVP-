# AION Genesis GML-01 — compounding machine-learning infrastructure

**Branch:** `claude/aion-gml-01`, from PR #101 head `e00f278`.
**Status:** research draft. Nothing is promoted, merged or deployed.
Synthetic simulation only; no protected external holdout exists in this repo.

## Milestone status

| Milestone | Status | Evidence |
|---|---|---|
| M0 architecture, contracts, lineage | **Done** | `aion_genesis/gml/`, 21 tests, leakage and separation tests |
| M1 verified experience factory | **Done** | 240 sealed trajectories → 235 supervised examples, 917 preference pairs, 7,231 transition examples |
| M2 learned dynamics | **Trained and evaluated; preregistered verdict FAIL** | Beats every baseline on the main head (job paid) on held-out mechanisms; does not on the delivery head |
| M3 Qwen LoRA candidate | **Real adapter trained and evaluated in CI; not recommended for approval** | Beats the frozen base (96 vs 62 of 120) but only equals an always-`risk_averse` constant |
| M4 self-directed curriculum | **Run once; INCONCLUSIVE** | +0.8% relative gain vs uniform, below the 5% threshold, no interval |
| M5 second generation | **Not started** | Needs an accepted first-generation candidate |
| M6 controlled improvement factory | **Not started** | Registry and verdict gate exist; no proposal loop yet |

## 1. Audit of existing work

| Existing piece | Decision |
|---|---|
| `eval_v2/causal_world.py`, `adaptive.py` (world, fixed strategies, judge) | **Immutable reference.** Wrapped by the laboratory, not edited |
| `runtime/` (review-only `AionRuntime`, contracts) | Reused unchanged; not the training target yet |
| `asil/`, `asil_v26/` (routing, attribution ledger, regime detector) | Kept as is. The v2.6 attribution ledger's censoring idea is adopted in the dataset factory |
| `learning_v3/` (grounding, paired correction, Qwen/Ollama strategy choice) | Task definition reused: pick one of four vetted strategies from the project-manager view |
| `lab/` (v1 referee, ledger) | Untouched |
| Model-weight learning | **Did not exist anywhere.** Every earlier "learning" result was memory, routing or in-context feedback |

## 2. Architecture

```
laboratory.py  hidden: worlds, rollouts, counterfactual branches, outcomes
academy.py     capability taxonomy, validated proposals, bandit curriculum
runtime.py     public: prompts, policy backends (any causal LM ± adapter), memory
factory.py     trajectories → deduplicated, contamination-checked, hashed datasets
training/      world_model.py (PyTorch), lora.py (PEFT), registry.py, fixture.py
authority.py   sealed partitions, statistics, PASS / FAIL / INCONCLUSIVE verdicts
pipeline.py    one entrypoint, resumable stages, run manifest
contracts.py   GenesisLearningTrajectory/1.0 schema, validator, hashing
```

Rules enforced by tests:

- `runtime.py` and `training/` import nothing from the laboratory, academy,
  factory or authority.
- Non-train scenarios can be generated only with a token the authority mints.
- A trajectory's model-visible input may not contain any hidden-side field;
  outcomes are labels only.
- Only the `train` partition can be training-eligible; censored or
  receipt-free outcomes cannot.
- The registry accepts verdicts only from the authority; a rejected candidate
  never replaces the current model; rollback keeps history.

Same-process separation is **not** a security boundary. A real protected test
needs a custodian outside this repository.

## 3. Trajectory contract

`GenesisLearningTrajectory/1.0` has seven required sections: environment,
model, available_information, decision, verified_consequences,
learning_evidence, provenance. Each record is content-addressed
(`TRJ-<hash>`); any edit breaks its checksum. Step-level transition examples
are a compact projection that keeps scenario id, source reference and
censoring flag.

## 4. Partitions (by mechanism and template lineage, not seed)

| Partition | Contents |
|---|---|
| train | 4 mechanism families, difficulty 1–3, novelty 0–2 |
| public_validation | same mechanisms, fresh cases |
| protected_test | difficulty 4 for every family **plus two mechanism families never trained on** (invoice dispute, compound) |
| adversarial | difficulty 5, novelty 3–5: authority revocation, message lag |

No template lineage, seed or initial state is shared between train and the
protected or adversarial partitions (tested). Protocol and thresholds were
committed at `eb48132` before any protected scenario was scored.

## 5. Results

### M2 — learned causal world model (real training, CPU, 4 s)

4,419 parameters, 3-seed ensemble, trained on 7,231 transition examples.
Parameter change L2 9.95; loss 0.375 → 0.061; reload reproduces predictions
exactly.

| Protected test (held-out mechanisms) | Learned Brier | Constant | Heuristic | Untrained |
|---|---:|---:|---:|---:|
| Job eventually paid (n=1,814) | **0.113** | 0.275 | 0.200 | 0.243 |
| Action denied (n=3,523) | 0.000 | 0.000 | 0.000 | 0.302 |
| Delivered within 4 ticks (n=567) | 0.500 | **0.485** | **0.485** | 0.243 |

- **Preregistered verdict: FAIL.** The rule required beating all baselines on
  every head. The delivery head is worse than a constant under shift, and the
  denial head ties at zero because training data contained no denials.
- The main head is a real improvement on unfamiliar mechanisms, also on the
  adversarial partition (0.170 vs 0.229 heuristic).
- Intervention sensitivity: on matched counterfactual pairs the model ranks
  the better branch correctly 73% of the time on the protected test (47/64)
  and 95% on public validation (20/21).
- Uncertainty rises on unfamiliar data: ensemble disagreement 0.053 public
  validation, 0.088 protected, 0.073 adversarial.
- Overconfidence under shift: on the adversarial partition log-loss is
  slightly worse than a constant (0.770 vs 0.756) although Brier is better.

### M4 — curriculum (development data only)

Adaptive family selection versus uniform at equal simulator budget
(144 scenarios, about 23,900 steps each): final Brier 0.0477 vs 0.0481,
**+0.8% relative, INCONCLUSIVE** against a 5% threshold. One run, no interval.
The four training families are about equally hard, so there was little for an
uncertainty-seeking curriculum to exploit.

### M3 — Qwen3-0.6B LoRA policy

Task: from the project manager's initial view, choose one of four vetted
strategies. Success means the choice is among those tied for the best
independently measured outcome. A constant always-`risk_averse` policy is
reported beside every learned arm, because it alone succeeds on 80% of the
protected test.

Arms: base, base + verified memory, base + counterfactual trial results,
trained adapter, trained + memory, constant.

The pipeline is verified end to end here with a tiny random fixture model
(training changes parameters, adapter saves, reloads onto a fresh base and
reproduces the trained outputs). **That fixture is not evidence of learning**
and its verdict is forced to INCONCLUSIVE.

**Real run** (GitHub-hosted CPU runner, commit `d3f0eaa`, about 70 minutes,
public weights, no paid compute; this sandbox cannot reach Hugging Face).
118 LoRA steps on 235 verified examples, loss 1.088 → 0.253, adapter saved,
reloaded onto a fresh base and verified.

| Arm (protected test, 120 scenarios) | Success |
|---|---:|
| Frozen base | 62 |
| Base + verified memory | 86 |
| Base + counterfactual trial results | 73 |
| **Trained adapter** | **96** |
| Trained adapter + memory | 97 |
| Constant: always `risk_averse` | 96 |

- Automated verdict PASS: trained minus base +28.3 points, 95% CI 18.3 to 38.3,
  no denied actions.
- **The adapter gives the same answer on every protected scenario and exactly
  matches the constant policy.** The weights learned the dominant label, not a
  situation-dependent decision. The preregistered criterion compared only
  against the base and was too weak.
- **Recommendation: do not approve this adapter.** It is real evidence that
  the experience → dataset → parameter update → reload → independent
  evaluation loop works, and not evidence that Genesis learned to decide.
- Weight learning did beat the same base given the same verified examples as
  context (96 vs 86), and adding memory to the trained adapter changed one
  case (97).

Details: `research/aion-v06/reports/gml_01/QWEN_LORA_CI_RUN.md`.

## 6. Runbook

```bash
cd research/aion-v06
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers peft

python -m unittest discover -s tests -q                       # 319 tests

# Everything offline (world model really trains; policy uses the fixture), ~1 min
python -m aion_genesis.gml run --out /tmp/gml --policy-backend fixture

# Real Qwen LoRA (needs Hugging Face access; CPU works, GPU is faster)
python -m aion_genesis.gml run --out /tmp/gml-qwen --policy-backend hf \
    --base-model Qwen/Qwen3-0.6B

python -m aion_genesis.gml verify --out /tmp/gml          # hashes, datasets, lineage
python -m aion_genesis.gml run --out /tmp/x --limit 12    # smoke run
```

Stages are resumable: a finished stage is reused when the protocol is the
same. Outputs: `trajectories.jsonl`, `datasets/<kind>-<hash>/`,
`models/` (checkpoints, adapter, `registry.json`), `stage-*.json`,
`result.json`, `REPORT.md`, `manifest.json`.

To swap the foundation model, pass another causal-LM id or local folder to
`--base-model`; nothing else changes. To add a training algorithm, add a
module beside `training/lora.py`; preference optimisation and reinforcement
learning are refused until their labels and reward are separately validated.

## 7. Known limits and blockers

- The policy criterion must be strengthened before the next generation: require a
  gain over the best constant policy, on a task without one dominant answer.
- Preference pairs are built and stored but **not validated or used**.
- The strategy task has only four actions and a dominant default; headroom
  for a trained policy is small by construction.
- The world is a small hand-written simulator; nothing here is real-world
  evidence.
- Loop 1 (corrective replay → memory candidate) is the existing v3 code and
  is not yet wired into the dataset factory.
- No sharded or queued execution yet; the pipeline is single-process and
  resumable per stage.
- The protected test is in-repo. Once scored it is historical evidence; the
  authority logs each exposure and downgrades a repeat to INCONCLUSIVE.

## 8. Rollback

Additive only: `aion_genesis/gml/`, one test file, one workflow, this
document and `reports/gml_01/`. No existing module, judge, baseline or
workflow was edited. Not merging the branch restores PR #101 exactly.
