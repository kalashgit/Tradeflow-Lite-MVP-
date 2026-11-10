# AION GENESIS — experimental core

A small, reproducible Python research harness for one question:

> Can an agent improve the *way it learns*, with evidence that generalizes beyond the environments on which it was selected?

This is **not** an AGI, a trained self-modifying neural network, a production agent,
or a claim of open-ended intelligence. Version 0.1 evolves three explicit reasoning
strategy settings. Version 0.2 adds adaptive recovery from hidden causal shifts.
Version 0.3 measures whether an evidence-backed experiment policy transfers
to an unfamiliar family of causal interactions.
Version 0.4 introduces **TradeFlow World V1**, a fully synthetic electrical
contractor environment for testing whether these methods have practical value.
Version 0.5 wires an optional **model-agnostic LLM decision agent** into the
business simulator, with strict JSON action validation, pre-outcome predictions,
bounded short-term recall, observational long-term counts, paired baselines,
and a no-memory ablation. No live Qwen endpoint was configured for this release.
Version 0.6 adds a **controlled model tournament**: an explicit model registry,
preflight checks, global call/time ceilings, locked pilot and holdout cohorts,
memory ablations, measured inference time, and failure-visible reports.
Version 0.6.1 adds a **single-model live Qwen runner** for CPU-only GitHub
Actions. The new runner has local-only Ollama access, structured outputs, a
preflight, and a predeclared two-cohort memory ablation. It is not a completed
live experiment until its GitHub Actions evidence artifact exists.

## Run real Qwen without a persistent Codespace

The manual-only `.github/workflows/aion-v06-qwen-live.yml` workflow is intended
for the *separate research branch* in TradeFlow. On that branch, the same
definition is also published at the **already registered**
`.github/workflows/aion-genesis-live.yml` path. From the GitHub Actions page,
select **AION Genesis — Live Qwen Memory Transfer** and the
`research/aion-v06-qwen-bridge` branch. Do not select the older V1 research
branch if you intend to execute this v0.6 experiment. GitHub requires a
manually dispatched workflow to be registered on the default branch; a new
workflow path that exists only on a feature branch will not appear by itself.

The selected workflow starts a local Ollama
server on a temporary Ubuntu runner, downloads `qwen3:0.6b`, runs the tests,
and performs 33 attempted inferences at most for the planned experiment
(1 preflight plus 8 jobs x 2 memory conditions x 2 cohorts). A 40-attempt
hard ceiling and 1,100-second experiment limit are in place. It uploads the
JSON evidence even when the experiment fails. This costs GitHub Actions
runner time and model download bandwidth, not a hosted-model API fee.

The command on an already prepared local Ollama server is:

```bash
python -m aion_genesis.live_ablation --model qwen3:0.6b \
  --jobs 8 --shift-at 3 --max-total-calls 40 --max-wall-seconds 1100 \
  --output aion-v06-qwen-evidence.json
```

The report never automatically admits persistent causal memory. A single
successful run is not proof of learning. This study probes **short-lived prompt
memory**, not a newly trained model. The existing TradeFlow AION Genesis V1
Qwen memory-transfer experiment is an important earlier independent baseline;
its metrics must not be represented as v0.6.1 experiment results.

## What exists today

- **Hidden causal worlds:** four binary interventions; linear and pairwise effects.
- **Observe → hypothesize → revise:** regression hypotheses update after 4, 8,
  and 12 observations, judged on four never-observed interventions.
- **Evolutionary selection:** hypothesis family, experimental design, and prior
  strength evolve across a pool of candidate learners.
- **Independent holdout:** development worlds select a champion; a different
  seed range estimates generalization only after selection.
- **Out-of-distribution control:** harder worlds introduce a cubic interaction
  that neither available hypothesis family can explain. Failure is visible.
- **Qwen inference seam:** independently configurable OpenAI-compatible chat
  adapter, suitable for Ollama or a compatible hosted endpoint. The benchmark
  itself **does not use Qwen yet**.
- **No model weights changed. No autonomous shell/code editing.**
- **Adaptive causal recovery (v0.2):** detection of surprising observations,
  evaluation of four candidate three-way interactions, 16-sample training and
  16-sample validation gates, and an independently scored recovery benchmark.
- **Mobile observatory:** self-contained HTML visualization of a real seeded
  simulation, showing causal change, detection, promotion, and error trajectories.
