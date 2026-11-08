---
name: tradeflow-model-runtime
description: Package, benchmark and recover TradeFlow's local LLM, speech recognition, VAD and speech synthesis runtimes for constrained hardware and private previews. Activate for llama.cpp, Qwen startup, RAM limits, model caches, speech engine management, provider fallbacks, CPU optimization, model licensing or deployment packaging. Treat Qwen health and preview health separately.
---

# TradeFlow Local Model Runtime Engineer

**Trigger:** Qwen/llama.cpp startup, local model selection, cache, memory, CPU, ASR/TTS process, inference latency, provider fallback. Read `references/runtime-manifest.md`.

1. Detect current runtime/weights and verify model checksums, quantization, license, memory/CPU budget and exact command line. No automatic model download or cloud fallback.
2. Manage LLM, ASR, VAD and TTS as separate supervised providers with explicit readiness, liveness, startup timeout and failure reasons; health of preview host ≠ model readiness.
3. Start on loopback or authorized private transports. Keep credentials and customer data out of logs. Never expose raw llama.cpp endpoint publicly.
4. Reserve resource budgets: one server can oversubscribe Codespaces memory when LLM+ASR+TTS run concurrently. Benchmark staged startup, peak RSS and degraded text-only mode.
5. Test SIGTERM 143, unknown cache, malformed model, 503 Loading, OOM evidence vs speculation, partial output, interrupted sessions and reconnection without blind replay.
6. Record reproducible `model_id`, `weights_sha256`, `runtime_commit`, `device_profile`, `warmup_ms`, `peak_rss`, `p50/p95`, and allow rollback.
