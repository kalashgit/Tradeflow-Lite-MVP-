---
name: tradeflow-realtime-voice-engineer
description: Engineer TradeFlow's two-way low-latency voice interaction, streaming microphone capture, VAD, ASR, Qwen reasoning, streaming speech synthesis, barge-in, interruptions and iPhone/PWA audio reliability. Activate for speech-to-text, text-to-speech, voice models, spoken conversations, latency and audio security. Reuse the existing TradeFlow AI interface and approval system.
---

# TradeFlow Real-Time Voice Engineer

**Trigger:** Spoken Master Intelligence, microphone, VAD, ASR, TTS, latency, voice interruptions or iPhone voice failures. Read `references/duplex-audio-protocol.md` and `references/model-options.md`.

1. Inventory existing `voice-command.js` command controller and `flow-wave-audio.js` visuals; preserve hold-to-talk command semantics.
2. Build a permissioned voice session **within the existing TradeFlow AI conversation**. Typed and spoken messages commit to the same thread schema.
3. Separate browser capture/streaming, VAD, ASR, inference, TTS and playback behind versioned adapters; keep provider licenses and model files outside Git.
4. Implement ordered audio frames, bounded queues, audio sample-rate negotiation, explicit session cancel, partial vs final transcript, voice barge-in and stale-generation rejection.
5. Only finalized user transcripts can enter conversation history; assistant text/audio must be validated and tagged before final commit. Voice has no independent business-action authority.
6. Verify microphone denied, silence, simultaneous speech, Bluetooth/headphones, audio focus, network reconnect, iPhone Safari, backgrounding, echo suppression and screen locking.
7. Measure p50/p95 speech end → first audio, ASR WER, TTS start, barge-in stop time, dropouts and memory on named hardware. Do not claim human-level latency without measured evidence.