- **Transferable scientific memory (v0.3):** a source cohort selects an efficient
  experiment strategy from two allowed choices; a SQLite evidence ledger stores
  that validated principle; frozen-policy tests compare recovery efficiency on
  previously unseen four-way interactions, plus XOR rejection controls.
- **TradeFlow World V1 (v0.4):** generated job orders, hidden supplier reliability,
  crew capacity risk, simulated decisions, financial outcomes, and a mid-episode
  supplier change. Four comparison policies, including a CUSUM change detector,
  run on the same jobs and shocks without any production integrations.
- **Model Lab (v0.5):** a configurable LLM may propose its own supplier/crew
  choice, delay predictions, and a short operational hypothesis. The harness
  reveals the next consequence only after recording the predictions. It logs
  a Brier calibration score and matches the outcome to conventional baselines.
  An optional paired no-memory run isolates the value of in-context evidence.
  A clearly labeled deterministic fixture validates the wiring without an LLM.
- **Model tournament (v0.6):** compare two to six configured endpoints under
  an immutable seeded plan. The tournament validates every endpoint configuration
  before making paid calls, checks preflight responses, logs failures and
  attempted calls, and refuses to declare a winner on incomplete evidence.
  Scripted fixture tournaments remain distinctly labeled as **not AI inference**.

## Run the working experiment

Python 3.10+; no third-party runtime dependencies required.

```bash
python -m unittest discover -s tests -v
python -m aion_genesis.cli benchmark --output reports/first_run.json
python -m aion_genesis.cli investigate --world-seed 7
python -m aion_genesis.cli recover --seed 42 --output reports/recovery_run.json --html reports/recovery_dashboard.html
python -m aion_genesis.cli recovery-sweep --worlds 50 --output reports/recovery_sweep.json
python -m aion_genesis.cli transfer --memory reports/causal_memory.sqlite3 --output reports/transfer_study.json --html reports/transfer_dashboard.html
python -m aion_genesis.cli tradeflow-world --companies 50 --start-seed 100 --output reports/tradeflow_world_benchmark.json --html reports/tradeflow_world_dashboard.html
python -m aion_genesis.cli model-eval --fixture --ablate-memory --companies 3 --jobs 24 --shift-at 10 --max-calls 144 --output reports/model_fixture_benchmark.json --html reports/model_fixture_dashboard.html
python -m aion_genesis.cli tournament --config model_registry.fixture.json --fixture --ablate-memory --max-total-calls 66 --output reports/tournament_fixture_v06.json --html reports/tournament_fixture_v06.html
```

From the project folder, those commands generate a reproducible report and
an explicit hypothesis-revision trace.

## Verify the Qwen connection

Configure a running OpenAI-compatible Qwen endpoint. For a local Ollama
instance that already has a suitable Qwen model downloaded:

```bash
export AION_BASE_URL=http://127.0.0.1:11434/v1
export AION_MODEL=qwen3:4b
python -m aion_genesis.cli qwen-smoke
```

For a remote server, set `AION_BASE_URL` and, if required, `AION_API_KEY` in
your environment/secrets manager. Never put a token in chat or Git. The smoke
test sends a real chat-completion request and prints the returned text.

**The adapter has not been verified against the user's TradeFlow Qwen service.**
The testbed in this archive was deliberately built independently of TradeFlow.

### Run the real model experiment (only after smoke test succeeds)

The following is **20 potentially billed inference calls**. Nothing executes
outside the isolated simulation. The command has an explicit `--live` gate;
the harness never silently substitutes a fixture when a real endpoint fails.

```bash
python -m aion_genesis.cli model-eval --live --companies 1 --jobs 20 --shift-at 8 --max-calls 20 --output reports/qwen_trial.json --html reports/qwen_trial.html
```

To test whether remembering observations improves performance, add
`--ablate-memory` and set `--max-calls 40` (twice the calls/possible cost).
Use different, prespecified `--start-seed` values for development and final
holdout runs. `AION_MAX_COMPLETION_TOKENS` controls the per-call completion cap
(default 350), while `AION_TIMEOUT_SECONDS` defaults to 30.

To compare two actual model reports, use the same seeds, experimental conditions
and prompt protocol, then run:

```bash
python -m aion_genesis.cli compare-models reports/qwen_trial.json reports/other_model_trial.json --output reports/model_comparison.json
```

The comparator **rejects fixture reports** and mismatched cohorts, reports
paired per-company differences, and never automatically promotes a model.
It does not yet measure hosting cost, hardware, token usage or latency.

