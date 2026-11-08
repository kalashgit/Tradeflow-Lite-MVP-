# TradeFlow AI Engineering Skill System — Index

**Purpose:** one coordinated ChatGPT-led Principal AI Engineer, ten specialist skills, one existing TradeFlow codebase. The files are repository-hosted engineering skills, not nine independent agents or automatically installed ChatGPT plugins.

## Skills

| Skill | Trigger | Entrypoint |
| --- | --- | --- |
| Principal AI Engineer | General engineering ownership, GitHub changes, CI | [Principal](../.agents/skills/tradeflow-principal-ai-engineer/SKILL.md) |
| General App Engineer | Existing GUI, job workflows, offline data, mobile PWA | [General App](../.agents/skills/tradeflow-general-app-engineer/SKILL.md) |
| Database Architect | IndexedDB, D1, migrations, chat persistence, sync | [Database](../.agents/skills/tradeflow-database-architect/SKILL.md) |
| AI Evaluator | Model quality, financial hallucinations, speech latency | [Evaluator](../.agents/skills/tradeflow-ai-evaluator/SKILL.md) |
| Financial Engineer | Deterministic cost/margin/cash calculations | [Finance](../.agents/skills/tradeflow-financial-engineer/SKILL.md) |
| Interface Designer | TradeFlow AI page, mobile UI, waveform, accessibility | [Interface](../.agents/skills/tradeflow-interface-designer/SKILL.md) |
| Real-Time Voice Engineer | VAD/ASR/LLM/TTS streaming, barge-in, mic privacy | [Voice](../.agents/skills/tradeflow-realtime-voice-engineer/SKILL.md) |
| Conversation Memory Engineer | Unified text+voice threads, offline history, retention | [Memory](../.agents/skills/tradeflow-conversation-memory/SKILL.md) |
| Model Runtime Engineer | llama.cpp/Qwen, speech model cache, memory/readiness | [Runtime](../.agents/skills/tradeflow-model-runtime/SKILL.md) |
| Commercial Platform Engineer | Onboarding, plans, entitlements, pilot operations | [Commercial](../.agents/skills/tradeflow-commercial-platform/SKILL.md) |
| Workflow Orchestrator | Cross-module triggers, typed drafts, approvals/receipts | [Orchestration](../.agents/skills/tradeflow-workflow-orchestrator/SKILL.md) |

## Engineering entrypoints

- **Architecture:** `docs/TRADEFLOW_MASTER_INTELLIGENCE_VOICE_ARCHITECTURE.md`
- **Candidate speech & local LLM models:** `config/tradeflow-ai-model-candidates.json`; intentionally disabled/unverified.
- **Pure duplex voice turn controller:** `src/voice-turn-protocol.cjs`. The controller is isolated and not wired to a microphone or service yet.
- **Voice control tests:** `tests/voice-turn-protocol.test.cjs`. Skill pack and model-manifest tests under `tests/tradeflow-*.test.cjs` run as part of existing `npm test`.
- **Current repo truth:** `AGENTS.md`, engineering ledger, handoff, current exact SHA and CI logs. This index cannot override code or acceptance gates.

## One-principal workflow

The Principal AI Engineer starts at the current GitHub branch and PR #16, checks existing architecture/tests, invokes the necessary specialty instructions from the repo, implements narrowly scoped changes, runs exact-SHA CI and documents failures honestly. **There are no specialist workers editing the branch independently.**

When handling *voice conversation plus financial records*, coordinate Voice + Memory + Interface + Runtime + Database + Financial + AI Evaluation + Security; then route any side-effect requests through Orchestration and existing commands. For product launch decisions, include Commercial.

## Activation caveat

Putting `SKILL.md` in GitHub makes the instructions available to engineering agents/workflows that support reading this repository. It does not by itself install those skills globally into the ChatGPT account, nor does it download speech models or make the app voice-ready. The principal can be packaged separately for installation if required, but one ZIP containing multiple independent SKILL.md entrypoints must not be represented as a single installable skill.

## Engineering sequence

1. Ensure skill and voice state-machine tests are green on exact commit.
2. Implement durable offline conversation threads in the existing TradeFlow AI page (migration/restore/revision/permission tests).
3. Add explicit mic capture, VAD and streaming ASR adapters; no background capture.
4. Connect current Qwen inference with deterministic finance claims and token/latency validation.
5. Add TTS and barge-in to the same thread; test human-like interaction against measurable device-specific goals.
6. Add typed, explicitly approved business actions to the existing command registry; test revocation and uncertain acknowledgments.
7. Run private physical-phone acceptance, commercial infrastructure gates and real contractor pilots; only then consider billing or release.

**No deployment, production database migration, identity changes, live merchant operations or PR merge are authorized.**

## Coordination with the separate TradeFlow Manager

The product/engineering manager's skills are indexed in [TradeFlow Manager Skills](TRADEFLOW_MANAGER_SKILLS.md). The Manager sets evidence-backed ICP/value priorities, triages agent work, validates commercial needs and owns release/go-no-go advice. The **existing Principal AI Engineer** retains sole code-writing ownership and exact-SHA implementation verification. This is a management layer around the same application and branch—not a second development team or autonomous background executor.
