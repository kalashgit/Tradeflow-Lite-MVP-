# AION GENESIS — Research architecture v0.6

## North-star research question

Can a continuously running system **discover, design, and rigorously select
new ways of learning and reasoning**, gaining transferable capability at a
fixed or improving cost? Unlike a conventional AI assistant, its output is
not primarily answers to tasks, but reproducible advancements in *learner
design*. The aspiration is open-ended adaptive intelligence; this document
does not assume that open-endedness is already solved.

## The three nested evolutionary loops

1. **Causal learning (within a lifetime):** an individual scientist selects
   interventions, observes outcomes, forms hypotheses, makes predictions,
   seeks counterexamples, and revises its belief state.
2. **Learner evolution (across lifetimes):** a population proposes new learning
   policies, reasoning tools, memory methods, and eventually safe program
   transformations. Every candidate receives equal-budget, externally scored
   trials. Diverse lineages remain available, including useful failures.
3. **Curriculum evolution (across worlds):** a worldsmith generates novel
   challenges and tests; a separate referee chooses which are scientifically
   valid and keeps undisclosed holdouts. The system is penalized for overfitting
   familiar tasks, not rewarded for arbitrarily making tasks harder.

Later, **transfer to reality** adds an independent loop of external tests
against verifiable software, mathematics, and carefully authorized practical
problems. Simulation success is never itself proof of external usefulness.

## Logical components

| Component | Responsibility | Authority boundary |
| --- | --- | --- |
| World registry | Versioned causal generators, interventions, observations | Does not expose secret rules to learners |
| Scientist / Qwen adapter | Beliefs, hypotheses, experiment requests, predictions | No ability to alter scores or world secrets |
| Strategy genome | Versioned learning method, prompts, tool graph, memory policy | Evolvable scope explicitly allowlisted |
| Experiment scheduler | Seeded runs, budgets, retries, independent replay | Metered time, calls, data and compute |
| Judge | Prediction accuracy, causal validity, cost, calibration, robustness | Separate from the candidate that is evaluated |
| Evolution engine | Propose/mutate/select/archive candidates | Can nominate, never self-certify or self-promote |
| Memory / lineage archive | Provenance, evidence, failed ideas, ancestry and costs | Append-only audit; no synthetic-to-real evidence laundering |
| Curriculum/worldsmith | New challenges, adversarial tests, causal worlds | May not redefine the final referee's pass criteria |
| Promotion gate | Staged acceptance, rollback, human approval where required | Fixed policies and protected evaluation logic |
| External laboratory | Safe, approved software and science tasks | No implied permission for deployment or third-party action |

## The major boundary

The **candidate learner is not trusted**. The judge, frozen tasks, reward
definition, run ledger, budget accounting, and authorization policy belong to
separate services/identities in a future hardened implementation. In v0.1 they
are simply separate modules in one Python process; this does **not** prevent
a malicious process from cheating and must not be treated as isolation.

Autonomous changes begin with explicit configuration/DSL mutation; arbitrary
Python patches, process execution, new network permissions, model fine-tuning,
deployment, and financial/business actions are **out of scope** until there
are secure sandboxes, independent validators, quotas, replay tests, and
approval paths.

## Evidence protocol

Every experimental claim must record:

- genome and parent lineage, source of proposal, model/version if applicable;
- task family, seeds and partition ID, immutable evaluator version;
- observations and interventions, prediction before outcome, errors and cost;
- at least one independent holdout and one distribution-shift family;
- baselines, confidence intervals across many world seeds, and paired controls;
- wall time, token/inference calls, compute and monetary costs;
- failure types, uncertain conclusions, and exact reproducibility commands.

Primary selection metrics: unseen-prediction accuracy, sample efficiency,
out-of-distribution improvement, calibration and total compute cost. Secondary
metrics: novelty, diversity of solutions, scientific interpretability, and
performance on external tasks. No single metric defines intelligence.

Success condition for a research milestone: a candidate beats the preregistered
baseline **on held-out families that did not influence mutation or selection**,
across multiple seeds and with no higher failure rate or unsustainable cost.
Negative transfer or severe reward hacking blocks promotion regardless of an
impressive in-distribution score.

