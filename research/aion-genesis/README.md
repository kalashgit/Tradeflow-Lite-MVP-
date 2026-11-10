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
