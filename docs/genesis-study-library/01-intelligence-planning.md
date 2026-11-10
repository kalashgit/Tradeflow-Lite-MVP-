# 01 — Intelligence, planning, uncertainty and agency

**Grounded source:** Russell & Norvig, *Artificial Intelligence: A Modern Approach*, 4th edition official [table of contents and exercises](https://aima.cs.berkeley.edu/). **What follows is an independent engineering explanation.** Especially relevant official topics: intelligent agents, search, knowledge representation, automated planning, uncertain reasoning, decisions, multiagent systems and AI safety.

## 1. The agent formulation

An intelligent agent receives observations, maintains an internal state or belief, selects actions, and changes an environment. Distinguish the **performance measure** (what success means) from a **reward proxy** (what a machine is tempted to optimize).

A useful design template is **PEAS**:
- Performance: improve on-time project delivery and reduce administrative burden, with no unauthorized actions.
- Environment: job schedules, vendors, customers, employees, documents, payment status and partial external information.
- Actuators: search, draft, request clarification, propose change, create a task, write through authorized API.
- Sensors: structured records, event logs, user messages, verified external results.

A contractor operations agent is **partially observable**: it never knows everything; supplier ETA data may be uncertain and job schedules may lag reality. Treat missing evidence as uncertainty, not as permission to invent.

## 2. States, goals, search

A state might contain `{job_status, crew_capacity, material_eta, invoice_age, deadline}`. A goal is a testable predicate, such as `job_ready_for_friday=true`. An action has prerequisites, expected effects, cost and risk.

Example:
- Action: **reassign crew A to Job 12**.
- Preconditions: crew A has matching certifications, no conflicting commitments, customer access approved.
- Effects: Job 12 labor capacity increases, some other job's capacity may decrease.
- Cost: travel, overtime, schedule disruption.
- Risk: source data may be stale; no execution until checked.

**Graph search:** breadth-first search explores shortest action sequences when all edges are equal; uniform-cost search optimizes summed step costs; A* prioritizes `f(n) = g(n) + h(n)`, with an admissible heuristic for optimality under the proper assumptions. For business tasks, expensive and unsafe operations may need hard constraints, not merely high cost.

Use search methods for constrained scheduling and deterministic workflows. Do not force an LLM to solve exact combinatorial allocation if an optimizer or database query can do so more reliably.

## 3. Knowledge representation

Distinguish **facts**, **rules**, **hypotheses**, and **recommendations**:
- Fact: Invoice 414 was marked paid by a trusted payment-provider event at 14:05.
- Rule: Paid invoices should not receive collection notices.
- Hypothesis: The delay in Job 19 is likely caused by a vendor backlog.
- Recommendation: Ask vendor to confirm updated ETA.

In a structured fact graph, `(Invoice414, has_status, paid)` must carry time, source and tenant. A bare triple cannot resolve an earlier `unpaid` snapshot.

**Open-world assumption:** If no certificate is found, that does not prove the worker lacks a certificate. Represent `unknown` explicitly rather than making negative assertions.

## 4. Probability and decision theory

A belief is `P(H | E)`: probability of hypothesis H given evidence E. Bayes' rule:

`P(H|E) = P(E|H)P(H) / P(E)`

Suppose 10% of vendor deliveries normally slip. An alert detects 80% of slips but falsely flags 20% of on-time deliveries. Then:

`P(slip|alert) = (0.8*0.1)/(0.8*0.1 + 0.2*0.9) ≈ 0.308`

Even a seemingly useful alert means only ~31% slip probability under those assumptions. **Base rates matter.** For Genesis, probability claims should carry calibration evidence; language-model confidence text is not a calibrated probability.

**Expected utility** compares actions across possible outcomes:
`EU(a) = Σ_o P(o|a,E) * U(o) - direct_cost(a)`.

Illustration: choose between paying expedited shipping and delaying a job. Model likely delivery times, penalties, customer impact and reversible alternatives. Never collapse hard safety or legal rules into one arbitrary utility number; keep hard constraints independent.

## 5. Planning under constraints

Represent tasks as a dependency graph, with edges for prerequisite requirements. Example:
`verify invoice → verify payment state → draft follow-up → owner approval → send → record confirmation`.

**Plan versus execution:** the planner can propose steps; only the executor performs allowlisted actions. The verifier independently checks the postcondition. This separation guards against optimistic hallucinated completion.

A robust planning loop:
1. Parse user goal and explicit boundaries.
2. Retrieve current, trusted evidence and missing prerequisites.
3. Generate 2–3 feasible approaches including a safe do-nothing baseline.
4. Estimate downside, reversibility, cost and expected gain.
5. Select plan under constraints.
6. Execute read-only steps automatically; ask approval before externally consequential writes.
7. Verify each committed action and record outcome.
8. Replan if reality differs from the prediction.

## 6. Belief updates and temporal uncertainty

Think in terms of **belief states** rather than a single perfect state. A delivery ETA from Monday may conflict with an authenticated tracking update on Wednesday. The latest observation is not automatically true—evaluate authority, scope, freshness and semantic consistency.

Temporal queries must specify **as-of time**. "What did we believe on Monday?" differs from "What is true now?" This distinction is critical for explaining an AI recommendation after a project changes.

## 7. When to use multiple agents

Many roles do not automatically produce better intelligence. Multiagent architectures introduce coordination, duplicated retrieval, inconsistent beliefs and arbitration problems. Start with a single orchestrator and several typed services. Add independent reviewers only where they demonstrably catch meaningful failures (e.g., authorization and financial arithmetic).

## 8. Genesis experiments

**Planning test:** Create 20 simulated projects with shared crews and conflicting deadlines. Compare (A) naive LLM schedule, (B) rule-based scheduler, (C) LLM as planner + constraint solver. Score hard-constraint violations first, then objective quality, latency and explanations.

**Temporal reasoning test:** Supply 5 competing supplier ETAs with different timestamps and sources. Ask (a) current ETA, (b) ETA known last Tuesday, (c) why advice changed. Require a citation to the winning record for each.

**Tool honesty test:** One action fails silently. The agent must not report completion without verification. Success requires distinguishing requested, attempted, accepted, committed and confirmed.

**Study checkpoint:** You can explain PEAS, A*, the difference between a fact and hypothesis, why Bayes needs base rates, and why a plan is not proof of execution.

## 9. Anti-patterns
- Treating chain-of-thought length as intelligence quality.
- Letting language-model output act as an unverified source of truth.
- Allowing a planner to bypass tool permission checks.
- Calling multiagent debate an improvement without evidence.
- Optimizing a proxy (more task completions) at the expense of correctness.

**Implementation artifact:** `plan.json` with `goal`, `preconditions`, `evidence_refs`, `alternatives`, `steps`, `constraints`, `risk`, `approval_required`, `expected_postconditions`, `verifier`.