## Research roadmap

### V0 — Reproducible causal laboratory (implemented)

- Four-variable binary intervention world and hidden rules.
- Train/evaluate split and evolutionary selection over 12 explicit genomes.
- Hypothesis revision trace and out-of-distribution control.
- Independently configurable OpenAI-compatible Qwen network adapter.
- Standard-library tests and fixed-seed JSON report.

### V0.2 — Adaptive causal recovery (implemented)

- Noisy observations and a hidden change during an ongoing environment stream.
- Surprise-triggered investigation, frozen candidate vocabulary, separate
  training and validation observations, and explicit promotion criteria.
- Same evidence stream for adaptive and fixed learners; independent evaluator
  scores current causal accuracy without leaking ground truth into learner data.
- Changed and unchanged control cohorts (50 each), repeatable seeded reports,
  and a standalone mobile-readable HTML error/time visualization.
- Acknowledge the limits: large detectable shift, periodic complete coverage,
  programmed cubic hypothesis menu, and no live Qwen hypothesis generation.

### V0.3 — Transferable experiment policy and causal memory (implemented)

- Compare two bounded, human-designed experiment policies on 16 source worlds
  with 3-way hidden conjunction shifts; automatically select the validated
  policy with lower experimental cost.
- Persist selected principle with source provenance and validation evidence in
  SQLite; prevent silent replacement and detect accidental record corruption.
- Freeze policy and test on 40 disjoint 4-way conjunction worlds. Measure
  sample efficiency against a general search that can represent the same rules.
- Test 20 XOR negative-control worlds to ensure an attractive but unsupported
  conjunction explanation is rejected by extra held-out counterexamples.
- Honest scope: a tiny, programmer-specified experiment-policy search space;
  no autonomous algorithm creation, model weight learning or Qwen inference.

### V0.4 — TradeFlow World V1, isolated contractor research plugin (implemented)

- Synthetic electrical-company job stream with varying urgency, crew load,
  material demand, quotes, supplier and reserve choices, and fictional margins.
- Hidden stochastic procurement and crew delays, with one supplier regime
  change during the episode. Typed actions prohibit any live business effects.
- Paired evaluation with common job-level shocks: cost-first, static risk,
  adaptive frequency estimates, and explicit supplier-change detection.
- Changed and unchanged seeded cohorts, outcome and false-alarm metrics,
  independent public world interface, and mobile-readable standalone dashboard.
- Clear boundaries: no TradeFlow repository integration, Qwen calls, customer
  data access, real purchasing, crew assignment, or permission escalation.

### V0.5 — Model-agnostic decision trial (harness implemented; live inference pending)

- Strict schema contracts for two simulated actions, component-delay probability
  predictions made before the resulting events, and a short unverified hypothesis.
- An independent OpenAI-compatible HTTP adapter with a completion token cap.
- Each company creates a fresh policy instance. Prompts contain observable job
  context, aggregate past-action counts, and the last eight realized outcomes,
  never simulator secrets, alternate-action results, or production data.
- Calibration via Brier scores, financial outcomes, and a chronological
  hypothesis trace, compared to four predetermined baselines.
- Optional **paired no-memory ablation** suppresses experience counts and
  recent outcomes, exposing whether experience helps the same configured model.
  The ablation has an explicit twice-as-large inference-call budget.
- A deterministic fixture tests end-to-end plumbing and must never be reported
  as language-model performance. All model outputs fail closed on invalid JSON.
- A model-comparison tool checks matching prompt protocols, job seeds, shift
  timing, memory conditions, and per-company evidence before reporting paired
  outcomes. It rejects synthetic fixtures by default and makes no automatic
  promotion decision.

**Next gating experiment:** Connect a live Qwen or alternative compatible model
and evaluate on prespecified, unfamiliar simulated companies with frozen prompts,
matched call budgets, and a memory ablation. Follow with permissioned read-only
replay before any consideration of real workflow actions.

### V0.6 — Tournament with frozen conditions (orchestration implemented)

