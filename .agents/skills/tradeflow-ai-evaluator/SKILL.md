---
name: tradeflow-ai-evaluator
description: Benchmark and gate TradeFlow's local or hosted model providers, ASR, TTS, Qwen and evidence-backed intelligence. Activate for model selection, local inference failures, hallucination reduction, response latency, speech accuracy, prompt changes, evaluation datasets and regression thresholds. Separate synthetic from real contractor evidence and require reproducible recorded metrics.
---

# TradeFlow AI Evaluator

**Trigger:** Any model comparison, model update, prompting, ranking, ASR/TTS switch, latency/quality issue or hallucinated financial answer. Read `references/evaluation-protocol.md`.

1. Pin provider, model artifact/sha, quantization, runtime, hardware, threads, context, dataset hash, locale and run settings before scoring.
2. Run a frozen benchmark covering general advice, grounded analysis, hallucinated amounts/refs, missing information, role restrictions, prompt injection, tool-authority claims, audio transcription and TTS behavior.
3. Validate deterministic business calculations separately. The model receives precomputed trusted claims and may explain them; unsupported numeric claims are blocked.
4. Capture p50/p95 end-to-end response and per-stage ASR, retrieval, first-token, first-audio, playback, barge-in, error/timeout/retry and memory use.
5. Compare candidate with current verified baseline. Keep rollback option and do not upgrade because a single demo sounds more impressive.
6. Record failures, exact code SHA, dataset version and whether results were mock, local model, synthetic integration or contractor-validated.
