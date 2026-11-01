# TradeFlow Manager — Operational Takeover (2026-11-01)

**Scope:** strategy and management handoff, not a code-release approval.

## Identity and continuity
Product: existing TradeFlow offline-first electrical contractor operating system. Repo `kalashgit/Tradeflow-Lite-MVP-`; active development branch `feature/cloud-record-discovery`, base `feature/library-universal-intake`, draft PR #16. **Always re-fetch current head, source, CI and `AGENTS.md`**; no SHA below remains permanently current. Do not merge, deploy, change billing, touch production D1, send messages or provision identities without explicit approval.

## Operating decision
The provisional primary user is an **owner-led 5–15 person small commercial electrical contractor** around Austin (TI, fit-outs, renovation), with commercial maintenance/service as secondary and residential as tertiary. A coherent owner view of verified **job labor/material costs, bid variance, change-order status and invoice readiness** is the first value hypothesis. Owner/GM buyer, office/estimator/field end users. The commercial segment's relative profitability is not empirically proven here.

## Evidence discipline
Research memo and model are available in ChatGPT Library `/TradeFlow/`. November 1 research is **conditional/validate first**; national numeric TAM, Austin SAM, paid demand, unit economics and interview prevalence are unverified. Do not equate permits or 15 local seed companies with software buyers, Census establishments with firms, or fictional sales funnels with observed conversions. Current original contractor pain register: 0/62 formally retired. See `docs/TRADEFLOW_V1_1_PRODUCT_EVIDENCE.md` for code vs physical-product vs operating vs outcome gates.

## Manager's specialist skills
Start at `docs/TRADEFLOW_MANAGER_SKILLS.md`: principal manager, agent operations, product strategy, customer discovery, value engineering, pilot-and-sales, release governance, daily management. Each directory has `SKILL.md`, `agents/openai.yaml` and one reference contract. Engineering code tasks use existing `.agents/skills/tradeflow-principal-ai-engineer/` and nine specialist roles. These repo files are **not** account-installed skills or running agents.

## Next-day five
1. App: choose one already dependency-ready, real-GUI job-cost/invoice-readiness gap only after inspecting current implementation; define tests, avoid duplicate completed flows.
2. AI: prioritize source-grounded financial explanations in the existing UI; one shared saved conversation/voice path, no invented TTS deployment.
3. Verification: capture current exact remote SHA, CI, ten contractor detector, storage and Chromium status, plus physical/role gates.
4. Market: verify first 20 Austin commercial owner prospects by current identity, headcount band and work mix; conduct consented discovery, record rejections.
5. Commercial: practice 3 skeptical buyer scenarios and draft a bounded paid pilot offer with explicit offline, integration and support limits. Do not contact prospects without authorization.

## Four-week validation
Days 1–5 verify 100 distinct Austin prospects; days 6–12 observe workflows; days 13–19 compare competitors on identical fixtures; days 20–25 seek genuine paid commitments; days 26–30 go/no-go. Proposed gates 8/20 substantive owner pain, 5/8 observed task improvement without extra admin, 3/8 qualified paid commitments are **experimental thresholds**, not benchmarks. Update to observed evidence and real operating capacity.

## Manager authority and handoff
Research, design, plan, grade tests, propose changes, prepare roleplay and commit authorized nonproduction documentation. No unapproved customer outreach, subscription activity, financial transaction, public deploy, PR merge, secrets or live database change. Every task must name assignee, source, implementation/artifact, positive/negative tests, due/dependency, acceptance, risk and founder approvals. New successors must first verify current GitHub rather than use historical Sha.

## Reference locations
- GitHub strategy/skills index: `docs/TRADEFLOW_MANAGER_SKILLS.md`
- GitHub engineering: `AGENTS.md`, `docs/TRADEFLOW_AI_ENGINEERING_SKILLS.md`, `docs/TRADEFLOW_ENGINEERING_TASK_LEDGER.md`, `docs/TRADEFLOW_ENGINEERING_HANDOFF_2026-10-30.md`
- Google Drive manager handoff: https://docs.google.com/document/d/1juVNzHjK-KBlE_kCCuvzX1R7sNJnmr_9Bm3XsN2FZpg/edit
- Google Drive folder: https://drive.google.com/drive/folders/1_hPJ-68gjOPB3rGvlTk5KMPKfofIhWQK
- ChatGPT Library `/TradeFlow/tradeflow_research_report.md` and `tradeflow_market_model.xlsx`

**Truthfulness rule:** scheduled automation only exists if tool actually created and returned an ID; no 'agents working while the phone is off' without running system evidence.
