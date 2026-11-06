# TF-MI-ORB-CONCEPT-B-01 — Founder-approved replacement renderer

This branch **completely replaces** the prior woven-blue orb renderer and CSS with Concept B, matching the approved visual direction: original cyan T centered in a deep blue, fine dynamically deforming mesh. It intentionally abandons the prior “no T inside” requirement because the founder explicitly replaced that direction on 2026-11-06.

## States and evidence
- Idle: always gently moving while page is visible, dark blue, subtle crest illumination, subdued cyan center T. It does not require a microphone or AI.
- Speaking: consumes only `tradeflow:speech-features` with `{version:1,source:'assistant_playback',active,rms,peak}`, the existing **real TTS analyser event from PR31**, and smoothly brightens the same membrane and T. On `active:false` it fades to idle. It never fakes speech from microphone amplitude.
- Reduced motion: static frame; no involuntary animation. Hidden tabs: rendering pauses and speech lights reset. Touch/keyboard activation remains the existing `tfAiToggle` action.
- The audio feature producer is currently on separate draft PR31 and not merged into the PR29 base. Until integrated, the orb correctly remains in idle—**do not claim the talking state is live in deployed TradeFlow**.
- Native 66px visual may not reproduce all the fine strands present in the earlier generated Concept B GIF; verify actual rendering and refine against that selected animation. This source change does not prove visual founder acceptance.
- Prior orb renderer is replaced at the same existing file path. Git history retains previous implementation; no other app data is deleted.

## Run
`node --test tests/intelligence-orb-idle.test.cjs`. Also test in the real app on 360/390/430px and desktop with Chromium, continuous idle recording and actual TTS analyser output after PR31 integration. Test iOS Safari separately. Do not merge/deploy without approval.
