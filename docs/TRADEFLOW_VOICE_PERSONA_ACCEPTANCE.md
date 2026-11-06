# TF-VOICE-01 — Founder voice identity and evaluation gate

Founder direction recorded 2026-11-06. **This is a voice-character acceptance contract, not proof of model playback.**

## Candidates

- **The Gentleman:** mature adult British male, resonant smooth baritone, refined and warm. Chatterbox candidate uses a private, separately licensed British reference WAV.
- **The Matriarch:** **young adult** British female, smooth rich lower/middle register, refined and clear; emphatically **not** an elderly-sounding voice. Chatterbox candidate uses a private, separately licensed British reference WAV.

Both: calm, authoritative, measured, dignified, discreet, naturally conversational, with sparing witty or gently sardonic undertones. No character/performer imitation; no comedy in safety, financial hardship, emergencies or sensitive scenarios. Do not inject extra jokes into validated factual answers during TTS.

## Source and technology

Open-source/free only: the founder rejected flat-sounding Kokoro samples. **Chatterbox TTS is now the primary expressive speech engine**; Kokoro remains an optional lightweight fallback, not the accepted character voice. Select the actual voice/speaker IDs only after confirming model provenance, individual voice license, model hash, and hearing genuine samples. Model weights must remain outside Git. A server-hosted TTS runtime is not on-device/offline iPhone TTS.

## Unmet acceptance criteria

1. Install and verify genuine licensed Chatterbox weights and **two licensed original British reference recordings** in an approved private development runtime; record SHA256, source, license, CPU/RAM and latency.
2. Synthesize the **same** realistic, non-sensitive TradeFlow briefing with both candidates. Report exact model voice IDs and provide playable MP3/WAV samples; do not present a stand-in or browser system voice as the selected neural model.
3. Obtain founder A/B audio approval and refine delivery without assuming a gender/age match from a voice ID.
4. Wire a single TTS output to the **existing committed assistant turn** (same text and thread), with explicit Listen/Stop, interruption, page-hide cancel, honest unavailable state and no independent command execution. **Code is now present in draft PR #43, but actual audible preview still requires model provisioning and real-device verification.**
5. Verify playback in actual mobile Chromium and on a physical iPhone Safari/PWA. Node/browser synthetic tests are not substitutes for audible device evidence.

The idle orb is independently unapproved. Speech-reactive orb art must not be declared complete or overwrite PR #29.

## Chatterbox implementation checkpoint — 2026-11-06

The isolated PR now includes `src/chatterbox-gateway.js`, `tts/chatterbox_service.py`, `public/voice-output.js` and a Listen/Stop/voice-selector surface in the existing saved AI conversation. The Chatterbox runtime has **not** yet been provisioned with both legally usable British reference files; backend unit tests use mock audio and do not prove voice quality. No full preview, physical iPhone playback, merge or deployment has been verified. See `docs/TRADEFLOW_CHATTERBOX_RUNBOOK.md`.
