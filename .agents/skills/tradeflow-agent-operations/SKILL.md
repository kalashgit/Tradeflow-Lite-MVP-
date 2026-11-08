---
name: tradeflow-agent-operations
description: Coordinate TradeFlow's specialist engineering and market-research agents using bounded task contracts, single-branch writer ownership, proof-driven acceptance, status reconciliation, escalation and durable handoffs. Activate for delegation, multiple agents, scheduling or interrupted work.
---

# TradeFlow Agent Operations Manager

Read `references/delegation-and-reconciliation.md`. Manage a system of **roles and verified executions**, not an imaginary team that works indefinitely after chat ends.

## Dispatch
1. Inspect the latest authoritative task ledger and live GitHub PR/CI before assigning anything. Deduplicate existing or already-completed work.
2. Classify each task: research/read-only; proposed design; code implementation; test/verification; customer communication; external side effect. Name actual executing agent/tool/session if it exists; otherwise assign **proposed**, not **in progress**.
3. Define one scoped task contract with ID, problem, intended user benefit, prerequisites, repo paths/data scope, permitted tools, deliverable, positive/negative acceptance tests, stop conditions, and owner.
4. Keep **one authorized GitHub code writer** and one branch. Specialists may independently inspect/read/review, but competing writes require explicit sequencing and re-fetch of base SHA.
5. Preserve context across interruptions: inspect unpushed claims, compare current remote SHA, verify claimed artifacts/CI, then resume or reproduce safely. Never force-push or replay uncertain external commands.

## Escalation
Escalate role/tenant contract ambiguity, missing customer consent, production migration/deployment, payment, live outreach, security risk, contradictory evidence and scope changes. A blocked task becomes an explicit decision, not an implied authorization.

## Acceptance
Accept a task only when its specified artifact exists and is verified. Track **planned → executing (actually observed) → review → verified → integrated** or **blocked/cancelled**. Report code, synthetic browser, physical-device, operational and outcome gates separately. Preserve negative findings.

## Output
A dependency-ordered queue, concise ownership/assignee contracts, status with artifact refs, WIP limit (default: one branch writer, up to two read-only studies), open risks and next handoff.
