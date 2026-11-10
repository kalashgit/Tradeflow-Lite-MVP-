# AION Genesis V1 — Open-World Scientific Learning

A separate research-only Python laboratory for constructing executable explanations from new observations. This package does not change TradeFlow's application or perform any business actions.

## Implemented architecture

- Short-term: a bounded working-memory deque carries recent experiment results into the next reasoning step.
- Experience review: a bounded episode journal recognizes repeated candidate mechanisms across distinct worlds and flags contradictions. Recurrence is not verification.
- Scientific laboratory: 120 seeded synthetic worlds split into basic development mechanisms and withheld compound mechanisms (inhibited gates, majority, parity and nested logic).
- Safe program representation: JSON expression trees using var/not/and/or/xor/threshold, validated for shape and complexity; arbitrary generated Python is never executed.
- Causal interventions: compare candidate predictions under possible binary inputs and choose unseen experiments that maximize disagreement.
- Long-term: a versioned SQLite proof-of-concept supports promotion, disputes and revisions. Its default is disabled, and the active Scientist never writes persistent knowledge.
- Local Qwen: optional loopback-only Ollama interface. This initial CI milestone deliberately runs deterministic baseline proposers, not real Qwen inference.

The mechanism space is more expressive than the original AND/OR/XOR pair selection, but it remains a restricted language. Compound-mechanism identification is not yet proof of unrestricted open-world scientific invention.

## Why postpone LSTM training?

LSTM (Long Short-Term Memory) is a recurrent neural architecture with a learned internal cell state. That hidden state differs from a permanent evidence-backed memory. For small experiments, Python deques and an explicit evidence ledger are simpler to inspect, cheaper to run, and easier to retract when wrong.

An eventual LSTM competitor should be trained only after the synthetic data is sufficient. Benchmark it against no-memory, short-term-only, and review-plus-retrieval baselines at matched intervention and inference budgets. Evaluate held-out prediction, negative transfer, catastrophic forgetting, latency and CPU training costs. Do not assume a neural layer improves performance without such evidence.

## Run offline

    cd research/aion-genesis
    python -m unittest discover -s tests -v
    python -m aion_genesis.demo

The demo evaluates 120 seeded worlds using two deterministic baselines with different program grammars. It is not a real-Qwen result and does not authorize long-term memory promotion.

## Next gate

Run real Qwen AST proposals against held-out compound rules using the existing phone-first GitHub runner pattern. Compare genuine Qwen outputs to fixed program-search baselines. Measure new-mechanism accuracy, contradiction rate, independent-world transfer, token and model-call costs. Do not enable knowledge admission until separately reproduced >85% accuracy and >90% evidence consistency, plus independent review.

No GPU or paid API is required for the current Python tests. No background jobs, external connections, customer data or model downloads are triggered by this package.


## Paired provisional-memory ablation

A bounded in-RAM casebook is trained only on development-world observations, using a deterministic reference proposer with a separate validation set of interventions. It needs independent support from at least two worlds, and retrieval rechecks the current world's evidence. It never stores or transfers a hidden rule or other worlds' raw observations. Candidate analogies remain provisional and are not promoted to long-term knowledge.

The benchmark compares the same researcher with and without retrieved proposals on identical held-out worlds and fixed intervention budgets. It reports mean final accuracy, observed evidence consistency, positive and negative transfer, Qwen calls, token usage when available, and the number of retrieved proposals. No neural-weight updates and no SQLite knowledge promotion occur.


## Stronger symbolic program-search baseline

The bounded synthesis baseline enumerates supported Boolean compositions (including inhibition, majority, parity and nested logic), deduplicates candidate mechanisms by complete truth-table semantics, and chooses interventions from the surviving hypothesis version space. It uses only observations to select an explanation. Because its grammar intentionally contains the simulator's withheld rule families, it is a **known-grammar control, not proof of open-ended discovery**. We compare it with Qwen to avoid paying inference costs for deterministic tasks. Unknown mechanisms outside the grammar must be reported as unsupported rather than silently guessed.

To avoid unnecessary CPU runner spending, the live Qwen experiment is available through manual GitHub Actions dispatch after the first paired baseline, while Python scientific controls continue running automatically on each research PR update.


## Symbolic-first hybrid and unknown-mechanism gate

An additional research package tests 24 seeded mechanisms deliberately absent from the fixed symbolic library (NAND, XNOR, multiplexers, three-input conjunctions, three-of-four thresholds and four-input parity). The mechanisms remain representable using the safe JSON AST language, but the known-grammar search cannot simply select them. A HybridProposer routes to the deterministic synthesis engine while evidence is explainable; only when no known candidate remains does it ask an optional inventor (e.g. local Qwen) for a new AST. Invented candidates must pass strict AST validation and match every observation before provisional short-term reuse. Invalid proposals are rejected without substituting the hidden answer. The test suite uses a scripted inventor to verify this control flow and does not claim real Qwen successfully invented the unknown rules.

This is an explicit distinction between *semantic search within known rules*, *composition of known primitives in new ways*, and *discovery of entirely new primitives*. A future real-model trial must validate proposals on interventions not used in drafting them. No memory writes are enabled.


## Live Qwen novel-composition experiment

A separate, CPU-only GitHub Actions research job starts Qwen3-0.6B through Ollama. It evaluates six novel synthetic worlds from the out-of-known-grammar gate. AION first uses deterministic program synthesis; if observed evidence eliminates the known grammar, a hybrid proposer escalates to real Qwen and accepts only safely parsed ASTs consistent with existing measurements. Additional withheld interventions are measured **after** the proposals are finalized, and never given back to the model. The JSON artifact records actual Qwen calls, admitted/rejected invented ASTs, independent unseen predictive accuracy and Ollama token counts. The model uses a finite-depth JSON Schema for output shape, followed by strict local AST verification. The code does not execute generated Python, store long-term knowledge, or modify model weights. Any positive result is only compositional invention within an approved DSL, not arbitrary open-world science.


## Diagnostic and bounded revision gate

The hybrid now labels incomplete generations, malformed JSON, invalid ASTs and proposals contradicted by actual observations separately. On escalation, Qwen may receive at most two inference requests by default (configuration hard limited to one through three) to repair its own rejected candidate. Feedback includes only the candidate and counterexample measurements from the current world, never the hidden law. The next real-model evaluation must compare accepted new ASTs, their unseen predictive accuracy and added call/token costs; unit tests alone do not establish improvement. To avoid unnecessary GitHub CPU minutes, the novel-model workflow is now manual-only in the Actions tab, while synthetic safety tests run automatically.
