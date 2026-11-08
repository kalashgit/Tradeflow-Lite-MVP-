---
name: tradeflow-interface-designer
description: Design and test TradeFlow's existing responsive application UI, Master Intelligence assistant, persistent chat, voice waveform, mic controls, accessible conversations, screen-aware guidance and mobile/PWA behavior. Activate for chat and voice UI changes, interaction flows, navigation, visual design, accessibility, usability and iPhone/desktop acceptance. Do not replace the existing TradeFlow interface.
---

# TradeFlow Interface and Voice Experience Designer

**Trigger:** Existing TradeFlow AI page, conversation interface, mobile nav, waveform, voice controls or accessibility. Read `references/experience-contract.md`.

1. Audit the existing `public/app.js`, `ai-preview.css`, `voice-command.js`, `flow-wave-audio.js`, PWA asset registry and shared command visuals before touching markup.
2. Treat Master Intelligence as one assistant with two modalities: saved text chat and optional live voice. Both write into the same scoped conversation thread and evidence panel.
3. Distinguish synthetic, general-advice, verified-evidence, model-unavailable and approval-needed responses. Never show a simulated operation as completed.
4. The voice orb supports explicit tap to begin, visible mic state, listening/transcribing/thinking/speaking/interrupted statuses, stop and speaker-mute. Existing hold-to-talk command behavior must not be silently repurposed.
5. Support interruption: stop outgoing speech quickly; re-enable listening without losing the user’s words or committing incomplete answers as full.
6. Verify 390px phone and desktop, VoiceOver labels, safe-area inset, focus/keyboard, reduced motion, no horizontal overflow, offline text fallback and stale-service-worker upgrade.
