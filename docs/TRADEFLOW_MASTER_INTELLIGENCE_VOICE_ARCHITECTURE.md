# TradeFlow Master Intelligence — Conversational OS & Voice Architecture
**Status:** proposed engineering contract, November 2026; NOT a deployed speech product or commercially validated feature.

## North Star

An offline-first, AI-native operating headquarters for American electrical contractors. The same TradeFlow Intelligence exists across the current GUI: the business owner can type or speak, receive transparent evidence-linked insights, and authorize reviewed operations through the existing command system. Its voice should be original, calm, assured and clear—a practical “business headquarters,” not an imitation of a fictional or real actor.

**Do not** build a second assistant, chat client, separate command executor or separate source of business truth. Connect to the existing `public/app.js` TradeFlow AI page, `public/voice-command.js`, `public/flow-wave-audio.js`, `src/intelligence-context.js`, `public/command-registry.js`, server-side membership authorization and revision-bound receipts.

### Current source-grounded facts versus target
| Item | Current engineering reality | Target |
| --- | --- | --- |
| Text AI chat | Existing TradeFlow AI composer + preview backend; `tfChatMessages` in memory | Saved, searchable, tenant-scoped conversation threads and message history |
| Voice | Local command recognition and microphone waveform controller | True interruptible, real-time spoken dialogue *using the same chat thread* |
| Local LLM | llama.cpp/Qwen test adapter; prior 0.6B Codespace inference reported | Runtime-selected reliable model with measurements, traceable evidence and safe fallback |
| Business knowledge | H04-01 read-only authorized intelligence context and synthetic briefing | Reauthorization on every read/after inference, typed validated financial facts, revision-linked sources |
| Actions | Existing shared commands, approvals, receipts and offline queue | AI proposes reviewable drafts, never executes from generated text |
| Cloud/customer data | Synthetic tests and security gates, live acceptance pending | Separately approved tenant/role validation and real contractor pilot evidence |
| Offline | Existing IndexedDB/PWA storage and recoverability | Offline chat history and core app continue; online/private-server voice degrades to text without hiding dependency |

## System architecture (planned)

```text
                    EXISTING TRADEFLOW APP — ONE INTELLIGENCE
                ┌──────────────────────────────────────────┐
                │ AI page: saved threads and messages      │
Keyboard/typing ─→ text composer                             │
Microphone (opt in) → AudioWorklet → VAD → ASR transcript      │
                │            ↓ final, canonical user turn  │
                │ shared conversation store / evidence UI  │
                └─────────────────────┬────────────────────┘
                                      │ scope/identity
                     ┌────────────────▼────────────────┐
                     │ conversation coordinator        │
                     │ intent + model/provider routing │
                     │ context minimization + consent │
                     └────────────────┬────────────────┘
                                      │
                      ┌───────────────▼───────────────┐
                      │ Authorized TradeFlow H04-01   │
                      │ read + revision revalidation │
                      └───────────────┬───────────────┘
                                      │ trusted claims only
                      ┌───────────────▼───────────────┐
                      │ Deterministic business math  │
                      │ model-generated explanation  │
                      │ refs/numeric claims validator │
                      └───────────────┬───────────────┘
                                      │
        ┌─────────────────────────────▼────────────────────────┐
        │ Validated assistant response → one committed chat turn│
        │                ├── text UI/citations                │
        │                └── TTS adapter → audio chunks → ear  │
        └─────────────────────────────┬────────────────────────┘
                                      │ proposals only
                         ┌────────────▼────────────┐
                         │ Shared commands         │
                         │ Human approval + receipt│
                         └─────────────────────────┘
```

### Mode and data boundaries
- **Synthetic demo:** fixed test tenant and fake records, explicitly labelled `SYNTHETIC`; never treat as company analysis.
- **General advice:** no business records sent; label `GENERAL ADVICE`; suggestions are not business facts.
- **Authorized evidence:** server-derived verified identity/role/tenant, minimized and revision-bound data; re-read before returning validated conclusions, else stale/revoked.
- **Model offline:** show unavailability and valid deterministic local UI facts if they exist; never invent a model answer.
- **Voice** is a modality of these exact modes, not a permission grant.
- The present Codespace + phone architecture requires a network to the private voice inference server. **Offline-first does not imply offline speech inference**. On-device mobile models are a later separately evaluated route.

