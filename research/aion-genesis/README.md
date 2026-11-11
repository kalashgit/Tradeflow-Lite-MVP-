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


## Cost-based repair decision — real evidence

On 2026-11-10 the six-world real Qwen3-0.6B repetition used 34 model calls rather than the earlier 17, yet generated **zero** accepted novel ASTs and yielded unchanged mean unseen accuracy of 50%. The 34 rejection events were all valid but contradicted observations; JSON grammar was not the limiting factor. Consequently the **default invention attempt budget is now one**, while explicitly configured two/three-call repair remains available solely for controlled experiments. The novel live-Qwen workflow was returned to manual-only dispatch to prevent unapproved repeated CPU runner usage. Research-quality gate and long-term knowledge admission remain blocked.


## Adaptive mechanism induction (experiment efficiency)

The new `adaptive_synthesis.py` method first tries the prior small symbolic grammar. Only when all its rules are contradicted by experimental observations does it progressively widen to a bounded, CPU-only composition grammar. This is **generic enumeration of approved Boolean AST operations** (signed literals, logical n-ary clauses, thresholds, and nested two-clause compositions)—not an explicit list of target mechanism families. Equivalent programs are deduplicated by full Boolean truth-table signature, using only public variable names; no hidden environment rule or hidden outputs enter candidate generation. Each new intervention is selected to split a complexity-weighted set of surviving explanations. The interpreter still validates every candidate and allows no arbitrary Python execution.

A matched-pair benchmark uses 24 unseen-composition worlds under 3 different seeds (72 paired cases) and the same intervention budgets: 7 for three-switch worlds, 12 for four-switch worlds. It reports held-out predictive accuracy, full accuracy, first stable exact prediction, accuracy after 3 and 5 interventions, and CPU time. The original fixed-grammar, no-LLM baseline is kept as control. The exact per-world report is archived as a GitHub Actions artifact. A percentage change may reflect better search **inside this known DSL**; it is not equivalent to neural-weight learning, unseen-operator invention, or general scientific competence. No Qwen calls or memory writes are needed for the new controller benchmark.


## Promotion of the adaptive method to the active hybrid

The tested progressive synthesis method is now the default in `HybridProposer`: start with known fixed mechanisms, expand into generic bounded AST combinations only after evidence falsifies the known grammar, and call Qwen only when **no** candidate in the expanded grammar can explain observations. The previous `symbolic_strategy='fixed'` mode remains for historical controls and explicit Qwen-invention studies. It can still handle mechanisms outside the expanded DSL; proposed Qwen ASTs must pass all observed evidence. The main AION scientific benchmark now reports how many composition expansions occurred separately from actual LLM inference. No enduring knowledge is written, and Qwen model weights remain untouched.


## Regression gate: preserve the actual discovery improvement

GitHub CI now runs two separately seeded, matched 72-world evaluations (development and validation). The deterministic research-performance gate blocks regressions if unseen predictive accuracy drops below 68%, full-truth-table accuracy below 94%, the advantage over the unchanged legacy method below 30 percentage points, any paired world's unseen accuracy becomes worse, or mean CPU time exceeds 3x the fixed-search baseline. It also requires at least 18 worlds to have reached stable exact predictions within five interventions, equivalent per-world experiment budgets, and zero LLM calls. This gate protects **synthetic DSL search improvements only**. It explicitly does NOT authorize persistent causal knowledge, claim a trained model learned, or establish general open-world science.

Boundary-probe research ablations are optional and off by default. Unconditional all-on or two-corner interventions performed worse on the development dataset than the balanced information-gain policy; a conditional rare-event probe produced no improvement. Consequently **balanced active planning remains the deployed research default** until separately validated changes beat it.

## AION × TradeFlow — synthetic owner operating twin

The module reuses the three SYNTHETIC TradeFlow simulator businesses (5, 12 and 20 electrical-contracting employees) from automation/simulator/businesses.v1.json. The Python package validates the fiction marker and business IDs; it refuses an ordinary real tenant. No real customer personal data or business records are read.

The contractor_twin module exposes seven simulated daily snapshots, containing owner utterance transcripts, fictional operational records, and evolving signals across finance, delivery, sales, workforce, suppliers, safety, growth and customer experience. A synthetic owner's spoken cash claim remains owner_spoken_unverified and cannot become an authenticated bank balance. The typed text transcript is pre-labeled by the simulator: THERE IS NO microphone, ASR, live speech comprehension, Qwen inference, TradeFlow app integration or external connector call.

