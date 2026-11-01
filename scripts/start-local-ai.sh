#!/usr/bin/env bash
# Development-only, loopback-only. Reuse the compiled llama.cpp in GitHub Codespaces.
# No production deployment, external sharing, business data or stored credentials.
set -euo pipefail
if [[ -n "${TRADEFLOW_LLAMA_SERVER:-}" ]]; then
  BINARY="$TRADEFLOW_LLAMA_SERVER"
elif [[ -x /workspaces/llama.cpp/build/bin/llama-server ]]; then
  BINARY=/workspaces/llama.cpp/build/bin/llama-server
elif [[ -x ../llama.cpp/build/bin/llama-server ]]; then
  BINARY=../llama.cpp/build/bin/llama-server
elif command -v llama-server >/dev/null 2>&1; then
  BINARY="$(command -v llama-server)"
else
  echo "llama-server binary not found; build it in your existing llama.cpp Codespace checkout first." >&2
  exit 1
fi
if [[ ! -x "$BINARY" ]]; then
 echo "Configured llama-server binary is not executable: $BINARY" >&2
 exit 1
fi
echo "Starting official Qwen3-4B GGUF Q4_K_M on 127.0.0.1:8088."
echo "Codespaces needs enough available memory and persistent local model-cache storage."
echo "Keep this terminal open during the live preview. Press Ctrl+C to stop."
exec "$BINARY" --host 127.0.0.1 --port 8088 --ctx-size 2048 --threads 2 --parallel 1 -hf Qwen/Qwen3-4B-GGUF:Q4_K_M