## 1. Durable chat: one conversation across text and speech

The source of truth is a **thread**, not the current `tfChatMessages` array. Recommended sequence:
1. Database architect inspects the current IndexedDB v9, `STORES` list, D1 migrations and `account-session` before choosing migration v10 or additive store. No direct production migration.
2. Create thread/turn/event schema scoped to account and tenant with local-only vs synced status, generation/version and retention metadata. No audio stored by default.
3. Replace in-memory display only after tested migrations, legacy backup restore, privacy/authorization and a fresh-install path. Allow multiple threads, deletion, export and per-tenant retrieval.
4. Every final voice transcript becomes a `user` turn with `modality=voice`; model response becomes a validated `assistant` turn. Interrupted/partial output remains distinctly marked.
5. Restore after refresh and offline reopening. Add full-text search only through permitted, locally held data; optional server sync must use existing authenticated sync infrastructure with uncertain-ack reconciliation.

Thread and turn contract is in `.agents/skills/tradeflow-database-architect/references/storage-contracts.md` and `tradeflow-conversation-memory/references/memory-lifecycle.md`.

## 2. Natural voice experience: interruptible conversation

An explicit microphone tap opens a session (with permission) while keeping a visible transcript in the TradeFlow AI page. **Speech path:**

```text
user speaks → VAD speech start → streaming ASR partial captions
    → VAD speech end / ASR final → append validated user turn
    → route to general advice or authorized evidence → Qwen
    → validate claim IDs and output → append assistant turn
    → low-latency TTS chunks → speakers
user interrupts → stop old TTS + generation invalidation → VAD/ASR listening again
```

- **Voice persona:** original, authoritative-but-friendly, concise and practical. Voice settings include speed, mute, input language and speaker selection, but not imitation of a specific performer.
- **Turn end:** VAD with configurable endpoint delay; avoid premature stopping during pauses, noisy sites or figures. Provide optional push-to-talk.
- **Barge-in:** user speech during TTS should stop playback rapidly; old TTS chunks cannot resume or reappear after a later turn; mark interrupted text honestly.
- **Two-way audio:** for streaming, secure private WebSocket with bounded buffers/control frames and versioned sequence IDs; use WebTransport only if comparative tests demonstrate a material benefit. WebSocket does not automatically implement backpressure.
- **Browser:** HTTPS (or localhost) and user-granted mic via `getUserMedia`; AudioWorklet is a candidate for processing/packetization. iPhone Safari and home-screen PWA device behavior require physical validation, particularly background, route changes and audio focus.
- **Privacy:** mic off until tap; visible recording status; stop on page hide; never assume voice consent includes storing raw audio. Raw audio never logged by default.

### Session protocol (design)
Envelope: `{version,session_id,thread_id,turn_id,event_id,sequence,at,kind,payload}`. Bounded audio frames are binary with version, stream and sequence; control frames are small JSON. Deduplicate event IDs and ignore old session/generation tokens. ASR partials are provisional. Only finalized transcript may become a user turn; only validated assistant text may become a final assistant turn. UI must not trust client-supplied identity or role.

### Latency target (engineering aspiration, not measured)
End of user speech → first **audible** answer chunk: p50 at or below 1.5s and p95 at or below 3.5s on a named baseline device/network/model. Barge-in → old speech stopped: p95 ≤250ms. Instrument microphone, endpointing, ASR partial/final, time-to-first-LLM token, first synthesized TTS chunk and device playback. If the stack cannot meet these, document measured reality and preserve a good push-to-talk/text path; never advertise “human-level latency” without tests.

## 3. Candidate local models and capacity

| Layer | Candidate A | Candidate B | Decision gate |
| --- | --- | --- | --- |
| VAD | Silero via sherpa-onnx | tuned energy VAD as fallback | Noise false-positives, endpoint speed |
| Streaming ASR | sherpa-onnx streaming model | whisper.cpp streaming prototype | Job-site English WER, partial stability, memory |
| LLM | llama.cpp Qwen3-0.6B current constrained baseline (reported) | bigger Qwen candidate if memory permits | Profit/claim accuracy, latency, peak RSS |
| TTS | sherpa-onnx Piper/VITS | sherpa-onnx Kokoro (if license/quality fit) | First playable chunk, naturalness, CPU/RAM |
| Audio capture | AudioWorklet in secure PWA | native/mobile integration in later phase | Permissions, echo, iOS robustness |

