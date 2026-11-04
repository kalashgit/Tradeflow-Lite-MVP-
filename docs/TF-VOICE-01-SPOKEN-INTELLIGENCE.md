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
