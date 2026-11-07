# Conversation and Voice UI Contract

- AI page: thread list, new thread, search, readable messages with timestamps and source labels; persist text by default only under an explicit user/account policy; deletion/export and local/synced markers.
- Each turn shows real refs and unknowns, not fictitious links. Pending model text is provisional; mark final only after validation.
- Voice panel: live orb/waveform mirrors actual measured input and actual TTS output (not a fake level animation claiming the model is listening).
- State legend: idle, requesting microphone, listening, speech detected, transcribing, thinking, speaking, interrupted, failed. Only show indicators supported by actual events.
- On user barge-in, fade/cancel speaker output, mark the partially spoken assistant turn interrupted, flush stale audio generation, start new user turn.
- Screen reader: announce status transitions politely; transcript readable without audio; controls accessible by touch, keyboard and VoiceOver.
- Silence/end of turn is a tuned VAD decision; provide push-to-talk alternative if natural turn-taking is unreliable in noisy contractor environments.
- Privacy: mic permission only on explicit interaction in secure context, visible capture indicator, no background capture, audio retained only with separate consent.
- Existing `tfChatMessages` in app.js is in-memory today; migration to durable threads must follow storage architect schema and authorization, not ad hoc localStorage.
- Speech mode must not execute commands; use existing typed review, explicit user approval and auditable receipts.