## Controlled v0.6 model tournament

The manifest `model_registry.example.json` contains two candidate IDs and the
**names of environment variables** for their model endpoint, model name, and
optional authentication token. It never contains real credentials. Replace the
example entries with your own endpoint profiles; preserve unique candidate IDs.

Only after both endpoints are configured and individually smoke-tested, run:

```bash
python -m aion_genesis.cli tournament \
  --config model_registry.example.json --live \
  --ablate-memory --pilot-companies 1 --holdout-companies 1 \
  --jobs 8 --shift-at 3 --max-total-calls 66 \
  --output reports/tournament_live_v06.json \
  --html reports/tournament_live_v06.html
```

This is an explicit authorization of **up to 66 potentially billed inference
attempts**, including two preflight checks. Each candidate receives the same
seeded fictional jobs and hidden shocks; its observational memory is reset for
each company. No prompts are modified between the pilot and the holdout. The
holdout starts at seed 9000, not used by the pilot (seed 300).

The command records a JSON report even when a candidate is blocked; it then
exits with a nonzero status for failed/incomplete tournaments. A tournament
cannot run unless all candidate endpoint and model environment variables exist.
Its results are descriptive, not an automatic promotion or proof of learning.
To inspect the full pipeline **without any model calls**, use the fixture command
above; its preflight responses are simulated and do not verify a provider.

**Actual environment assessment for this release:** this workspace exposes no
Qwen endpoint, Qwen inference process, local LLM runtime, or model credential.
Therefore the live tournament was deliberately stopped with zero inference
calls. The fixture passes validate orchestration, not a language model. The
mobile HTML dashboard is generated but may require browser review on a host
that permits Chromium.

**Do not interpret a model's written hypothesis as proven causal knowledge.**
The outputs are observational, the world is simplified, the model has no
weight updates, and 1–5 simulated companies have low statistical power.
Changing the prompt after seeing a test cohort invalidates it as a holdout.

## What the benchmark actually measures

There are 16 possible interventions in a four-binary-variable world. A learner
observes 12 and predicts the four it has never seen. Fitness is mean absolute
prediction error across 24 development worlds. After a champion is selected,
it is evaluated on a separate 24-world holdout and on 24 shifted worlds.

The original 12 possible genomes are just the product of:

| Gene | Options |
| --- | --- |
| Hypothesis class | linear, pairwise |
| Experimental design | random, information-seeking |
| Regularization | 0.000001, 0.01, 0.1 |

The standard world is pairwise, which is why a pairwise learner can achieve
almost zero error. That is an intentional *unit test for the scientific loop*,
not a demonstration of open-ended intelligence. The shifted world reveals
that the selected strategy can fail worse than the baseline when its assumptions
are invalid. This negative result is important.

## First evidence from seed 42

| Metric (lower is better) | Baseline | Selected strategy |
| --- | ---: | ---: |
| New worlds, same family (MAE) | 1.650319 | 0.000006 |
| Shifted worlds with cubic rule (MAE) | 2.506148 | 3.190086 |

See `reports/first_run.json` for the full experiment and generation history.

## Adaptive causal recovery v0.2: what the new experiment measures

The simulator begins with a pairwise world. At observation step 24 it adds one
hidden three-variable interaction. The location of the interaction varies by
seed, and the learner never receives it directly. Both learners receive the
exact same periodic sequence of interventions, with independent observation
noise (standard deviation 0.05). A surprising residual above 2.0 raises an
alert. The fixed baseline refits the original pairwise model, while the
adaptive learner evaluates a fixed menu of four cubic hypotheses.

After detection, the first 16 observations fit the candidate models and the
next 16 validate them. The adaptive model is promoted only if validation error
beats the pairwise model by at least 0.2 and falls below 0.4. The independent
evaluator computes true prediction error across all 16 interventions without
revealing that information to the learner.

In a prespecified 50-seed run:

| Metric | Result |
| --- | ---: |
| Hidden-change detection | 50/50 |
| Correct interaction recovered | 50/50 |
| Mean final adaptive MAE | 0.024779 |
| Mean final fixed-learner MAE | 0.875000 |
| Median detection delay | 4 observations |
| Median recovery time | 35 observations |
| False alarms in 50 unchanged controls | 0 |

This is a **positive engineering sanity check**, not evidence of general
intelligence. The cubic hypothesis family is predetermined; the world is tiny,
the shifts are large, and the sampling sequence visits all 16 states. More
adversarial, stochastic, unobserved, and previously unknown rule classes are
required before claiming broad generalization.

