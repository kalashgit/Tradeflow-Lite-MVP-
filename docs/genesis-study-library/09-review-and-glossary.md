# 09 — Revision curriculum, knowledge checks and condensed glossary

**Goal:** learn deeply enough to apply, not merely recognize terms when rereading notes. This is an original integrated curriculum using the prior modules and their linked primary sources.

## 1. Five-pass learning method

**Pass 1 — Orientation:** read each module's title, core assumptions, equations, exercises and output artifact. Identify terms you cannot explain.

**Pass 2 — Feynman explanation:** close the page and explain a concept in two minutes, using a concrete electrician/contractor case. If you resort to vague jargon, return to the source.

**Pass 3 — Hand-worked example:** compute a posterior, compare expected costs, trace a transaction conflict, or manually build a plan with prerequisites.

**Pass 4 — Prototype:** implement a minimal test in a notebook or isolated local project; do not integrate unverified experiments into production.

**Pass 5 — Retest:** revisit after 1 day, 3 days, 7 days and 21 days with questions randomized. Mark mistakes by type: missing concept, math error, mistaken assumption, wrong system design or false confidence.

These are suggested intervals, not a claim of optimal human learning cadence for every reader.

## 2. Reading order for the Genesis goal

1. **02 Foundation models and evaluation** — understand what an AI application must prove.
2. **03 Memory and retrieval** — separate persistent facts from conversational context.
3. **04 Data-intensive systems** — protect truth under updates and failures.
4. **01 Intelligence and planning** — represent goals, uncertainty and actions.
5. **08 Benchmark** — convert ideas into measurable experiments.
6. **05 Reinforcement learning** — understand sequential decisions and causal pitfalls.
7. **07 Practical ML systems** — learn model/data pipelines.
8. **06 Deep learning** — study underlying optimization and representations.
9. Use the official books as deeper reference when a concept needs proofs or examples.

## 3. Minimum competencies

**Data:** entity keys, SQL joins, transactions, isolation levels, event-sourcing tradeoffs, temporal facts, schema migrations, access control.

**ML:** train/validation/test, leakage, generalization, calibration, imbalanced metrics, distribution shift, baselines, confidence intervals.

**AI agents:** state, action, precondition, plan, uncertainty, tool permissions, verification, task success versus fluent outputs.

**LLM engineering:** tokens, context construction, retrieval, reranking, prompt injection, structured outputs, evaluation, cost, routing.

**Learning:** MDPs, expected return, Bellman relations, exploration/exploitation, counterfactual uncertainty, safe offline evaluation.

**Deep learning:** vectors, matrices, gradients, chain rule, cross-entropy, overfitting, neural representations, attention, parameter adaptation.

## 4. Glossary: precise working definitions

- **Agent:** system that selects actions based on observations and goals, potentially changing its environment.
- **Action precondition:** requirement that must hold before an operation is valid.
- **Belief state:** representation of uncertainty about the environment.
- **Grounding:** tying a claim to relevant evidence; still requires judging evidence reliability.
- **Evidence provenance:** origin, scope, time and transformation history of a record.
- **RAG:** retrieving external information and supplying it to generation.
- **Embedding:** numeric vector representing learned properties of content.
- **Reranking:** reordering retrieved candidates according to additional relevance criteria.
- **Prompt injection:** untrusted content attempting to override instructions or tool policies.
- **Tool schema:** a typed contract specifying valid inputs and outputs.
- **Idempotency:** repeated invocation has the same intended effect as one invocation.
- **Transaction:** grouped operations with specified atomicity and isolation guarantees.
- **Event sourcing:** storing state changes as events and deriving current state by projection.
- **Temporal data:** records incorporating when facts apply and/or when they were observed.
- **Consistency:** guarantees about which writes a reader can observe.
- **Calibration:** agreement between reported probabilities and observed frequencies.
- **Drift:** changes in data or behavior distribution over time.
- **Data leakage:** information unavailable at prediction time contaminates training or evaluation.
- **Generalization:** performance on new cases outside the training examples.
- **MDP:** Markov decision process, a mathematical model of sequential decisions.
- **Reward:** scalar training/evaluation signal; never assume it equals actual human benefit.
- **Policy:** rule or distribution mapping states to actions.
- **Value function:** expected return from a state under a policy.
- **TD error:** difference between observed reward plus bootstrapped future value and current estimate.
- **Counterfactual:** outcome that would have happened under an action not actually taken; usually unobserved.
- **Fine-tuning:** adapting model parameters using further training.
- **LoRA:** low-rank weight adaptation that changes relatively few trainable parameters.
- **Ablation:** remove a component to measure its contribution.
- **Held-out test:** evaluation cases reserved from model/prompt development.
- **Shadow mode:** model runs and logs suggested actions but does not affect live operations.
- **Approval gate:** verified human or policy authorization needed before a consequential action.
- **Reproducibility:** ability to recreate data, configuration, code and results sufficiently to audit an experiment.