- A versioned JSON candidate registry names endpoints/models through environment
  variable references. Arbitrary embedded credentials are rejected.
- Live runs require an explicit `--live` flag; fixture runs require `--fixture`.
  These modes cannot be mixed in a tournament.
- All endpoint settings and expected call counts are checked **before** any
  remote model call. Global attempted-call and wall-time ceilings include
  preflight requests, memory-enabled runs, and no-memory ablations.
- Two non-overlapping seeded cohorts, pilot and holdout, exercise the same
  fixed simulator for each candidate. Their conditions are hashed and recorded.
- Each candidate receives a chat protocol preflight, then is scored on fictional
  net contribution, on-time completion and prediction calibration. Mean paired
  differences appear only if every candidate completed its assigned trials.
- Errors are recorded by type/stage without dumping credentials or remote
  response bodies. Failed or missing endpoints prevent model promotion and
  make the CLI exit unsuccessfully.
- Inference duration and call counts are recorded. Actual token consumption,
  cost per call, model identity attestation, and statistically powered CIs
  remain future work.
- In the available workspace **no live Qwen endpoint exists**. The model
  tournament's 66-call fixture validation is real program execution, but its
  answers are scripted. The live preflight made **zero** inference calls and
  returned `blocked_configuration`.

### V1 — Real language-model scientist (next)

- Actually verify Qwen or a comparable model by a real inference request.
- Structured `hypothesis`, `confidence`, `prediction`, and `experiment` outputs.
- Validate predictions **before** observations are revealed; reject malformed
  statements and record unsuccessful calls.
- Compare against a strong conventional model-based solver, a random baseline,
  and ablations (no memory, no active experiment selection).
- Separate goal discovery from trained-model weight modification.

### V2 — Safe meta-learning and causal memory

- Qwen proposes modifications to an allowlisted strategy DSL.
- Population/lineage archive, novelty search, memory retrieval, and forgetting
  studies; persistent evidence tied to its source and experiment version.
- Independent, read-only holdout service and tamper-evident record ledger.
- Predefined resource ceilings and asynchronous checkpoint/resume.

### V3 — Curriculum evolution and multiple worlds

- Generate distinct worlds: structural causal models, partial observability,
  stochastic dynamics, delayed rewards, agents, economies, and tool-use tasks.
- Independent world validators and adversarial OOD suites.
- Track useful skill transfer rather than only performance on procedurally
  generated tests. Evaluate whether strategy innovation rate plateaus.

### V4 — Verifiable external invention

- Opt-in, permissioned sandbox tasks: software optimization, proof checking,
  engineering design and computational science.
- Independent benchmark and human review before any real-world application.
- Graduated promotions with rollback. Any external writes or expenses require
  explicit authorization and a resource ceiling.

## What would make Genesis genuinely new?

Not merely adding more agents or a new dashboard. A credible advance would be
demonstrating that **an automatically generated improvement to learning
strategy transfers to previously unseen classes of problems**, and that the
system can repeatedly generate such improvements while respecting its fixed
evidence rules. The key research contribution would be a reproducible method
for detecting and preserving *general* improvements, including when the system
should reject its own apparently successful discoveries.

## Current limitations and open questions

- Only 12 hand-defined genomes are searchable, not new algorithms or weights.
- Current causal families are tiny, structured, noiseless, and known to the
  programmer (not the learner). Near-perfect scores are expected in-family.
- Deterministic experimental design chooses actions before seeing outcomes;
  later work should study adaptive interventions and exploration cost.
- First provenance-backed scientific policy memory is present, but there is no
  general episodic causal memory, cryptographically protected external judge,
  or separately permissioned evaluator process yet.
- Qwen transport and the first model policy loop are coded, but a live endpoint
  was not available for a smoke test; an interface fixture is not Qwen inference.
- No claim of emergence, self-awareness, recursive weight improvement, or AGI.

## Relationship to TradeFlow

AION remains **a separate research package**. TradeFlow's Qwen runtime, if
accessible, can be used through a configurable inference endpoint without
sharing tenant data, mutable code, permissions or production workflows.
Only independently validated, permissioned components should ever be proposed
for integration into a business product.
