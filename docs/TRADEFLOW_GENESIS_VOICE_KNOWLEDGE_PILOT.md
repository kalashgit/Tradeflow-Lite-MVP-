# AION Genesis ↔ TradeFlow: electrical CEO knowledge, natural conversation and voice pilot

**Research-only integration.** No production Worker or D1 migration, no customer-record ingestion, no automatic command execution, no Qwen training, no autonomous deploy.

**Base:** AION Autonomous Academy PR #106, the existing TradeFlow Master Intelligence chat, the existing local Qwen OpenAI-compatible adapter, and the existing orb/microphone/speech controls.

## Delivered UI and inference behavior

- The **existing TradeFlow Intelligence conversation** exposes a clearly labeled optional AION Genesis adviser mode only when connected to the authenticated local synthetic development preview. This avoids silently pretending the Cloudflare Llama preview is Qwen/Genesis.
- In local **live** mode the adviser calls the existing Qwen loopback endpoint through `completeLocal`. It receives a bounded conversational history, a distinct natural-language assistant persona, and the top five related source-linked knowledge cards. It can answer conversationally and follow the topic across turns.
- In local **mock** mode, the same UI honestly provides **reference-only** guidance with explicit no-model wording; it never generates fictitious model output.
- Current anonymous aggregate and individual customer fields in browser requests are ignored by this AION lane. No business read occurs in this route; a user can type company information into a question, so the preview should still be private and the user must be informed.
- The existing speech-recognition microphone feeds the same TradeFlow conversation. For spoken replies, optional Aura TTS is preferred; if absent, opt-in **device-local Web Speech synthesis** is used when supported (iPhone/iOS voice depends on device and browser). No cloned human voice and no guarantee of uninterrupted duplex speech. The existing 'Read aloud', stop and auto-speak controls are preserved.
- The existing local conversation store now accepts the provenance sources `genesis_qwen`, `genesis_reference`, `genesis_unavailable`. AION citations display as **reference notes**, not company-record evidence.

## Electrical contractor / CEO knowledge corpus

`src/genesis-contractor-knowledge.cjs` contains an original, inspectable, versioned and searchable seed library across:

- estimating (labor productivity assumptions, material BOM, scope changes, service pricing);
- field delivery and supply chain (procurement, substitutions, daily updates, cost to complete, closeout);
- commercial and customer lifecycle (qualification, follow-ups, profitable segments and recurring service);
- finance (cash forecast, WIP, contribution, receivables, payables, break-even);
- people (skills, supervision, apprentices, staffing, incentives, classification);
- CEO/strategy (weekly priorities, market positioning, growth, delegation, risk, metrics, experiments);
- electrical compliance reference metadata (OSHA Subpart K, §1926.417, NFPA 70, NFPA 70E, DOE local energy-code adoption, IRS worker classification);
- AI/product workflow safeguards (authorized approvals, voice transcripts, system-of-record boundaries).

The corpus is **not** all electrical-code text, a license to reproduce NFPA standards, a verified contractor outcome database, or an up-to-date jurisdiction-specific rule checker. Each card is labelled either TradeFlow original management guidance or official public reference metadata. The NEC 2026 edition and NFPA 70E 2027 edition are *publication* references, not assertions that those editions are locally adopted.

Reference URLs are listed in `src/genesis-contractor-knowledge.cjs`. Local code adoption, contracts and site conditions must be verified before any technical decision.

## Why the self-learning model is not promoted into production

The Academy v3 PyTorch predictor improved on repeatedly inspected synthetic development cases. It has **not** demonstrated independent contractor-domain generalization or real-world safe authority. Therefore this chat integration deliberately uses **Qwen base + a source-grounded expertise adapter**, not the synthetic world-model checkpoint to generate operational conclusions. It does not claim to have updated Qwen weights.

For an actual verified AION generation in TradeFlow:
1. Export the independent Academy checkpoint lineage and model metadata through a separately reviewed, authenticated inference interface.
2. Validate Qwen LoRA trained on eligible verified experiences using genuinely fresh, externally controlled, mechanism-held-out evaluations.
3. Add a read-only, tenant-scoped TradeFlow context adapter reusing `src/intelligence-context.js` and existing host authorization, with pre-and-post-inference revision and role verification.
4. Allow only typed reviewable suggestions via the existing command registry; require fresh approval and an atomic independent executor recheck.
5. Test private iPhone voice, offline failures, role revocation, prompt-injection attacks, and commercial performance with real contractor permissions before any pilot beyond synthetic records.

## Running locally

Use the existing preview script and secret practices; do not publish preview codes.

```bash
npm test
TF_AI_DEV_MODEL=mock TF_AI_DEV_PREVIEW_TOKEN=<private-secret> node scripts/local-ai-preview-server.cjs
```

For Qwen, start your existing loopback inference service at `http://127.0.0.1:8088/v1/chat/completions`, then set `TF_AI_DEV_MODEL=live` on the local preview. In the existing Intelligence view, unlock the synthetic preview and activate **Use AION Genesis · Qwen CEO expertise**. Speak through the existing mic and enable 'Speak replies' to hear optional spoken answers.

The model's output is always untrusted, advice-only and cannot itself authorize or execute an operation.

## Testing and evidence

```bash
node --test tests/genesis-*.test.cjs
node --test tests/local-ai-preview-server.test.cjs tests/ai-speech.test.cjs
npm test
```

Focus on exact-head GitHub Actions and report failures honestly. Browser microphone/voice testing on a physical iPhone, actual Qwen quality testing, and the full integration with live tenant data are still separate acceptance gates.
