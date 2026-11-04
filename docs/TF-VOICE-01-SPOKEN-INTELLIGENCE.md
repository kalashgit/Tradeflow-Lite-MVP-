# TF-VOICE-01: genuine spoken Intelligence

Issue [#30](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/30), isolated `feature/tf-voice-01-spoken-intelligence`, AI base `4834ea3c86253ee60c09fcd4ae718664c00c9cbf`. No merge/deployment. No real business records or model weights in Git.

## V1 implemented and locally exercised

Existing More → TradeFlow AI composer → canonical device-local user/assistant turns → explicit **Listen to reply** → real model WAV → Web Audio playback → Stop. A server-issued, five-minute, opaque ticket binds the exact completed LIVE model reply hash, thread and turn. Browser text cannot authorize arbitrary speech or business writes. Mock/unavailable replies acquire no ticket. Tickets are transient and not persisted/exported with history.

The development host remains loopback-only, same-origin and code-gated, with bounded requests, one synthesis at a time, per-minute rate limit, timeout, abort-on-disconnect, pinned weight hashes and no paid/browser speech-synthesis fallback. Missing runtime, weights, offline, denied audio unlock or mismatched saved text return truthful text-only errors. Stop/new question/thread/navigation/pagehide invalidate playback generations, abort synthesis and close/disconnect audio resources. A late old promise cannot relabel or stop a new turn. Existing command/approval/tenant services remain authoritative and unmodified.

### Real model evidence, not fixture playback

`docs/evidence/TF-VOICE-01/live-qwen-kokoro.json`: actual Qwen3-0.6B on llama.cpp generated a fresh answer to “Give two ways an electrician can reduce return trips.” Both 390×844 and 1280×900 real TradeFlow Chromium interfaces saved it and played actual Kokoro synthesis; nonzero analyser frames, Stop and thread-switch cancellation, zero business writes, no horizontal overflow. Videos are **silent** Playwright recordings; separate `*-actual-answer.wav` files are the genuine speech evidence. This is local browser evidence, not physical audibility/iPhone validation.

Cold CPU phrase pack: Kokoro ~10–16s process time for 3–7s audio; Piper ~2.6–3.2s for 3–7s audio. Full-answer Kokoro click → WebAudio start measured 24–36s while other tests shared the 3-vCPU environment. Not acceptable as low-latency duplex. Piper is the provisional CPU latency baseline; Kokoro male remains the natural-voice candidate, not an approved persona. No streamed-first-audio claim. See measured JSON and model manifest. Piper GPL runtime and espeak/phonemizer dependency obligations require redistribution review before shipping. Reject Ryan/HFC voices with noncommercial source restrictions; no automatic synonym for “commercially cleared.”

## V2 read-only presentation contract

Listen for `window` event `tradeflow:speech-features`, detail:

```
{version:1, source:'assistant_playback', active, rms, peak,
 spectralCentroidHz, at /* wall-clock milliseconds */}
```

50ms cadence, measured from the actual decoded output analyser, not microphone input or random animation. Inactive explicitly emits zero. The approved orb may consume the bounded envelope/cadence; it must not treat levels as speech content or execution authority. No orb geometry/PR29 changes; idle material and speech modulation still require founder acceptance. Reduced motion belongs to the presentation consumer and never removes audio Stop controls.

## Reproduce (private development only)

1. Install `config/voice/requirements.txt` into a private Python venv. Fetch selected weights privately from `config/voice/model-manifest.json`; verify hashes. Nothing auto-downloads on app startup.
2. Write an **external** JSON runtime file: Kokoro `{provider:"kokoro",model:"/absolute/private/model.onnx",voices:"/absolute/private/voices.bin",voice:"am_michael"}`; or Piper `{provider:"piper",model:"/absolute/private/model.onnx",config:"/absolute/private/model.onnx.json"}`.
3. Start the existing local Qwen server on `127.0.0.1:8088` (never expose unauthenticated model port). Then `TF_AI_DEV_MODEL=live TF_TTS_PYTHON=/private/venv/bin/python TF_TTS_CONFIG=/private/runtime.json node scripts/local-ai-preview-server.cjs`. Keep forwarded app port private; temporary code is a credential.
4. Open local app, complete synthetic onboarding, More → TradeFlow AI, unlock using private runtime code, submit a general question, click **Listen to reply**. No audio before explicit gesture. Stop or navigate to cancel. Reload retains text; transient speech ticket is intentionally lost.
5. `TF_TTS_PYTHON=... TF_TTS_CONFIG=... node scripts/verify-spoken-intelligence.cjs` requires actual Qwen and actual pinned TTS; fails rather than replacing them. Results/screenshots/WAV/video/traces are under ignored `artifacts/voice-01/browser/`.
6. `python scripts/benchmark-local-speech.py --cache /private/cache --out artifacts/voice-01/evaluation` evaluates the same contractor phrases on both real TTS models.

`verify-speech-playback-browser.cjs` is a **separate deterministic regression** using a clearly marked stub model and prerecorded decoder probe. It tests browser mechanics/offline/cancellation, never establishes live provider acceptance.

## Outstanding gates

Physical iPhone Safari/PWA unlock, audio routing, Bluetooth, backgrounding, VoiceOver, actual audibility and p50/p95 human speech latency; founder voice persona and independent orb acceptance; full-duplex/VAD/ASR and foreground-only wake phrase follow V1. No OS-level locked-phone wake capability claimed. Synthetic tests retire no contractor pain points. This development adapter does not activate speech in deployed Workers or read real company data.

## V3 implemented: opt-in microphone → same conversation → spoken follow-ups

Private development only: set `TF_ASR_MODEL=/absolute/private/whisper-tiny-en` alongside the speech runtime. The pinned files/runtime are checked before `/api/ai/verify` enables microphone controls. Once unlocked, **Start voice conversation** in the existing composer, or tap the existing T orb. The orb opens the existing contextual panel and starts this same voice session; absent a configured ASR runtime, the established command UI is preserved. No second assistant.

Actual AudioWorklet PCM capture uses browser device sample rate, bounded memory and area-average resampling to 16kHz mono PCM16. Explicit microphone consent requests browser echo cancellation/noise suppression. Energy VAD retains pre-roll, rejects silence, ends a turn after 1.2s silence, permits manual Finish and caps utterances at 30s without silently truncating/submitting. No raw audio file is written by browser or worker. The private code-gated server accepts only a bounded standard WAV, verifies Whisper tiny.en weights, and runs CPU int8 recognition with networking disabled. Low-confidence results go to an editable draft for review; only final transcripts enter the existing conversation store with `modality: voice`.

The existing voice-turn reducer is now shared through `public/voice-turn-protocol.js`; the previous CJS path re-exports it. One session/generation contract drives capture → transcription → canonical send → approved saved reply → actual TTS → listening. The microphone remains opted-in for follow-ups. Actual detected speech during output cancels prior playback generation; Stop cancels pending ASR/inference, closes tracks/worklet/audio and discards late results. Thread/actor/business/navigation/pagehide changes stop voice. The existing local AI transport now accepts cancellation; the zero-record advice adapter receives bounded prior user/assistant text for follow-up context, never a model-granted permission.

### Real V3 browser evidence

`docs/evidence/TF-VOICE-01/live-microphone-whisper-qwen-piper.json`: 390px and desktop actual Chromium microphone-capture code → real Whisper → canonical saved voice turn → real Qwen → real Piper → Web Audio. Two successive spoken questions remained in the same thread, yielding exactly two user + two assistant turns and zero business writes. Input was **synthesized Piper speech through Chromium's fake microphone device**, not a human. This validates the actual capture/provider integration, not human recognition accuracy, speakerphone echo/noise performance or physical iPhone behavior. Browser synthetic-device tests require Chrome's fake-device and fake-permission-UI flags; an initial missing flag produced `NotSupportedError` before capture. That failed attempt is not a model/phone pass.

Run `TF_TTS_PYTHON=... TF_TTS_CONFIG=/private/piper-runtime.json TF_ASR_MODEL=/private/whisper-tiny-en TF_VOICE_TEST_MIC=/private/synthetic-input.wav node scripts/verify-conversation-voice.cjs`. Requires actual providers and explicit synthetic input. No stubs. Separate `verify-conversation-voice-browser.cjs` is CI-only with explicitly stubbed inference/ASR and a recorded decoder probe, and covers denial/provider missing/offline/track cleanup.

### Remaining V3 / V4 gates

Current ASR is whole-utterance, not streaming partial transcription. There are no fabricated partial captions. Speakerphone barge-in relies on browser acoustic echo cancellation; use headphones until real-device echo/noise/false-trigger measurements. TTS waits for a whole WAV, not streamed chunks. Deterministic local job/approval responses remain text when no server-issued speech ticket exists; the adapter does not upload real company evidence to acquire one. No fake spoken “invoice sent” or completion is substituted.

V4 “Hey TradeFlow” is **not enabled**: no reviewed trained keyword model for that phrase, human false-positive/negative tests, foreground battery/CPU evidence or physical-iPhone voice-session acceptance yet. Whisper continuous transcription is not relabeled as a local keyword spotter. V4 cannot bypass V3 acceptance or imply locked/background-phone availability. All deployed/production providers remain disabled until separately authorized integration.
