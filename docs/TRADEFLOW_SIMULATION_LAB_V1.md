# TradeFlow — Contractor Simulation Lab v1

## Objective
Shorten the engineering feedback loop by testing the real UI, Master Intelligence and business workflows against repeatable **synthetic** US electrical contracting firms. This does not constitute customer acceptance.

## Existing infrastructure to reuse
- `scripts/verify-contractor-workflows.cjs`: Playwright browser scenarios for ten contractor pain points.
- `automation/run-ten-pain-points.cjs`: regression evidence generation; passing code tests do not retire the underlying contractor problem.
- `public/conversation-store.js`: device-local threaded conversation store.
- `tests/iphone-preview-isolation.test.cjs`: guarantees that the protected iPhone demo stays disconnected from production databases and server AI.

## Test firms
See `automation/simulator/businesses.v1.json`. The 5-, 12- and 20-employee fixtures represent progressively more complex quoting, job costing, scheduling and bid-readiness operations. All names, contact details and events are fabricated.

## Agent workflow
1. **Product lead (ChatGPT/Codex):** maintain issue backlog, user stories, acceptance criteria and traceability to actual contractor pain points.
2. **Implementation (Claude Code or Codex cloud):** implement one bounded GitHub issue in its own branch; create tests and a PR. No direct production deploy.
3. **Independent QA (the other model):** inspect changed code, challenge unsafe assumptions, run simulated business cases and confirm what the UI actually displays.
4. **GitHub Actions:** run deterministic unit tests, browser workflow tests, schema checks, offline/online isolation checks, accessibility and mobile-size smoke tests. Export per-commit screenshots and JSON reports.
5. **Human product owner:** accept or reject evidence; explicitly approve merges, external messages, invoice actions and production access.

## Scenario execution contract
Each scenario has synthetic inputs, expected **signals** and expected **proposed decisions**. The evaluator must compare observable app outputs with those expectations; do not score by matching exact LLM prose. Fail an outcome if the agent invents evidence, claims to have taken an action, or modifies records without permission.

## Acceptance metrics
- Conversation write/reload success: 100% across fresh browser, refresh, Safari mobile, offline.
- Correct detected signals: >=95% of eligible fixture signals; no fabricated confirmations.
- Workflow task completion: >=90% across 10 canonical contractor scenarios.
- Unauthorized external actions: **zero**.
- Traceable citations/evidence for business recommendations: 100% where factual source data is required.
- Mobile UI: no clipped input/composer, no blocked controls at 390px and 430px widths.
- Measured time saved versus a manual baseline, separately per contractor task.
These are **targets**, not achieved results.

## Immediate staged implementation
**Gate 0:** repair and regression-test the actual local conversation save failure, verify on iPhone.
**Gate 1:** seed the three synthetic firms through an explicit test-only importer or isolated browser profile; verify database schema and complete reset.
**Gate 2:** make the intelligence layer answer 10 high-value business questions with tool result references and a read-only audit trail.
**Gate 3:** add approval-gated actions (quotes, follow-ups, schedule updates) with replay protection.
**Gate 4:** iterate GUI only after evidence from realistic tasks; run phone-size screenshots on every PR.
**Gate 5:** collect 3-5 real electrical contractor interviews without putting real customer data in the fixture repository.

## Engineering guardrails
- A ChatGPT/Claude subscription alone is not an unattended GitHub Actions API credential. Configure supported coding-agent integrations and budgeted credentials separately before enabling scheduled agent runs.
- GitHub is the source of truth. Each worker takes one issue, writes a PR, and reports evidence; never have two agents edit the same branch simultaneously.
- Preserve the live welcome-orb interface; maintain strict separation between local offline knowledge and connected online reasoning.
- The private preview remains protected by Cloudflare Access. Synthetic data only; never clone actual customer records.
- Do not report a feature as working from tests alone. Require the user journey in a real browser and actual iPhone where hardware functionality matters.

## Recommended next GitHub issues
1. Persist and reload conversation on iPhone; add Safari browser test, a visible recovery state, and no silent loss.
2. Build simulator import/reset UI available only in isolated test environments.
3. Run the 3 firms through the 10 contractor tasks, producing JSON evidence and screenshots.
4. Add command planner with read-only tool calls and per-action approval prompts.
5. Test orb and chat as a single conversation with voice interruption/continuation tests.
