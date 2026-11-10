# AION Genesis × TradeFlow — Claude Code execution playbook

Status: founder-facing engineering framework, **not** authorization to deploy,
merge, operate against customers, or claim research breakthroughs.

## Product thesis and the two scoreboards

**Product goal:** TradeFlow becomes a reliable operating companion for the
owner of a small US electrical contracting company. It helps the owner see
what matters, investigate connected operations and approve concrete work.
The UI, text and eventual voice interface lead to the **same** permissioned
commands and audit receipts. It still delivers value when AI is unavailable.

**Research goal:** AION becomes a portable intelligence that can build a
grounded situation model, explore options, simulate likely consequences,
choose/abstain according to goals, learn from observed outcomes and transfer
to unfamiliar domains. TradeFlow is **one** domain plugin and experimental
client, not the identity of the intelligence itself.

Keep the scoreboards separate:

| TradeFlow product evidence | AION research evidence |
| --- | --- |
| Owner completes a real workflow with minimal repeated data entry | Correctly cites and interprets a current synthetic situation |
| Job-coded labor/material entries survive offline and sync conflicts | Candidate generator finds valid, diverse options without leaking answers |
| Estimate-vs-actual is traceable and mathematically correct | Planner outperforms frozen baselines under matched hidden outcomes |
| Draft change order or invoice is reviewable, not silently sent | Memory-on improves on memory-off in preregistered holdouts |
| Safe approval, receipt, permissions and physical-device acceptance | Better decisions transfer to shifted distributions and other domains |
| Actual owner time saved, errors avoided or cash readiness improved | Error bars, calls, latency, cost, failed cases and abstentions reported |

## First sellable vertical slice — provisional, not proven market fit

**Candidate buyer:** Austin-area owner-led electrical contractor, approximately
5–15 employees, small commercial fit-outs/projects plus service work. This is
the existing repository's *hypothesis*, not a validated customer list.

**One coherent journey:**

1. Owner/office creates or selects a job and its original estimate.
2. Crew submits time and material usage with a job code, preferably only once.
3. System preserves those records offline and reconciles authorized changes.
4. Owner sees estimate-versus-actual, source records and missing information.
5. Intelligence flags a relevant exception and proposes a specific next step.
6. Owner reviews a change-order/invoice-ready draft and explicitly approves
   any consequential command; a durable receipt records the actual outcome.

Do not assume these stages are all working. Inspect live source, CI and
independent device evidence to determine which stages pass.

**MVP acceptance proposal:** at least three representative owners attempt the
same end-to-end scripted workflow (with consent and a separate pilot plan);
record success rate, completion time, duplicate entry count, source accuracy,
approval errors and their willingness to pay. The real-device authorization
and offline-recovery gates in `docs/H03_PHYSICAL_DEVICE_EVIDENCE_SHEET.md`
remain NO-GO until separately provisioned and authorized. No synthetic
scenario or attractive demo replaces an actual buyer study.

## Division of responsibilities

| Component | Responsibility | Must never do |
| --- | --- | --- |
| AION core | Evidence, case state, bounded option search, simulation policies, memory research, risk/abstention | Own a contractor DB, read hidden test rules, perform production writes |
| TradeFlow domain adapter | Translate authorized project/crew/procurement facts and owner goals into typed AION cases | Hide missing evidence, promote simulated costs as real |
| TradeFlow application | Existing offline records, GUI/voice/text, role permissions, approvals and receipts | Introduce a second independent write/approval system |
| Experiment referee | Frozen worlds, hidden outcomes, matched comparisons and holdout verdicts | Be callable by the planner or tune its own grading after seeing results |
| Founder | Priorities, product tradeoffs, pilot consent, consequential approvals | Be required to manually copy large codebases between workers |

One accountable writer owns any shared branch at a time. Read-only parallel
review is possible, but never concurrent uncoordinated editing of the same
files. Use existing `.agents/skills/` for TradeFlow specialist procedures.

## Recommended engineering sequence

### Track A — sellable TradeFlow increment

**A1: Status reconciliation.** Recheck current feature branch, draft PRs,
contractor journey, exact CI and H03 blockers. Produce a gap list, not a new
application or duplicate engine.

