# Model Runtime Inventory and Recovery

## Confirmed historical observations (not present device facts)
A Codespace was reported with Qwen3-0.6B Q8_0 working for general record-free advice; Qwen3-4B model loading previously failed and exit 143 was observed. 143 is SIGTERM; not proof of OOM. Neither is a validated current configuration unless rechecked.

## Runtime manifest (proposed)
`{provider_id,kind:llm|asr|vad|tts,model_name,weights_sha256,license_id,runtime,version,quantization,source_uri,allowed_transport,ram_peak_mib,startup_timeout_ms,readiness_probe,latency_profile,provenance}`.
Provider readiness states `absent|downloading|loading|ready|degraded|unavailable`. Never mark 'ready' from server port listening while the model reports 503 Loading.

## Startup strategy
- Detect Codespace memory cgroup cap and usage. Model weights on disk are not peak RSS; ctx, kv cache, concurrent streams and ASR/TTS increase working set.
- Default voice benchmark: small ASR + small TTS + existing local LLM with no unnecessary parallel sessions; profile each stage and combined peak memory.
- Bind llama.cpp to localhost; bind browser voice control behind an authenticated private preview. No direct browser connection to unauthenticated LLM or speech processes.
- Handle cold startup, model missing, health 503, request cancel, reconnect and voice/text fallback. Do not auto-retry a partly executed business action.
- Test provenance, model-cache paths, checksum, license and redistribution obligations before shipping.
