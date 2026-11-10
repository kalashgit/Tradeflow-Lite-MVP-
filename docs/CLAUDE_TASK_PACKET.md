# Task packet contract for Claude Code

Every implementation session works on **one** packet. A title like "make AION
smarter" is insufficient until it specifies an observable improvement.

## Required fields

| Field | Required answer |
| --- | --- |
| Task ID / track | Product (TF) or research (AION), one objective |
| Why now | Customer value or a falsifiable scientific hypothesis |
| Exact baseline | Git branch, current remote SHA, existing implementation and tests |
| Allowed edits | Path scope and integration owner; conflicts checked |
| Inputs and outputs | Versioned fields, evidence, revisions and authorization contract |
| Non-goals | Excluded features and no real-world actions |
| Positive tests | The expected working path |
| Negative tests | Stale, cross-tenant, unknown, missing, changed or adversarial conditions |
| Independent acceptance | Holdout/CI/physical pilot, thresholds set before implementation |
| Stop and handoff | Concrete failure/approval gates and report artifact |

## Current priority — ready-to-paste AION Genesis v1.0 launch

> You are the implementation lead for **AION Genesis v1.0: Unified Intelligence
> and Experimental Control Plane** in `kalashgit/Tradeflow-Lite-MVP-`.
> Start from the current verified head of `research/aion-v06-qwen-bridge` and
> create a fresh isolated implementation branch. Read root `CLAUDE.md` and
> `AGENTS.md`, then `docs/AION_V1_CLAUDE_EXECUTION_MANDATE.md`,
> `docs/AION_CLAUDE_EXECUTION_PLAYBOOK.md`, and the scoped
> `research/aion-v06/CLAUDE.md` and `docs/RESEARCH_GATES.md`.
>
> **Implement, do not stop at a proposal.** Audit existing modules and the
> 74-test historical baseline once, state a concise dependency plan, then
> deliver the mandate's **Work Package 1** (one portable, typed
> observe–investigate–propose–outcome runtime) and a **minimal working Work
> Package 2** (three unfamiliar/shifted simulation families; independent
> held-out referee; seed-controlled matched evaluation; full outcome/failure
> ledger; simple promotion gate; scorecard and phone-readable standalone HTML
> report). Reuse the current engine, evaluators, CLI and dashboard machinery;
> preserve prior results and unit tests. Add tests for stale evidence,
> corrections, tenant isolation, abstention, unknown facts, hidden-truth
> leakage, invalid candidates, deterministic replay and report integrity.
>
> Demonstrate a complete experiment with one documented CLI command and
> independent baseline comparison. Report **decision quality**, **learning
> gain**, and **validated research throughput** separately; never invent a
> 100× intelligence gain, live model learning, paid-model execution or real
> contractor value. If both mandatory packages are complete and verified,
> begin the mandate's Work Package 3 as a bounded, evaluated stretch. Maintain
> strict research-vs-product boundaries: no real data, external action,
> production edit, deployment, merge, credential use or hidden-judge exposure.
>
> Preserve usage with concise incremental checkpoints; implement the first
> safe vertical slice immediately. On completion, return exact source SHA,
> changed files, interfaces, runnable commands, tests, genuine metrics,
> negative findings, resource costs, unresolved gates and the next packet.
> Publish a draft PR only when branch ownership and authorization permit;
> otherwise leave the tested isolated branch and an exact handoff.

The earlier AION-100 alternative-generation packet below is a **follow-up**, not
the first task while the unified runtime and research laboratory are missing.

## Deferred Claude session — AION option discovery

> Open `kalashgit/Tradeflow-Lite-MVP-` on the isolated
> `research/aion-v06-qwen-bridge` branch. Read root `CLAUDE.md`, `AGENTS.md`,
> `docs/AION_CLAUDE_EXECUTION_PLAYBOOK.md`, this task packet, and
> `research/aion-v06/CLAUDE.md` plus `docs/RESEARCH_GATES.md` beneath it.
> Reconcile the exact current branch head and tests before editing.
>
> **Task AION-100: candidate option discovery, v1.0.** In the portable
> Python engine, propose a bounded, structured alternative-generation
> mechanism that can extend the v0.9 predefined decision axes without
> inventing business facts or viewing hidden evaluator truth. Start with a
> deterministic baseline and a pluggable LLM interface; do not call an
> unconfigured model or claim learning. Keep electrical-specific logic in
> the domain pack. Define an independent expanded option oracle/test set and
> measure valid novel option recall, evidence soundness, latency, cost and
> owner-goal decision regret. Add negative tests for missing evidence,
> invalid options, duplicate alternatives, malicious model text, excessive
> search and abstention. Compare the frozen v0.9 baseline and preregistered
> shifted conditions, and report failures even if the candidate loses.
>
> Implement one safe, reviewable research increment only. No production
> TradeFlow edits, no actual external actions, no merge or deploy. Publish
> to a new isolated branch/draft PR **only if authorized and branch ownership
> is clear**; otherwise provide an exact patch and test report. Return the
> changed files, commit SHA if published, test/CI evidence, experimental
> verdict, limitations and the next specific research gate.

## Ready-to-paste first Claude session — TradeFlow MVP

> Open the existing TradeFlow repository; read `AGENTS.md`, root
> `CLAUDE.md`, `docs/AION_CLAUDE_EXECUTION_PLAYBOOK.md`, the current
> engineering ledger, canonical roadmap and relevant `.agents/skills`.
> **Task TF-MVP-100: read-only sellable-journey gap audit.** Reconcile
> current `feature/cloud-record-discovery` head, draft PR #16 and other
> active integration ownership, source files, exact CI and the H03 device
> sheet. Trace this single journey: job estimate -> crew job-coded
> labor/material -> offline recovery -> estimate-vs-actual evidence ->
> reviewed change-order/invoice draft -> approval/receipt. For each stage,
> report "coded", "local test verified", "device verified", or "blocked",
> with exact files/tests. Identify the smallest dependency-ready missing
> stage, the owner-visible benefit, acceptance tests and safeguards.
>
> **Do not implement or deploy product changes in this first session.**
> Return one proposed bounded implementation packet, precise files,
> non-goals, independent evidence and founder decisions required. Do not
> claim real customer outcome proof from synthetic fixtures.

## Review rubric

**Accept** when new code obeys scope, passes current regression coverage,
improves the prespecified metric on a fresh independent evaluation (where
claimed), has no permission/safety regressions, and reports real unresolved
gates. **Revise** when tests or evidence are incomplete. **Reject** when
the apparent gain comes from leaked hidden data, cherry-picked cases,
unreviewed external action, or fabricated success.
