# TradeFlow local AI — reproducible development quickstart

**Status:** developer-only setup for the founder's November 13 local-AI prototype. This does **not** integrate the model into TradeFlow or enable autonomous business commands. Keep production, cloud credentials, customer information, live outreach, and financial actions untouched. Draft PR #16 remains unmerged.

## Sources and licensing

- Official Qwen3-4B model page: https://huggingface.co/Qwen/Qwen3-4B
- **Official GGUF** (recommended starting quantization Q4_K_M, approx 2.5 GB): https://huggingface.co/Qwen/Qwen3-4B-GGUF
- llama.cpp runtime and documentation: https://github.com/ggml-org/llama.cpp
- sherpa-onnx voice SDK (future experiment): https://github.com/k2-fsa/sherpa-onnx

The Qwen3-4B model card states Apache-2.0; llama.cpp is MIT and sherpa-onnx is Apache-2.0. Before commercial redistribution, audit the exact revision, tokenizer, GGUF quantization, downloaded ASR/TTS voice weights, dependencies and notices. An open-source runtime does not automatically license every model it runs.

## Install llama.cpp outside the TradeFlow repository

Follow official instructions appropriate to your OS: https://github.com/ggml-org/llama.cpp

Examples:
- macOS with Homebrew: `brew install llama.cpp`
- Linux/Windows: follow the documented CMake release/build steps; ensure `llama-server` is on PATH (or set its full executable path).

**Do not clone llama.cpp or download model weights inside the TradeFlow repository.** Do not commit GGUF files. Fetching on first use requires internet; later local inference can be offline if all weights/runtime are cached.

## Start an isolated local model

Run from a terminal on a development computer:

```bash
bash scripts/start-local-ai.sh
```

This launches the **official Qwen/Qwen3-4B-GGUF:Q4_K_M** via llama.cpp, bound to **127.0.0.1:8088**. The `-hf` option automatically fetches and caches model weights using llama.cpp's Hugging Face loader. No API key and no TradeFlow business data are supplied. Avoid exposing the port beyond the local machine.

To verify the server locally:

```bash
curl -fsS http://127.0.0.1:8088/v1/models
```

To test text generation with synthetic wording only:

```bash
curl -sS http://127.0.0.1:8088/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"Qwen/Qwen3-4B-GGUF:Q4_K_M","messages":[{"role":"user","content":"Explain in one sentence why a quote follow-up may be useful to an electrical contractor."}],"max_tokens":96}'
```

Depending on llama.cpp version, the API model identifier reported by `/v1/models` can differ; use that returned value in the request if needed.

## Next engineering increment — not yet implemented

1. Inspect exact remote PR head and existing H04-01 authorized context, H04-02 decision protocol and shared command/approval/audit pathways.
2. Add a **disabled-by-default, replaceable local AI provider adapter**; no direct SQL writes and no direct remote/customer actions.
3. Feed a **permission-filtered, revision-tagged, synthetic contractor evidence packet** to the model; require structured output and validate cited IDs, scope, confidence and no-action responses.
4. Use deterministic business logic for precise costs, due dates and prioritization; Qwen interprets intent, explains tradeoffs and drafts typed proposals.
5. Demonstrate read-only "What should I prioritize today?" with quote follow-up, labor overrun and overdue invoice findings. Cash collection is not the same as new profit.
6. Run offline fallback, malicious prompt/record text, role revocation, tenant isolation, stale-source, retry/reload, Node/SQL/disposable D1 and phone/desktop Chromium regression acceptance.
7. Report model revision/hash, quantization, development hardware, first-token latency, response time, RAM/VRAM and expected failure cases. Physical-device and real-contractor acceptance are separate gates.

Voice is later: sherpa-onnx supports on-device ASR/TTS/VAD, but each specific voice model has its own license and real iPhone/Android resource limits. Voice should use the same authenticated text command and confirmation path.

**Important:** This quickstart only installs/serves a local model on the developer's own machine. It is not a cloud deployment, CI model download, phone app installation or claim that model integration tests already passed.
