# AION Genesis — AI reading collection → verified research mechanisms (v3.0)

**Status:** research-only implementation, NOT a trained Genesis model, not an accuracy/hallucination guarantee and not a production authority boundary. Based on the user's historical eight-title AI reading list, public official tables of contents/selected previews, the user's distinct **TradeFlow Business Mastery — 19 Sources** original paraphrased study guide/JSONL in the Library, and source-backed Genesis research records. **No claim is made that all eight complete copyrighted books were available or read.** Do not redistribute copyrighted book text or train on the 19-source guide without separate rights and approval.

## Why this change exists

The actual Genesis research has two different partially disconnected tracks: the earlier [Qwen/Ollama model experiments (PR #83)](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/83) and the newer synthetic [business network #91](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/91), [causal laboratory #92](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/92), [ASIL #96](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/96) and [safety foundations #98](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/98). This PR supplies only two minimal testable **contracts** to help connect them. Do not substitute a green unit test for a model learning result.

## Reading-to-algorithm mapping (conceptual applications, not quotations)

| Source from reading list | Principle selected for Genesis | Concrete experiment or engineering gate |
|---|---|---|
| Stuart Russell & Peter Norvig, *Artificial Intelligence: A Modern Approach* | Partial observability, belief state, contingent planning, uncertainty | Compare plans using only delivered evidence against ground truth held by judge; identify unknown and conflicting facts; test role-restricted observation |
| Richard Sutton & Andrew Barto, *Reinforcement Learning: An Introduction* | Delayed reward, exploration/exploitation, temporal credit assignment | Attribute action-specific verified effects, not terminal job payment to every step; compare learning after one feedback with equal-budget no-memory |
| Chip Huyen, *AI Engineering* | Evaluation tied to application, factual consistency, cost/latency tradeoffs | Scored grounded factual assertions and abstentions; report accuracy, calibrated uncertainty, cost, latency and safety separately |
| Chip Huyen, *Designing Machine Learning Systems* | Data quality, distribution shift, monitoring, retraining discipline | Simulated supplier-regime switches and stale evidence; evaluate memory transfer and drift detection |
| Martin Kleppmann, *Designing Data-Intensive Applications* | Event/revision consistency, idempotency, durable logs and failure semantics | Reject wrong revisions, unknown commits and duplicate receipts; independently revalidate live authority at executor |
| Goodfellow, Bengio & Courville, *Deep Learning* | Generalization vs training-set fit, regularization and holdout | Same-case correction is practice; withhold novel families and report negative transfer; no weight-update claim |
| Stuart Russell, *Human Compatible* | Uncertain human objectives and human oversight | Unclear owner preferences, revoked budget or unsafe proposals trigger clarification/approval rather than unilateral action |
| Hunt & Thomas, *The Pragmatic Programmer* | Reproducible testing and disciplined software change | Tests, atomic versioned artifacts, isolated draft PRs, immutable baselines, rollback |

Official source previews/catalogs reviewed in this task:
- [Artificial Intelligence: A Modern Approach, official site](https://aima.cs.berkeley.edu/)
- [Reinforcement Learning, second edition, MIT Press](https://mitpress.mit.edu/9780262039246/reinforcement-learning/)
- [AI Engineering, evaluation chapter preview](https://www.oreilly.com/library/view/ai-engineering/9781098166298/ch04.html)
- [Designing Data-Intensive Applications, O'Reilly](https://www.oreilly.com/library/view/designing-data-intensive/9781491903063/)

The separate 19-source TradeFlow Business Mastery collection is an **existing paraphrased guide**, not 19 verified full books. Its ideas about bottlenecks, stocks/flows, delayed collection, opportunity cost, management and process reliability should generate business-world hypotheses and scenario templates, **not source-free assertions of cash or operational truth**. Respect the source JSONL training note: retrieval reference first, fine-tuning only after separate rights/approval review.

## Implemented foundation

1. `aion_genesis/learning_v3/grounding.py` — scoped read-only evidence gate. Unknown, stale, same-revision contradictory and merely reported/inferred facts cannot become unqualified **supported** assertions. An external trusted evidence adapter must assign `host_verified`; a model cannot mint verification itself. Explicit current source revision can invalidate previously observed evidence. It does **not** prove every verified source is true, nor authenticate its caller.
2. `aion_genesis/learning_v3/correction.py` — exact-initial-world/seed paired comparison with independent receipt references, verified outcome states, utility delta and separate safety flags; a success on the same case is marked *eligible for causal review* but is **not** evidence of transfer. Validation/holdout is never used to admit training memory. Optional conditional development memory requires distinct causal evidence reference, matching context, same world version and no detected regime shift. These Python objects do not themselves authenticate the judge or review origin; external process isolation is mandatory before trusting them.
3. 12 focused unit tests and a research-only full-suite CI job; zero live data, external writes, paid inference or policy change.

Run from `research/aion-v06`:

```bash
python -m unittest discover -s tests -p test_genesis_v3_grounded_correction.py -q
python -m unittest discover -s tests -q
```

## How this becomes a real self-correcting Genesis (NOT completed)

**Phase 1:** wire only trusted source snapshots from the existing v2.2 network and v2.3 causal world into the evidence gate. Keep executor truth and model belief isolated. Model must be able to reply **unknown/conflicted/stale** rather than hallucinate.

**Phase 2:** attach an actual pinned-model policy (reuse the bounded Qwen/Claude model adapter rather than reinvent) to a strict read/plan/typed-proposal interface. Freeze model, scenario world/version, seed, tools, costs and evaluation; compare initial failure against first corrected retry, deep-only and no-memory.

**Phase 3:** independent judge certifies receipts and intervention effects; memory only after a reproducible causal test, and with explicit applicability predicates. Build counterexamples to past successful strategies.

**Phase 4:** scenario-forging agent proposes new parameterized causal worlds and interventions; a separate validator checks realism, transition invariants, role access, conservation of money/inventory and unpredictability. Reviewer generates withheld worlds outside candidate repository.

**Phase 5:** Claude Code may diagnose repeated failures and propose candidate changes in isolated **draft PRs**, never modify protected grader or force acceptance; independent safety/holdout tests, human review and budgeted CI before any release.

## Metrics and acceptance — propose before fresh evaluation

- **One-feedback recovery:** corrected first replay / verified initially failed and recoverable scenarios, report exact numerator/denominator.
- **Net utility delta:** paired economic/delay/harm score; include distribution, worst decile and opportunity costs.
- **Causal intervention validity:** fraction of candidate hypotheses surviving isolated intervention; confounding/censoring reported.
- **Fresh transfer:** paired uplift against same-model memory-off and deep-only on different scenario families under equal budgets; confidence interval and negative-transfer rate.
- **Knowledge discipline:** supported-claim precision, fabricated-source-ref rate, unsupported-claim frequency, unknown/stale recognition and calibrated abstention. No promise of zero hallucinations.
- **Safety:** successful unauthorized writes must be zero; denied attempts tracked separately; role/tenant leakage and false approval interpretation are hard failures.
- **Efficiency:** model tokens, scenario steps, time/cost per verified corrected case; stopping without information gain.
- **Simulator integrity:** invariants, deterministic replay for matched random seeds, human realistic-case calibration, withheld generator outside candidate custody.

Keep statuses separate: **mechanical contract test passed ≠ real model learned ≠ generalized intelligence ≠ deployed safety**.
