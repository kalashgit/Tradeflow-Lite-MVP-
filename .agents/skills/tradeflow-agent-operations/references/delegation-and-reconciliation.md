# Delegation, Handoff and Reconciliation Contract
## Task record example
TF-M-001 | status=planned | lane=app | assignee=principal engineer | target=verified job labor-to-invoice workflow | dependency=current source | scope=existing GUI/command path | positive=owner sees cited variance | negative=member blocked from financial write | evidence=commit + exact CI | stop=unsafe assumption.
## State machine
planned → assigned (real agent/session) → in-progress (observed) → review → accepted/blocked/cancelled. 'Proposed' is not 'running'; a task is never 'done' because it was described.
## Collision prevention
Check branch before assignment and before write. One code writer at a time. Read-only reviewers can work concurrently. A rejected write or moving SHA means re-fetch; never force-push.
## Acceptance gate
Deliverable located and opened, exact commit, meaningful tests including negative cases, no hidden broken checks, ledger entry updated, safe nonproduction scope. If tool unavailable, mark unverified with reason.
## Escalation matrix
- Owner: major product pivot, prices, external promises/spend, merges and deployment.
- Principal engineer: implementation, tests, code correctness, dependency choice.
- Security/quality gate: role/tenant leakage, stale approval, unknown external state.
- Customer discovery: reality of pain and willingness to pay.
## Interrupted execution
First reconcile current remote, tool evidence and uncertain local work; do not replay unknown external writes. Remote changes win over unsupported past claims. Record lost context as missing, not guessed.
## One-page handoff
As-of date, PR/ref/SHA, read-only links, verified gates, current ICP hypothesis, top 5 dependency-ready tasks, blocked approvals, owner next action, account/work-product access boundaries. No raw PII.
