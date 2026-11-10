# AION Causal Discovery Lab — V0 (standalone)

**Status:** independent research prototype; no production service, business data, autonomous actions or persistent learning store.

AION reuses TradeFlow's *design pattern* for a private local model inference endpoint (llama.cpp/OpenAI-compatible or Ollama native), but **does not import TradeFlow code**. It can be copied out of this repository and run independently using Node.js 20+ with zero npm dependencies.

## Run

```sh
cd research/aion
npm test
npm run benchmark:oracle        # synthetic deterministic control; NOT a Qwen test
npm run probe                   # real local Qwen readiness + JSON response; fails closed
npm run benchmark:qwen          # real model proposals; NO mock fallback
```

For **llama.cpp**, the default server is `http://127.0.0.1:8088`, using `/health` and `/v1/chat/completions`. For **Ollama**, set `AION_MODEL_RUNTIME=ollama`, `AION_MODEL_URL=http://127.0.0.1:11434` and `AION_MODEL_ID=qwen3:0.6b`: the adapter uses `/api/version` and `/api/chat`, requesting `think:false` and structured JSON. Both providers are restricted to loopback HTTP. A port returning a health check is insufficient: `probe` requires a genuine completed model response in valid JSON.

**Phone-first GitHub Actions benchmark:** the isolated `.github/workflows/aion-qwen-research.yml` workflow starts an ephemeral CPU-only Ollama runner, downloads the independent public Qwen3-0.6B model and runs the suite automatically on a research PR. Its results are in the GitHub Actions run, including a short summary and synthetic benchmark artifact. This is a **real Qwen experiment**, but it does **not verify the user's original llama.cpp Codespace model or its weights**; those require separate runtime access. The workflow does not share production credentials or app records.

If Qwen is not loaded, in the Codespace first run the existing TradeFlow `node scripts/diagnose-local-qwen.cjs`, verify installed GGUF weights, RAM and llama.cpp logs, then independently run `npm run probe` inside `research/aion`. **Do not automatically download models or publish port 8088.** A historical Qwen3-0.6B Q8_0 is documented, not validated as currently active.

## Experimental design

Three held-out 3-switch Boolean mechanisms (AND/OR/XOR) with different input pairs are evaluated. Each world has an initial rule, then an undisclosed rule change. The experimental controller chooses binary switch interventions maximizing disagreement among causal candidate hypotheses. The model receives observations and its previous hypothesis, proposes a structured mechanism, then receives additional evidence. Truth-table predictive accuracy is scored over all eight inputs; this is a controlled toy-domain measure, **not proof of general causal discovery**. The independent oracle candidate-elimination baseline is explicitly labelled `realModelInference: false`. Unknown model completions or invalid JSON fail, rather than silently substituting the oracle. There is no cross-phase leakage of new ground truth into the prompt.

The benchmark records predictions, revisions, whether the hypothesis fits observed evidence, and the number of model calls. The optional `AION_REPAIR_MODE=feedback` adds up to two bounded retries if the proposed rule contradicts **observations the agent has already seen**. It shows the model its own counterexamples, but never reveals the hidden true rule and never silently substitutes the deterministic oracle. GitHub Actions runs both raw and feedback-repair variants under the same toy scenarios and archives their separate JSON traces. Extra model calls are counted; a comparison of success at higher inference cost is not free improvement.

The benchmark records predictions, revisions, and whether the hypothesis fits observed evidence. A model can score well at prediction without identifying the unique true mechanism; the report is a small baseline only. The model is restricted to the fixed DSL; the initial experiment does not assess invention of new variables or genuinely open-ended scientific discovery.

**Research gate before persistent memory:** (1) a real Qwen probe succeeds; (2) benchmark run is labelled `realModelInference: true`; (3) >=0.85 mean truth-table accuracy and >=0.90 consistency across this toy benchmark; (4) reproduce at least three clean independent runs, archive the exact model/runtime version and evaluation outputs, expand to unseen held-out mechanism families, and compare with fixed-prompt and deterministic baselines. The first three checks are necessary smoke criteria, not sufficient evidence of a research breakthrough. **No persistent causal memory has been implemented yet.**

## Boundaries

- No credentials or business records are sent to the model. Input is synthetic 0/1 data.
- No production endpoint, deployment, app module import, model weight mutation, fine-tuning or live automation.
- The evaluator holds hidden rules and must not be passed into the model context.
- Qwen text outputs are untrusted. They are parsed into a strictly validated DSL, never executed.
- Production TradeFlow files are unchanged; the research branch remains unmerged.

## Research gates added (controller only)

Run `npm run research:gates` to produce a deterministic, auditable JSON report covering all 9 three-switch and 18 four-switch pairwise Boolean mechanisms. Compares information-gain intervention selection against fixed-order and seeded random experiments. Separately tests detection and re-identification across all 72 ordered changes between the 3-switch rules. This gate **does not call Qwen** and expressly marks `realModelInference: false`. It establishes that the **experimental controller** works on a larger held-out switch set, not that Qwen has generalized or the system has learned a novel operator. The agent is not given the hidden true rule during proposal, but the evaluator naturally knows it for outcome generation and scoring. No persistent memory is created.

**Follow-up model gate:** run Qwen on withheld four-switch worlds (with all switch names presented as available inputs), compare raw/feedback results against the deterministic oracle under equal experiment budgets and record real CPU inference cost. Do not promote causal rules into durable memory from these deterministic-only gates.
