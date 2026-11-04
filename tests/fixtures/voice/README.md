# Playback regression probe

`playback-probe.wav` is actual Piper LJSpeech synthesis of “TradeFlow is ready. What would you like to review?” generated locally for decoder/stop/metering tests. LJSpeech model trained from scratch on the public-domain LJ Speech dataset; Piper runtime is GPL-3.0. No model/runtime is distributed here. This fixed WAV is **not** proof of live inference or genuine conversation. The separate `verify-spoken-intelligence.cjs` requires real local Qwen and pinned TTS and generates a fresh answer/WAV.