The owner_advisor module supplies three matched policy arms: reactive questions, proactive static triage, and proactive triage with lightweight session-only score calibration from earlier simulated outcomes. Recommendations are capped to protect owner attention and always require human approval. The simulated owner can hypothetically approve them to measure outcomes, but none triggers an actual payment, customer message, calendar write, employment action or other real-world effect.

The business_trial module compares policies on matched companies across eight development seeds and eight independent validation seeds. It reports domain coverage, fictional utility points after owner approval, interruption costs, false or ungrounded actions and changes in effectiveness. UTILITY POINTS ARE FICTIONAL ASSUMPTIONS, NOT DOLLARS SAVED OR MEASURED BUSINESS ROI. The comparison tests a synthetic workflow, not proven real-world owner assistance.

Run optionally: python -m aion_genesis.business_trial --output synthetic-business-report.json. CI runs the experiment and archives sample seven-day transcripts. Results NEVER authorize persistent causal-memory admission or production deployment.

Next research gate: feed these same transcripts through a source-pinned, read-only TradeFlow conversation adapter inside a synthetic sandbox. Validate record provenance, clarifying questions, safe action proposals and counterfactual utility before authenticating or integrating with real tenants. Test microphone and voice workflows separately with explicit consent.

## Real-model owner conversation boundary

The optional owner_model module connects ONLY to a loopback Ollama runtime. It takes exactly labeled fictional owner transcript claims and synthetic company signals, then asks Qwen to choose 0-2 action IDs and 0-2 verification question codes using a strict JSON Schema. All action IDs must match the current evidence allowlist. The model cannot author financial facts, invent evidence references, write to any app system, or call tools. AION renders the final owner recommendations from trusted templates and uses deterministic fallback if model output is unsupported. Prompt-injection tests verify that a request to wire money cannot escape the read-only recommendation boundary.

The owner_model_probe executes nine actual inference requests across three fictional businesses and three owner turns each, with zero simulated approvals and zero external execution. GitHub archives token counts, model selection successes/fallbacks and exact synthetic dialogue traces. This is a **real local language model with simulated business input**, not real-time speech, business reasoning accuracy, actual customer actions or autonomous optimization. Its next step is to compare coherent multi-step business decisions and counterfactual planning against source-pinned TradeFlow read-only workflows.

## Verified synthetic business and real-Qwen research checkpoint (2026-11-10)

**Business simulation:** 48 matched synthetic episodes (three original TradeFlow fictional contractors across sixteen independent seeds, seven simulated days each). The proactive static policy scored 85.792 vs reactive 78.625 mean fictional utility points on development episodes and 79.333 vs 72.417 on independent validation episodes. All unsafe-action counts were zero. The adaptive domain-feedback policy TIED static proactive exactly; no adaptation advantage has yet been demonstrated. Utility is arbitrary output of the artificial simulator, not actual dollar savings or a credible estimate of real owner outcomes.