## 5. Oral examination — 30 questions

### Foundations
1. Why can a model with a much larger context window be less accurate than a filtered retrieval system?
2. Draw a PEAS specification for an estimator assistant.
3. Explain breadth-first versus uniform-cost versus A* search.
4. When is asking a vendor for updated information the best next action?
5. What is the difference between a belief and a fact?

### Memory and data
6. Why can vector similarity choose an incorrect invoice record?
7. Distinguish an event, a projection and a derived feature.
8. What does "as known on Monday" mean?
9. Describe a lost-update failure and a mitigation.
10. How do idempotency keys help with a timeout?
11. Explain why an authenticated record can still be stale.
12. How does the agent protect tenant isolation before retrieval?
13. What must a decision audit trail record?
14. When should you delete memory rather than add more?
15. What does a safe recovery from an ambiguous external write look like?

### ML and models
16. Why is 98% accuracy potentially useless?
17. Explain training/validation/test separation with a temporal example.
18. What's the difference between a predicted probability and a confident sentence?
19. Derive a scalar gradient for `(wx-y)^2`.
20. Why do nonlinear activations matter?
21. Why are Transformer attention and persistent memory different?
22. When would you choose LoRA over RAG?
23. How would you detect model drift without instantly retraining?

### RL and evaluations
24. Define state, action, transition, reward and discounting.
25. Why is offline reward data confounded?
26. What does Bellman bootstrapping mean intuitively?
27. How can an agent game a reward metric?
28. What can a contextual bandit do that a full RL agent may be unnecessary for?
29. What experiment would show episodic memory truly helps?
30. What safety failure must reject a release even if mean task score rose?

## 6. Practical exercises to repeat

**Level A (30–60 min):** manually score 10 case traces, identifying unsupported claims and stale sources.

**Level B (1–2 h):** implement a tiny temporal fact store; answer current and historical queries correctly.

**Level C (2–4 h):** build tool-call verification with idempotent retries and fault injection.

**Level D (half-day project):** compare three retrieval techniques on 50 synthetic cases and plot task success, grounding and cost.

**Level E (multi-day research):** run the 100-case benchmark and ablate memory components; write a causal hypothesis and report uncertainty.

## 7. Weekly engineering research log template

```markdown
# Week [number]
Question:
Hypothesis:
Baseline:
One change:
Test cases and frozen dataset:
Results (numbers; no placeholders):
Regression and safety results:
Interpretation:
Decision: keep / revert / more evidence
What I still don't understand:
Next experiment:
```

## 8. Signs of genuine mastery

You can explain why an architecture is appropriate **and** when it should not be used. You can turn a broad claim ("more intelligent memory") into an operational metric. You can distinguish known, inferred and unknown. And you can show an empirical improvement that another engineer can reproduce.

**Final reading advice:** reread less by default; repeatedly test explanations and working code. When a mistake persists, return to the exact official chapter or source referenced by the appropriate module.
