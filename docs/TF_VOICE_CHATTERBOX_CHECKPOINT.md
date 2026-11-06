# TF-VOICE-02 — Chatterbox private runtime checkpoint

**Status:** Code committed; no live preview playback or physical iPhone validation. Do not mark voice ready.

## Decision
The founder rejected the flat Kokoro samples. Chatterbox TTS is the primary MIT-licensed, self-hosted evaluation engine. Kokoro is an optional low-resource fallback. Keep the existing two British persona contracts: mature male baritone **Gentleman**, young-adult female **Matriarch**. The current reference IDs are deliberately unset; never present a default or unrelated reference voice as either persona.

## Development-only runtime
Use a private machine with sufficient memory and model-download access. Create a Python virtual environment and install `chatterbox-tts`. Obtain two original British-English reference recordings with **explicit permission for commercial voice synthesis**, store outside Git, and set `TF_GENTLEMAN_REFERENCE` and `TF_MATRIARCH_REFERENCE` to their absolute WAV paths. Run `python3 scripts/chatterbox_private_tts.py`.

- `GET http://127.0.0.1:8766/health` returns which references exist, not proof of model readiness.
- `POST http://127.0.0.1:8766/synthesize` accepts JSON `{"profile":"gentleman","text":"Approved assistant reply"}` and returns `audio/wav` if synthesis succeeds.
- Model weights download on first generation; do not assume they are already installed. Do not log raw text/audio. The loopback server has no authentication and **must never be exposed publicly**.
- This runtime is **not reachable from a hosted Cloudflare preview or an iPhone**. A separate authenticated private gateway with tenant/session checks and rate limits is required before app wiring; do not weaken CORS or expose the loopback port.
- Synthesis is synchronous and nonstreaming. End-to-end latency, CPU/RAM and audible iPhone interruption remain unmeasured. This is not a production architecture.

## Remaining acceptance
1. Pin model revision and hash, verify model license and reference-recording rights.
2. Generate genuine matching British voice samples from consented recordings; evaluate expressiveness, pronunciation and number fidelity.
3. Build a private authenticated TTS endpoint for the existing committed assistant turn, not a second chat/command system.
4. Connect Play/Stop to the existing `public/app.js` conversation and cancel on page hide, new answer and navigation.
5. Record mobile Chromium and physical Safari playback, interruption, first-audio latency and peak memory. Only then ask founder for voice approval.

No merge or deployment is authorized. Speech-reactive orb animation remains independently gated by idle-material approval.