Open `reports/recovery_dashboard.html` in a browser for the standalone visual.

## Transfer learning v0.3: a deliberately limited meta-learning test

Source training: 16 worlds with hidden three-variable conjunction rules.
The system evaluates two hand-designed experiment policies:

- `full_factorial`: try all 16 configurations, then independently validate on
  a second 16 observations.
- `toggle_contrast`: compare an all-active reference state with each one-variable
  toggle, then validate on fresh contrast observations **and extra counterexamples**.

Source evidence selects the faster policy only if it passes a strict accuracy
gate. The selected policy and its provenance are stored in a local SQLite record
with a checksum. That record cannot be silently replaced on re-run.

The frozen, saved policy is then tested on 40 new **four-variable** conjunction
worlds, with a general-search learner as the comparator. Neither policy sees
the world's true hidden rule. They share the same hypothesis language, but
select different experiments. An additional 20 XOR worlds test whether the
transferred strategy incorrectly forces a conjunction explanation.

In the default seeded pilot:

| Metric | Memory-guided | Cold general search |
| --- | ---: | ---: |
| Recovered unknown four-way rule | 40/40 | 40/40 |
| Median post-alert interventions | 14 | 32 |
| Mean final prediction MAE | 0.031043 | 0.031432 |

The memory-guided strategy also withheld promotion in 20/20 XOR negative
controls. The XOR task was **not** solved; abstaining was the correct behavior.

This is evidence of transfer within a controlled family of Boolean causal
problems. The system *selects* a better policy from two programmer-designed
strategies; it has not invented its own learning algorithm or trained Qwen.
The task distribution is narrow, the shift magnitude large, and real-world
generalization remains unproven.

## TradeFlow World V1: a first realistic application domain

This is an **isolated synthetic plugin**, not TradeFlow production code and
not a faithful economic model of actual electrical contractors. All money
is fictional integer cents, all job and company records are generated locally,
and every action is restricted to two simulator decisions:

1. Choose an economy or priority supplier.
2. Choose normal or reserve crew coverage.

The simulator determines procurement/crew delays using hidden reliability
mechanisms. Economy-supplier reliability deteriorates after the 30th job.
It exposes consequences (delay evidence and net contribution) but never its
secret probabilities to decision policies. Competing policies receive matched
jobs and job-level random shocks to support paired comparisons.

Four policies are benchmarked: always-low-cost, static risk-aware, adaptive
Bayesian-style frequency estimates, and a drift-aware variant that accumulates
evidence of a regime change before re-estimating current supplier reliability.

Default 50-company cohort (seeds 100–149, 80 jobs per company):

| Policy | Mean simulated net contribution (credits) | On-time jobs |
| --- | ---: | ---: |
| Cost-first | 30,181.20 | 39.65% |
| Static risk rule | 32,941.40 | 59.92% |
| Adaptive frequency learner | 33,330.60 | 63.05% |
| Drift-aware adaptive learner | 33,463.90 | 65.05% |

The drift monitor detected all 50 planted supplier shifts after the change,
raised **zero** premature alarms, and raised one false alarm across 50 separate
unchanged businesses. In a second 50-company cohort (seeds 200–249), it found
all 50 shifts, with zero unchanged-world false alarms.

Important negative result: the static rule had slightly higher contribution
on **post-shift jobs alone**. The drift-aware policy led on total episode
contribution and on-time completion, but it has not demonstrated superiority
on every metric. The reward and policy assumptions were designed by us and
do not imply real customer outcomes.

The model-decision gate is now coded and tested with an explicit **non-LLM
fixture**, but not yet exercised against Qwen. Next is a real inference trial,
followed by prespecified unfamiliar companies and independent evidence reviews.

## Subsequent experiments, not yet implemented

1. Verify live inference on Qwen or another compatible model and run the coded
   comparison under a limited call budget and an independent holdout.
2. Compare different models under matched prompts, hardware, latency, cost,
   inference limits, and separate no-memory controls.
3. Extend experiments beyond simulated procurement to unseen world families.
4. Add a sandboxed, allowlisted strategy language (a DSL) that Qwen can modify.
5. Evaluate proposed improvements on a hidden suite before any promotion.
6. Introduce causal memory, replay, reproducibility, and failure clustering.
7. Only then investigate emergent curricula, population diversity, and
   generalization to external software and engineering tasks.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the long-term architecture and gates.
