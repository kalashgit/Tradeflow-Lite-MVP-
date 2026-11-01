# Voice Model Evaluation Choices (candidates; verify before integrating)

- **VAD:** Silero VAD via sherpa-onnx, with noise floor tuning for job-site background and speech endpoint false-positive score.
- **Streaming ASR:** sherpa-onnx Zipformer/Paraformer or other supported streaming acoustic models; measure partial stability and domain terminology. whisper.cpp streaming can be evaluated as a fallback but its example is a simple sliding-window transcription and not a full duplex conversation engine.
- **TTS:** sherpa-onnx Piper/VITS for efficient baseline, Kokoro or compatible voice for quality. Compare cold/warm startup, speaker naturalness, articulation of part numbers and numbers, chunk latency, CPU and RAM.
- **LLM:** existing llama.cpp Qwen localhost connector; evaluate 0.6B as constrained baseline, larger candidate only when RAM/cost allows. Token streaming for early speech must still respect numeric-evidence validation.
- **iPhone pathway:** Safari PWA mic captures only in secure context and after user grant. The inference may run on a private server, which is **not offline voice**; fully on-device iOS inference requires a separate native/WASM feasibility path.
- License-check every runtime/model weights/voice and redistribution rights, not just code. Keep all heavyweight model weights out of repository and GitHub artifacts.
- Model selection is not a commitment; evaluate with same frozen benchmark fixtures before choosing.