**Local owner conversation:** Real Qwen3-0.6B accepted four of nine schema-grounded synthetic action selections and needed five deterministic fallbacks ([run 42815266448](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42815266448)). Real Qwen3-1.7B, using identical schema and nine owner transcripts, accepted three of nine and needed six fallbacks ([run 42815683587](https://github.com/kalashgit/Tradeflow-Lite-MVP-/actions/runs/42815683587)). Both showed zero unsafe delivered cards or any external execution. Model size alone did NOT help in this narrow trial. These are small nine-turn tests and do not settle model quality generally.

**Resource control:** The Ollama research workflow is now manual dispatch only with 0.6B and 1.7B selectable after the workflow becomes eligible for dispatch. Automatic CPU model installs are disabled on each research edit. The standard Python test/business simulation workflow still runs with zero Qwen calls. No customer data, live audio, authenticated tenant actions, external communication, or persistent causal promotion.

**Next experiment:** Improve the owner's longitudinal interview and explicit evidence graph, distinguish facts from unverified claims, compare proposed decisions on counterfactual business outcomes, then test a real authenticated read-only TradeFlow adapter in isolation only after permission and source verification. Human review remains necessary for any real actions.


## AION → Existing TradeFlow application commands (simulation bridge)

A new Node bridge inside `research/aion-genesis/bridge/` consumes **the Python AION synthetic owner-advisor signal and evidence contract** and maps its allowlisted recommendations onto the **real, existing** `public/command-registry.js` command IDs. This is an isolated application runtime invocation, not a second command framework or a production deployment. Its host uses TradeFlow's existing in-memory IndexedDB-compatible test database and actual `core-integration.js` operation logic over the existing fictional contractors.

The bridge can execute **read-only intelligence reviews, workspace navigation, and view filtering** without approvals. For operational changes such as scheduling a follow-up on an overdue invoice, it can **prepare** an existing TradeFlow command, but cannot call the command writer until a separately trusted owner UI approval callback succeeds. The existing TradeFlow runtime then independently revalidates permission, actor, record freshness, approval binding and operation receipts. AION supplies only a selected signal ID; it cannot supply arbitrary write commands, record references, business IDs, monetary amounts, or approval tokens. Absent an explicit owner gesture, no task is created. A gesture can create only a **synthetic internal task** within the test database; never a sent email, payment, calendar change, or a real business action.

GitHub CI now exports all 21 seven-day company snapshots plus the actual AION proposals, then invokes the existing TradeFlow JS command runtime in focused Node tests. Tests cover synthetic invoice task creation after approval, denied and stale approvals, app permissions, replay, forged references, calendar filtering and read-only reviews. This is groundwork toward future authenticated host-side capability integration; it does not connect live tenant apps, run background jobs, or acquire voice input.


## Adaptive Strategic Intuition Layer (ASIL) — experimental research

An isolated, non-production Python research component (aion_genesis/strategic_intuition.py) operationalizes the concept of fingertip feel without claiming that an LLM has developed intuition. A transient strategy bank learns canonical executable mechanisms from three independently labeled, fully observed training worlds per context and is frozen before evaluation. Context labels can be deceptive: a superficially familiar situation may hide a rule differing in exactly one input. Separately seeded calibration worlds estimate the empirical probability that a remembered strategy is exactly correct after two diagnostic interventions. A one-sided binomial lower bound blocks the fast path unless it has enough calibration evidence.

The policy chooses between a fast memory route (two new diagnostic interventions, then reuse) and a deeper bounded compositional search (up to five interventions). If context is unknown, calibration insufficient, or a diagnostic falsifies the stored strategy, it chooses deeper investigation. It never reads the hidden world mechanism or future outcomes to decide; only the separate evaluator sees true held-out outputs. Additional modes are deep-only and naive memory-only controls.

The GitHub research workflow measures, on separate development and untouched validation random seeds: exact whole-mechanism correctness, unseen-state prediction accuracy, average actual intervention count, an explicit hypothesis-check computation proxy, observed Python latency, fast-route proportion, false-familiarity errors and confidence calibration (Brier and ECE). A 70% unseen rule-change stress distribution tests whether learned calibration is trustworthy under severe distribution shift; it must be reported even if the new policy performs badly.

Cautions: this is a bounded, noiseless three-variable Boolean research toy; no real Qwen inference, model-weight adaptation, physical neural membrane, persistent memory writes, or autonomous actions. The strategy bank sees complete synthetic training outcomes and the calibrator sees private calibration-world labels, but never evaluation-world labels. A successful fast path demonstrates conditional reuse and adaptive compute allocation, not general metacognition or intelligence. No production TradeFlow files or tenant data are touched.


### Experimental differential strategy composition and drift monitor

An optional prequential mismatch-rate monitor uses ONLY outcomes observed during the current stream, comparing recent diagnostic contradiction frequencies against separately calibrated frequencies. Under drift alarm, the candidate routes to deeper investigation; it never inspects hidden test labels or promotes learned causal rules. A separate experimental gated_residual mode retains a verified prior strategy and composes small state-specific residual corrections only where actual observations contradict it. At most two localized exceptions are represented; larger disagreement falls back to ordinary deep synthesis. These residual patches are provisional, explicitly tested on unseen states, and NOT added to durable memory. This is a generic strategy composition hypothesis but naturally favors local/sparse changes, and therefore needs an independent two-change stress gate as well as a one-change gate.

The monitor's observed false-familiarity reduction is not necessarily a net accuracy gain; a cold deep search can actually be less accurate on short-budget inputs than a useful but imperfect prior. Both predictive impact and diagnostic reliability must be reported, including unfavorable results. Do not deploy either experimental monitor or residual-repair policy merely because one metric improves.


### Generalization failure check — unrelated mechanism replacement

A third stress distribution replaces a remembered synthetic Boolean rule with a different whole mechanism that disagrees on at least three of eight possible inputs. This is deliberately NOT the sparse local-change generator used to develop residual repair. The experimental report must measure whether residual memory composition still helps, instead of promoting it based only on the benchmark it was optimized for. Passing cannot establish general-world competence; failing should cause controlled abstention or a better model-family mismatch detector, not hidden oracle correction.
