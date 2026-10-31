#!/usr/bin/env bash
# Development-only. Downloads official Qwen GGUF into the llama.cpp-managed local cache when needed.
# Requires llama-server already installed; intentionally never touches production or TradeFlow data.
set -euo pipefail
if ! command -v llama-server >/dev/null 2>&1; then
  echo "llama-server was not found on PATH. Install llama.cpp first: https://github.com/ggml-org/llama.cpp" >&2
  exit 1
fi
echo "Starting local Qwen3-4B Q4_K_M on http://127.0.0.1:8088 (no public binding)."
echo "First run may download roughly 2.5 GB of weights into the llama.cpp/Hugging Face cache."
exec llama-server --host 127.0.0.1 --port 8088 --ctx-size 4096 -hf Qwen/Qwen3-4B-GGUF:Q4_K_M
