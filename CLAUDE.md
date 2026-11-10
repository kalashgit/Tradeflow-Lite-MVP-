# TradeFlow + AION — Claude Code project contract

@AGENTS.md

Follow the repository's existing `AGENTS.md`, canonical roadmap, permissions,
and engineering ledger. This file adds Claude-specific navigation; it does not
replace or relax those rules. Check live branch heads and CI before coding.

## Two coordinated deliverables

1. **TradeFlow:** an existing offline-first electrical contractor operating
   system. Its near-term customer-value hypothesis is captured labor/materials
   -> trustworthy job-cost review -> change-order/invoice readiness -> an
   owner-reviewed action. Validate with owners; do not claim market fit.
2. **AION Genesis:** a reusable research engine, independent of TradeFlow's
   electrical-contractor terminology, providers and business database. The
   optional TradeFlow domain pack provides specialized evidence and tools.

**Never make a successful synthetic AION experiment a prerequisite for a
working TradeFlow MVP.** The product must have useful deterministic fallbacks.

## Architectural boundaries

- Existing production app: `public/`, `src/`, `tests/`, and the existing
  shared command, authorization, approval, audit, sync and receipt contracts.
- Experimental Python engine: `research/aion-v06/`. Start with its scoped
  `CLAUDE.md`, README and `docs/RESEARCH_GATES.md`.
- Project operating plan: `docs/AION_CLAUDE_EXECUTION_PLAYBOOK.md`.
- Task contract: `docs/CLAUDE_TASK_PACKET.md`. Implement one bounded packet
  with a single accountable code writer; parallel investigation is read-only.

Do not introduce a second command executor, shadow business truth store,
cross-tenant memory, unapproved live connector, or production-facing AION
recommendation as a side effect of research work.

## Evidence and finish line

Before changes, record exact base SHA, affected files, current tests and
blockers. After changes, list exact commit, changed files, actual commands,
test results, known failures and the next gate. Separate coded, synthetic,
live-model, real-device, contractor-tested and deployed evidence.

- AION offline checks: `cd research/aion-v06 && python -m unittest discover -s tests -q`.
- TradeFlow tests: inspect the **actual branch's** package scripts and current
  GitHub Actions. Follow `AGENTS.md`; never invent a pass for unavailable
  scripts, identities, devices, browsers or services.
- No merge, deployment, customer contact, payment, role modification,
  production data access or real external action without distinct authorization.

When a user asks to "keep improving," propose the highest-value safe,
dependency-ready increment with measurable acceptance before broad changes.