These are **evaluation candidates**, not installed model weights or approved distribution. Pin SHA, runtime license, weight licensing, quantization and hardware before any deployment. Never attempt to run large LLM, ASR and TTS concurrently in a constrained Codespace without measuring aggregate memory.

External technical references (research, not repo-verified installed dependencies):
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx): streaming/nonstreaming ASR, VAD and TTS, cross-platform.
- [whisper.cpp stream](https://github.com/ggml-org/whisper.cpp/blob/master/examples/stream/README.md): example streaming microphone transcription; not itself duplex voice orchestration.
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia): user permission and secure-context rules.
- [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet): low-latency worker-thread audio processing.
- [MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket): duplex transport; lacks built-in backpressure.

## 4. Trusted financial intelligence

Trusted calculators run on permission-filtered, revision-bound records **before** the LLM speaks. A claim object contains metric/value/unit/period/rounding/source revisions/unknowns. Qwen may select, organize and explain the **known claims**, not calculate unsourced margins or add invented cash/profit figures. If a claim fails validation, return the missing-data question or safe deterministic insight; do not silently swap in an unrelated canned invoice answer. Reviewer decisions and commands use the existing audit/approval paths.

## 5. Typed actions, not fictional autonomy

`observation -> recommendation -> typed draft -> explicit permissioned review -> shared command execution -> verified receipt`. Voice saying “send an invoice” means prepare draft/review, **not** automatically send. Human confirmation applies even when the assistant reads a draft aloud. The owner must see the effective fields and source revisions before approval. On network loss after execution, reconcile receipts; do not blindly replay.

## 6. Operator and commercial infrastructure

Provider health/readiness per ASR/LLM/TTS; per-tenant rate limits and quotas; onboarding, secure identity, retention/deletion and export; support diagnostics without voice/audio/customer content; backups/restore; cost per conversation/voice minute and deterministic degraded modes. Billing and production changes are **not** implied by this architecture. Security and paid pilots require separately approved environments and measured contractor benefit.

## 7. Build sequence, concrete acceptance gates

| Phase | Build increment | Acceptance evidence |
| --- | --- | --- |
| V0 | Skill pack + architecture + pure voice protocol | Skill validation, event-order/replay tests; no real audio claim |
| V1 | IndexedDB durable chat on existing AI page | Refresh/offline history, delete/export, no cross-tenant leakage |
| V2 | Explicit mic capture + VAD + ASR adapter | iPhone recording permissions, partial/final captions, no auto capture |
| V3 | Qwen streaming/validated evidence + model routing | Different question intents answered, no hallucinated financial number; timeout path |
| V4 | TTS adapter + duplex interruptible voice | ASR→LLM→TTS usable spoken dialogue, barge-in, transcript matches voice |
| V5 | Voice-to-typed approval drafts | No unapproved writes; approve/cancel/stale/uncertain receipts |
| V6 | Model/runtime benchmark, stability, offline fallback | p50/p95 measured, exact SHA CI, crash/recovery, memory/cost report |
| V7 | Private two-device and limited contractor pilot | H03 approval, role revocation, support, value evidence |
| V8 | Commercial release decision | Security/terms/billing/support/rollback/operational gates verified and founder approved |

**Scope gate:** Phase V1-V6 are engineering; V7-V8 cannot be declared successful from synthetic CI. Keep PR #16 draft, no production deploy/merge/identity/payment actions without explicit authorization.

## 8. Skills orchestration

Principal: `.agents/skills/tradeflow-principal-ai-engineer/SKILL.md`.
Specialists: database architect, AI evaluator, financial engineer, interface designer, realtime voice engineer, conversation memory engineer, model runtime engineer, commercial platform engineer and workflow orchestration engineer. Each has its own `SKILL.md`, `agents/openai.yaml` and small specialist references; consult only the needed ones. One principal owns GitHub writes and CI, and no parallel autonomous writer.
