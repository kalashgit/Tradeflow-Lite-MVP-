# AION Genesis v2.5 — Adaptive Strategic Intuition Layer (ASIL): audit and first result

**Branch:** `claude/aion-asil-v25` (from PR #93 head `cfb1303`) · **Mission:** issue #95
**Status:** draft research candidate. **7 of 9 prespecified criteria met, 2 not met.**
Not promoted, not merged, not deployed. Synthetic simulation only, zero model
calls, no protected holdout.

## 1. Audit of what existed

No code, test or document on any branch used the name ASIL. What existed as a
partial implementation of the idea:

| Piece | Where | State found |
|---|---|---|
| Review-only runtime, proposals, receipts | `runtime/engine.py`, `contracts.py` | Works; reused unchanged |
| Outcome memory (additive residual) and four context variants | `runtime/learning.py`, `contextual_memory.py`, `hybrid_memory.py`, `relevant_memory.py`, `domain_general_memory.py` | Run, but adjust *estimates* only; no routing, no confidence, no delayed verification |
| Runtime bridge to the causal business world | `eval_v2/genesis_policy.py` | Works; memory-on regresses |
| Fixed policies, frozen judge, curriculum | `eval_v2/adaptive.py` | Works; reused as baselines and scorer |
| Fast/deep routing, calibrated confidence, abstention, forward simulation | — | **Did not exist** |

Baseline at `cfb1303`: 244 Python tests pass.

### The memory regression, reproduced and explained

On a fresh development cohort (24 cases, 72 jobs) the v2.4 memory-on runtime
paid **31** jobs against **51** with memory off. The cause is visible in
`genesis_policy.py`: the outcome recorded for a verified operation is its
immediate receipt (`progress` 0 for an order, an escalation or an invoice
request), while the option's estimate is a heuristic value of 1.4–2.7. Every
non-crew action therefore produces a large negative residual, and memory
learns that ordering materials and unblocking jobs "do not work". This is
premature proxy attribution: tested here by replacing it with delayed,
verified business outcomes, after which experience no longer hurts (section 4).

Two further defects in the v2.4 option set lose jobs for every baseline: a job
could never be ordered once a supplier-delay notice arrived, and never be
invoiced after a resolved dispute. The ASIL domain pack repairs both. The
`planner_only` control isolates that repair: it changes nothing on validation
(126/180 with and without it), so the gains below are not due to it.

## 2. Architecture

Domain-general core, `aion_genesis/asil/core.py`:

| Component | Role |
|---|---|
| `StrategicContextRecognizer` | Abstract `name=value` tokens for a decision; exact and coarser signatures. Identifiers and amounts are rejected, so memory cannot hold tenant facts |
| `IntuitionMemory` | Append-only, versioned, reversible, freezable store of verified strategy outcomes with evidence refs, confounders and alternative explanations; age-discounted |
| `ConfidenceCalibrator` | Beta-posterior reliability with 5%/95% bounds; Brier and calibration error |
| `MetacognitiveRouter` | fast / deep / abstain / reflex from support, bounds, contradiction, stakes, reversibility, budget and value of investigating. A partial match may veto, never authorise |
| `CausalOutcomeVerifier` | Holds a decision open until the delayed business outcome is confirmed; a committed receipt alone teaches nothing |
| `AdaptiveStrategyLearner` | Writes settled outcomes, keeping failures and doubts |

Domain adapter, `aion_genesis/eval_v2/asil_policy.py`: context features, a
`TransitionModel` (process lags and episode length learned from receipts) and
`DeepStrategyPlanner` (bounded forward simulation over job orderings and cash
reserve rules, nominal and adverse timing, compared against doing nothing).
The real `AionRuntime` still validates every option and issues the
`pending_human_review` proposal; ASIL chooses only among validated options.

## 3. Protocol

Registered in `eval_v2/asil_protocol_v25.json` and committed at `8cfd0f4`
**before any validation case was generated**. Learning happens only in a
60-case development career; memory and transition model are then frozen.
Validation: 60 fresh cases, plus 30 harder novel cases, 30 "twin" cases (same
jobs, different shocks), a replay of the career, and memory negative controls.
Scored by the frozen v2.3 judge. Run once; nothing was retuned afterwards.

## 4. Results (commit `8cfd0f4`, independently replayed)

| Validation, 60 cases, 180 jobs | Paid | Denied | Cash change | Planning ops |
|---|---:|---:|---:|---:|
| **ASIL adaptive** | **171** | 3 | +33,200 | 106,038 |
| ASIL deep-only | 168 | 0 | +33,641 | 203,949 |
| ASIL memory-off | 168 | 0 | +33,587 | 209,692 |
| ASIL fast-only | 88 | 0 | +2,738 | 0 |
| Fixed risk-averse (strongest baseline) | 144 | 3 | +26,999 | — |
| Fixed cash-first | 132 | 0 | +21,204 | — |
| Runtime memory off (v2.4) | 126 | 1 | +18,483 | — |
| Fixed deadline-first | 118 | 0 | +15,903 | — |
| Runtime memory on (v2.4) | 88 | 2 | +13,252 | — |

| Criterion | Result | Evidence |
|---|---|---|
| Better than strongest baseline | **MET** | +0.45 paid jobs per case, 95% CI 0.28 to 0.63; better in 22 cases, worse in 1 |
| Experience does not hurt | **MET** | vs memory-off: +0.05, CI 0.00 to 0.13; worse in 0 cases |
| Experience improves decisions | **NOT MET** | Same interval: lower bound is 0, not above it |
| Deep reasoning used selectively | **MET** | 52% of deep-only planning operations, 171 vs 168 paid |
| Safety vs strongest baseline | **MET** | 3 denied actions each (deep-only had 0) |
| False familiarity ≤ 10% | **MET** | 6/462 confident fast decisions wrong (1.3%); 0/224 on twins |
| Fast-path calibration | **MET** | confidence 0.986 vs observed 0.987; ECE 0.001 |
| Retention | **MET** | career replay 173/180 both times; operations 103,090 → 93,286 |
| Transfer to novel cases | **NOT MET** | 68/90 vs deep-only 70/90; **13 denied actions vs 0**; worse than memory-off in 9 of 30 cases |

Twins: adaptive 85/90, deep-only 78/90, strongest fixed 51/90.
During the career, deep decisions per 15 episodes fell 196 → 113 and fast
decisions rose 64 → 123 with paid jobs steady (42, 42, 45, 44 of 45).

## 5. Negative findings and limits

- **Experience is not shown to improve decisions.** Almost all of the gain over
  existing baselines comes from investigation (the forward simulation), not
  from memory. Memory's measured contribution is cost: about half the planning
  operations at equal quality.
- **Negative transfer on harder, novel cases.** Fast decisions led to 13 denied
  actions where deep-only had none. Fast-path reliability fell from 98.7% to
  92.5%. The router does not yet recognise a shifted regime as unfamiliar.
  Cause not yet established; revoked authority arriving with message lag is the
  leading hypothesis and is untested.
- **Fast intelligence alone fails** (88/180): without investigation it falls
  back to the runtime heuristic and strands cash.
- **The misleading-memory control was uninformative.** Rewriting failures as
  successes changed nothing (85/90 both ways), so it does not show robustness.
  A stronger poisoning test is needed.
- **Wall-clock latency barely differs by route** (fast 5.7 ms, deep 7.2 ms
  median). The runtime's own proposal step dominates, so the saving is in
  planning operations, not response time.
- The deep planner is a hand-written process model of this simulator. It is
  not learned, and its success says nothing about real contractors.
- One synthetic "learner" scope accumulates abstract strategy statistics
  across fictional companies. Whether that is acceptable across real tenants
  is an open product decision; nothing here does it with real data.
- Public validation is not a protected holdout. No external custodian, no
  human calibration, no model inference were involved.

## 6. Reproduce

```bash
cd research/aion-v06
python -m unittest discover -s tests -q                                  # 261 tests
python -m aion_genesis.eval_v2.asil_runner run --out /tmp/asil-v25       # ~5 min
python -m aion_genesis.eval_v2.asil_runner verify --out /tmp/asil-v25    # independent replay
```

Reference outputs: `research/aion-v06/reports/asil_v25/` (protocol digest
`84beabe7cde3f704…`, frozen memory 726 records, digest `37bb1a00d0471b28…`).

## 7. Rollback

Everything is additive: `aion_genesis/asil/`, `eval_v2/asil_*`, one test file,
one workflow, this document and the reports folder. No existing module, test,
judge, baseline or workflow was edited. Reverting the branch's commits, or not
merging it, restores v2.4 exactly. At runtime ASIL is opt-in (a separate
policy class); `IntuitionMemory.rollback(version)` undoes learning.

## 8. Request for independent review (Q01)

1. Confirm the criteria were fixed at `8cfd0f4` before validation and that
   the replay in CI matches the committed result.
2. Challenge the residual-memory diagnosis in section 1 with a controlled
   intervention on `genesis_policy.py`.
3. Decide whether the novel-case safety regression blocks further work on the
   fast path, or defines the next packet.
4. Rule on cross-company abstract strategy memory before any tenant data.

## 9. Proposed next packet (new protocol version, fresh cases)

Make the router detect regime shift before trusting memory (track recent
denial and surprise rates per episode and fall back to deep), add a stronger
misleading-memory control, and test whether a learned transition model can
give experience a measurable decision gain. Validation indices 2000–2329 are
now inspected and must not be reused as unseen evidence.
