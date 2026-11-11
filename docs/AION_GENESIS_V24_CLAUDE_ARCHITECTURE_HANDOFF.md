# AION Genesis v2.4 — Actual Runtime Bridge and Claude Architecture Handoff

**Research branch:** `research/aion-v24-runtime-causal-adapter`
**Review PR:** [#93](https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/93)
**Status:** isolated draft; no merge, deployment, auto-edit or holdout evaluation.

## 1. What genuinely runs

The real `aion_genesis.runtime.AionRuntime`, its `StrategicPlanner`,
review-only `DecisionProposalV1`, `ModelBinding`, `OutcomeRecordV1`
and provisional `EffectModel` are now connected to the v2.3
causal-business laboratory through:

- `aion_genesis/eval_v2/genesis_policy.py` —
  `CausalDomainAdapter` translates only role-scoped observed job state into
  `ObservationV1`; `GenesisCausalPolicy` asks the real Genesis runtime
  for bounded options and sends a **typed mock-only** action to the
  fictional `World`. It verifies the operation with an explicit
  `verify_operation` request before recording a provisional receipt.
  Proposal approval state remains `pending_human_review`. This
  synthetic test wrapper is **not** an authorized TradeFlow executor.
- `aion_genesis/eval_v2/genesis_runner.py` — matched actual-runtime
  memory-on/memory-off vs `deadline_first`, `cash_first`,
  `risk_averse` and `no_action`, with independent scenario replay,
  hash-chained events, report, evidence manifest and SHA256 integrity.
- `aion_genesis/eval_v2/improvement_gate.py` — restricted typed
  evidence-linked hypotheses with exact SHA, falsifier, fallback and
  source receipt; emits **DRAFT_NOT_AUTHORIZED** only. Applying changes,
  promoting or deploying from this interface is impossible by design.
- `aion_genesis/provider.py` — existing OpenAI-compatible
  `CompatibleChatAdapter`. A loopback-only `ModelBinding` can be
  created through `bind_local_inference(config,
  explicit_authorization=True)`, and `model_call_budget=1`.
  **Never call remote APIs or even localhost inference in CI.**
  No actual LLM inference or model-weight training is part of the
  baseline CI report; a real *reasoning runtime* is running, not a
  newly trained foundation model.
- `test_eval_v24_genesis_runtime_bridge.py` and
  `test_eval_v24_improvement_benchmark.py` plus a parallel fast
  GitHub Actions job. Historical v1 referee, scorer and hidden
  worlds remain frozen.

**Limitations:** current outcome memory learns only provisional local
effect residuals from *verified mock operations*. This is not reliable
delayed causal attribution, cross-company transfer, or proven ML
generalization. Each synthetic company has its own isolated memory.
A model advisor can rank only pre-validated options and cannot execute.

## 2. Reproduce exact integration and compare with controls

```bash
cd research/aion-v06
python -m unittest discover -s tests -p test_eval_v24_genesis_runtime_bridge.py -q
python -m unittest discover -s tests -p test_eval_v24_improvement_benchmark.py -q
python -m aion_genesis.eval_v2.genesis_runner run \
  --dev 4 --validation 4 --out /tmp/genesis-runtime-v24
python -m aion_genesis.eval_v2.genesis_runner verify \
  --out /tmp/genesis-runtime-v24
```

Historical replays:
```bash
python -m unittest discover -s tests -q
```

Do **not** change fixed worlds, experiment scorer, protected holdout or
baselines to make a candidate look good. Green unit tests mean sound
engineering only, not better business decisions.

## 3. Claude Code: primary architecture mission

**Copy the following instructions into Claude Code, after reviewing this
exact branch and the root `AGENTS.md`, `CLAUDE.md`, scoped
`research/aion-v06/CLAUDE.md` and all referenced Genesis lab docs.**

> **AION Genesis — Major Overhaul #1: Outcome-Grounded Causal Agent**
>
> Work from `research/aion-v24-runtime-causal-adapter`. Inspect
> PR #93, exact HEAD, current CI and code before editing.
> Create **one isolated feature branch and one DRAFT PR**.
> Do not merge, deploy or modify real TradeFlow tenant records.
>
> Build a reusable, independently testable architecture with:
>
> **(A) BeliefStateEstimator** — accepts only role-scoped `ObservationV1`
> and verified source revisions; maintains unknowns, stale/conflicting
> data, actor/tenant boundaries, uncertainty and counterevidence.
> The state is *belief*, not hidden simulator truth.
>
> **(B) CausalTransitionModel** — predicts intermediate business
> consequences: supplier stock, delivery schedules, blocked crews,
> accepted change scope, verified invoices, receivables and cash.
> Version assumptions; calibrate forecasts; preserve evidence IDs.
> Models must be interchangeable, never hardcode world seeds.
>
> **(C) LongHorizonPlanner / RiskGovernor** — bounded scenario rollouts
> across multiple competing jobs, owner priorities, liquidity, shared
> crew/supplier capacity and future effects. Hard reject unauthenticated
> or unapproved actions, stale evidence, re-used keys, other-tenant data,
> unaffordable commitments and irreversible side effects. A model
> cannot invent a tool or bypass the existing review-only runtime
> contract.
>
> **(D) ReceiptGroundedCausalMemory** — save observation, belief,
> proposed intervention, authorized actual action, verified receipt,
> delayed downstream outcome, comparison policy, falsification result,
> uncertainty, scope and expiry. Record alternative explanations and
> failed transfers. A textual rationale is **not** evidence of cause.
> Model and memory updates must be provisional and rollbackable.
>
> **(E) AdaptiveCurriculum** — use development-only measured performance
> to mix escalation, remediation and independently drawn novel
> scenarios with anti-repetition/coverage metrics. Preserve failure
> cohorts and compare memory-on/off, no-model, fixed policy, and
> strongest baseline. Never tune on validation or sealed holdout.
>
> **(F) IndependentEvaluator + non-authoritative critic** — retain
> numeric scoring outside the candidate; score verified paid jobs,
> cash, safety failures, missed opportunity, latency/tool/model cost,
> worst-tail outcomes, counterfactual prediction error, calibration
> and cross-family generalization. A bounded LLM critic may comment
> on evidence and propose tests but cannot set ground truth, edit
> score thresholds or authorize promotion.
>
> Demonstrate one actionable improvement with a **matched controlled
> experiment**, followed by new independently prepared scenarios.
> Report actual outcome differences, uncertainty intervals and
> negative results. If no defensible improvement exists, leave the
> proposal unpromoted rather than declaring success.
>
> Keep all host adapters research-only and explicitly model-off by
> default; if running a local LLM, require the user's explicit opt-in,
> a capped call/token budget, and clearly distinguish measured model
> inference from offline simulation. No remote paid inference by
> default.
>
> **Deliver:** exact branch and commit SHA, proposed architecture,
> changed files, evidence digests, seed manifests, runnable tests,
> calibrated comparisons vs strongest fixed baseline, open risks,
> CI status, a rollback strategy and Q01 independent review request.
> No auto-merge or deployment.

## 4. Independent acceptance gates (must be enforced externally)

1. **Source and permission correctness:** zero unauthorized effects,
   wrong-tenant disclosures, model-generated unregistered commands,
   stale approval execution or fabricated receipts.
2. **Economics:** verified paid jobs, net fictional cash, on-time
   outcomes and downstream opportunity versus strongest fixed-policy
   control; tail risk separately measured. Do not optimize a single
   composite score.
3. **Epistemic accuracy:** source revision traceability, calibration,
   conflicting evidence, missing handoffs and evidence-freshness
   abstentions.
4. **Learning evidence:** memory-on vs off, causally paired scenarios,
   zero-outcome-tie protection, negative transfer, repeatability and
   no loss on unrelated families.
5. **Workflow recovery:** before/after-commit timeouts, idempotency,
   approval revocation, incomplete receipts, delayed payment, human
   interrupts and permission-sensitive tool calls.
6. **Scientific integrity:** immutable dev/control baseline, no
   adaptive validation, independent sealed evaluator, blinded domain
   reviewers and human release approval. **These last external gates
   are not yet operational**.

## 5. Architecture boundaries and future upgrades

v2.2 scripted stakeholder information generator and v2.3 economic world
are connected for actual-event export through
`World.export_causal_network()`. The next task is to unify
the **causal state source** and all ten stakeholder observations in a
single event-sourced world, so generator mutations always produce
actual accountable consequences rather than cosmetic messages.
Build a richer task grammar from the authoritative TradeFlow source
record/permission contracts; never ingest real customer information
into a public research fixture.

The genuinely protected holdout must be held by an independent
custodian outside candidate-accessible GitHub/CI. No tool in this repo
can perform that release evaluation.

**No claim is made that a trained language model has improved, that
production TradeFlow execution is available, or that realistic
business outcomes are independently validated.**
