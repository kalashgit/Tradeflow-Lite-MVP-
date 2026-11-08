# TradeFlow Voice Duplex Protocol v0 (proposal, not implementation)

## Shared conversation, separate modalities
`thread_id` owns typed turns and voice turns. Text chat is durable; voice is an ephemeral audio stream yielding finalized transcript, validated assistant text, and optional synthesized playback. A voice session MUST NOT create its own isolated chat history.

## Event envelope
`{version:1,session_id,thread_id,turn_id,event_id,sequence,at,kind,payload}`.
Kinds: `voice.session.request`, `voice.session.ready`, `audio.input.chunk`, `vad.speech_start`, `vad.speech_end`, `asr.partial`, `asr.final`, `assistant.text.delta`, `assistant.text.final`, `tts.audio.chunk`, `tts.audio.final`, `voice.interrupt`, `voice.session.error`, `voice.session.end`.
All inbound client fields untrusted. Server derives authorization and session binding; never trust client-provided tenant/role/record refs.

## State machine
`idle -> permission_requested -> listening -> transcribing -> reasoning -> speaking -> listening`.
Errors go to `failed` with a text-first recovery. Interruptions during `speaking` cancel all audio chunks of prior generation, tag partial output `interrupted` and reopen listening only if mic capture permission remains active. `pagehide`/`visibilitychange hidden` stops capture and playback, revokes transient session credentials. `Stop` is unambiguous and immediate.

## Transport and buffering
Secure HTTPS for mic access; WSS/WebSocket candidate for duplex, with application-enforced bounded queues, sequence checks, drop policy, ping/heartbeat, cancellation and max session duration. WebSocket does not provide automatic backpressure; measure bufferedAmount. Alternative WebTransport if supported and beneficial. Control frames JSON; audio binary messages with versioned header and negotiated format (PCM16 mono, negotiated target sample rate); bytes/time/session caps.
Browser capture via `getUserMedia` on explicit button action; `AudioWorklet` candidate for frame processing, VAD, resampling. No automatic microphone start. Never log raw audio or transcripts containing PII.

## Model stages
`mic -> echo control -> VAD -> streaming ASR -> validated final user text -> authorized context + local LLM -> validated assistant text -> streaming TTS -> speakers`.
ASR partial hypotheses used for caption preview only, never as approved commands. Voice command intent must pass existing registry and explicit approval; end-user interruption does not approve anything.

## Latency instrumentation
Capture stage `t_vad_end`, `t_asr_final`, `t_first_token`, `t_tts_first_chunk`, `t_audio_play_start`, `t_audio_stop_on_interrupt`. Report p50/p95 by phone, network, model, input length; preserve server clock-skew estimates. Provisional target end-of-turn → first audio p50 ≤1.5s, p95 ≤3.5s; barge-in stop p95 ≤250ms; targets only, require field measurement.

## Privacy/recovery
Retain transcript per thread policy; raw audio off by default and never archived without separate opt-in and retention controls. On connection loss, stop audio and offer text input. If model fails, show failure; do not replay partial assistant output as if complete.
