# Actual development evidence

Runtime source tested: `b92d1351e5a912f45a26193dcf2e04d0e7539213` on isolated draft PR31. No deployment. Later evidence-only commits do not change the tested runtime.

- `actual-generated-answer.wav` is **freshly synthesized actual Piper output** of the actual local Qwen answer in `actual-generated-answer.txt`. It is not a canned reply used by the app. Hash/provenance in transcript + live-run JSON.
- `mobile-spoken-conversation.png` (390px) and `desktop-spoken-conversation.png` show the real existing app during this run.
- `live-microphone-whisper-qwen-piper.json` records real local ASR/LLM/TTS, saved turn identities, provider timings and measured lifecycle. Microphone device input is synthetic Piper speech: human WER, physical iPhone, acoustic echo/noise and contractor outcomes are **unverified**. Two samples do not establish p50/p95 performance.
- `live-qwen-kokoro.json` and `tts-cold-benchmark.json` record the earlier actual output-path evaluation; Kokoro latency is explicitly not acceptable as natural duplex.
- `verification-b92d135.json` separates exact-source CI from actual-model local tests. CI does not download private models; its microphone/speech fixture checks are mechanical regression tests only.

Playwright videos do not include audio. Full local recordings/traces under ignored `artifacts/voice-01/` must be paired with the separately generated WAVs. Browser audio source start/metering is not proof of physical-device audibility. No founder voice-persona or orb acceptance is inferred.
