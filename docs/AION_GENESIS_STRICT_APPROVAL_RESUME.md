# AION Genesis — Strict stale-approval resume (research prototype)

**Status:** Research-only, opt-in, no production execution, no learned model weights and no permission grants.

**Upstream inspiration:** [LangGraph v1.2.20](https://github.com/langchain-ai/langgraph/releases/tag/1.2.20), specifically the unique per-interrupt IDs from [#9589](https://github.com/langchain-ai/langgraph/pull/9589) and the opt-in strict resume semantics from [#9574](https://github.com/langchain-ai/langgraph/pull/9574). This work is a Genesis-native defensive adaptation, **not** a copy of or a dependency on LangGraph.

## Why this matters

Genesis plans tasks using uncertain and sometimes delayed business information. Between a human approval and action execution, the underlying job may change: invoice amount, approval revision, workflow checkpoint or authority may be revoked. A model must **never** treat an old affirmative response as authorization for the *new* action.

The existing `asil_v26.safety.RiskGovernor` checks fresh authority and resources but does not bind a previously pending human approval to the exact question it answered. The new `gml.strict_approval` host-side protocol addresses that missing resume boundary.

## The intended contract

1. A **trusted host** proposes a bounded `ActionIntent` and typed tool arguments, and opens an interrupt with a unique random ID. The ID is bound to a tenant scope, workflow, per-interrupt key, checkpoint, observed world tick, state revision, action fingerprint and expiry.
2. The user interface presents the exact proposed operation and interrupt ID. No raw natural-language approval or non-ID positional answer is accepted.
3. A trusted host supplies a **fresh** `ResumeContext` (authenticated reviewer ID, current authoritative revision, checkpoint and time) to `StrictApprovalLedger.resume({id: "approve"}, ...)`.
4. The ledger uses a SQLite `BEGIN IMMEDIATE` transaction to verify the still-pending ID. A stale, duplicate, changed, unknown, empty or ambiguous answer fails **without mutating the ledger**. One successful resume consumes the interrupt permanently.
5. Approved receipts are verified against persisted host state before being used by `guard_resumed_action`; rejected or fabricated receipts are not permitted. That preflight calls the existing `RiskGovernor` to reject stale authority, revoked permissions, capacity shortfalls, regime shifts and ambiguous commits.
6. The preflight returns only `eligible_for_atomic_authorization_recheck`, **never a committed action**. The external transaction executor must independently reauthorize and check the current state *atomically with the effect*. If that executor is unavailable, no action executes.

The model can observe a safe *summary* of pending/rejected state provided by the host and learn to request renewed approval when its assumptions change. It cannot mint approvals, reviewer identity, trusted time, revisions, or permissions.

## Precise limitations

- The SQLite database is a **research checkpoint ledger**, not a production credential system.
- `reviewer_authorizer` is an injected function. An actual TradeFlow adapter must authenticate the real reviewer, verify role and business scope, and prevent the model from supplying the authorizer. Identity strings alone do not authenticate anyone.
- Current timestamp, revision and checkpoint values must come from a trusted host-side state store, never from Qwen. The prototype cannot attest them by itself.
- The research preflight does not implement the production executor's atomic permission check and cannot prevent a race after preflight. Production integration requires a durable authenticated transaction boundary and idempotent command registry.
- This is application/workflow security, **not** machine-learning training. Do not claim a new learned capability from these tests.
- Strict approval IDs prevent stale answers but do not address all LangGraph interrupt semantics; Genesis has its own approval contract. No need to add LangGraph as a dependency.
- The original v2.5 ASIL scorer and historical evaluation cohorts are not changed.

## Local reproduction

```bash
cd research/aion-v06
python -m unittest discover -s tests -p test_genesis_strict_approval.py -v
python -m unittest discover -s tests -q
```

The new focused suite covers unique IDs across parallel pending questions, valid resumed approval, replay after consumption, changed invoice amount, changed checkpoint/revision, expired authorization, unknown or ambiguous answers, unauthorized reviewer, rejection, cross-scope mismatch, forged receipts, host authority revocation, regime shift and concurrent one-winner SQLite consumption.

## Next integration gate

Before connection to a real TradeFlow command, implement an authenticated authorization port and an atomic executor with durable idempotency keys. Then run an independent end-to-end simulation where an approval is issued, scope/amount/authority changes asynchronously, and **no external side effect occurs**. Request Q01 review; keep this candidate a draft and never silently merge into production.

Reference historical failure: ASIL v2.5 novel cases triggered 13 denied operations following authority revocation. This approval protocol is an additional defense and does **not** claim to eliminate that prior failure without new matched evaluation.