**A2: Finish one transaction-quality job-cost journey.** Using current
record/authorization contracts, ensure crew labor/material entry reaches a
reviewable estimate-vs-actual dossier. Preserve offline-first correctness,
source lineage, tenant isolation and draft preservation on conflict.

**A3: One useful intelligence-to-approval path.** A grounded exception card
explains the issue, source revision and expected downstream effect; it may
propose an allowlisted draft but must route through the existing approval and
receipt machinery. A deterministic rule is acceptable before real AION works.

**A4: Pilot and pricing evidence.** Independent phone tests and controlled
owner interviews establish whether the workflow saves enough effort or risk
to justify a paid product. Founder approves real contact, pricing and release.

### Track B — AION intelligence research

**B1: Option discovery.** Beyond the v0.9 fixed 12 choices, propose new
structured alternatives from evidence and constraints, deduplicate them,
validate feasibility and measure *distinct valid alternatives found* against
an independent broader possibility set. Abstain when facts are insufficient.

**B2: Robust planning.** Compare expected-value ranking with stress-tested
scenario ensembles, explicit unknowns, risk bounds and a no-action baseline.
Aim to reduce the known shifted-world harm rate **without** overfitting the
revealed 200-world fixture or sacrificing ordinary-case value.

**B3: Outcome-grounded learning.** Retain observations, predictions and
outcome receipts as separate objects; update calibrated effect estimates, not
business facts, from experience. Show a memory-on/no-memory comparison and
negative controls where memory should not help.

**B4: Model tournament.** Test Qwen and any later configured model under
identical evidence, schema, call budget, latency and cost. Compare with
deterministic rules. Require real inference traces before a model-learning
claim. A more expensive model is admitted only for measured marginal benefit.

**B5: Portability.** Run the same core on a second, independently specified
domain pack and unfamiliar causal regimes. Domain-specific prompts are not
evidence that the generic core transferred learned behavior.

### Integration gate, not a blanket coupling

Define a narrow read-only request/response adapter first:

- Input: tenant/actor scope, authorized evidence references/revisions,
  observed fact timestamps, owner weights, constraints and decision deadline.
- Output: options with evidence, estimates, uncertainty, feasibility,
  alternatives, confidence/abstention rationale, model/runtime trace ID and
  **`pending_human_review`** status.
- Execution: ONLY the existing TradeFlow command system may translate an
  approved draft into an authenticated action, rechecking current permissions
  and source revisions. The AION service cannot call an action endpoint.

## Claude Code operating rhythm

1. Read root `CLAUDE.md` (which imports `AGENTS.md`), this playbook, the
   relevant specialist, and `docs/CLAUDE_TASK_PACKET.md`.
2. Reconcile exact remote SHA, existing code/tests, current PR ownership,
   founder decisions and blockers. Never trust an old handoff's counts.
3. Select **one** bounded task packet. Before edits, state testable behavior,
   allowed files, threats, independent evaluation and stop conditions.
4. Implement with focused regression tests. No general "refactor everything"
   sessions, surprise dependencies, cloned substitute applications or hidden
   production side effects.
5. Run local tests, inspect failures, preserve negative results. Publish only
   to the authorized isolated branch/draft PR and verify the exact remote SHA.
6. Report **Implemented / Verified / Not verified / Next** with links and
   evidence. Record an updated handoff; no claimed background execution.

Use Claude Code for high-context implementation, audit and test generation;
use deterministic CI/referee rules to judge acceptance. An AI coding model
does not get to grade its own intelligence improvement.

## Stop conditions

- Cross-tenant retrieval, prompt/tool privilege escalation, unauthorized
  action, unverified write success, missing audit receipt or lost offline draft.
- Simulator outcome/oracle data visible to the planner before its decision.
- New test set inspected and then reused as if still unseen.
- Silent customer communication, spend, deployment, database migration,
  role change, billing change or merge without the founder's approval.
- Inability to identify exact tested source, reproducible run or honest
  difference between synthetic success and real-world proof.

This document is an execution contract, not a report that the work is complete.
