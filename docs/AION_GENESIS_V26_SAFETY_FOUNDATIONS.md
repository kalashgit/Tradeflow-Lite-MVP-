# ASIL v2.6 — independent safety and outcome foundations (stage 1)

**Base:** draft PR #96 at `c165e649a41ed8f346dee46855d407b3cb4f5580`
**Assignment:** [Issue #97](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/97)
**State:** incomplete research increment; NOT a tested v2.6 policy, promotion, or release.

## Newly reproduced diagnostic: delayed authorization

The earlier novelty cohort (validation index 2200–2229) is **already inspected**.
A read-only replay of its frozen v2.5 memory/model, public PM observations,
selected actions and simulator receipts reproduces exactly:

- **13/13** denied actions: `authority_revoked`.
- **5 fast**, **8 deep**. None is an observed positive permission grant.
- **All at tick 7**, with public `authority_seen="unknown"` even as the
  fictional executor's state has been revoked.
- The source simulator schedules revocation at tick 7 for these novel cases;
  its authority notification is delivered later by the message bus.

The executor **did deny** these attempts. They were not successful writes.
There is no evidence that merely choosing the deep route would prevent them.

Reproduce without hidden future-state imports into the candidate:

```bash
cd research/aion-v06
python -m aion_genesis.asil_v26.forensics
python -m unittest tests.test_asil_v26_foundations -q
```

This is diagnostic replay of spent data, **not unseen evidence or an ASIL v2.6
performance claim**. Do not tune to these scenario indices and then score them
as new validation. Frozen v2.5 code, protocol, results and ledger are unedited.

## Added research contracts (not yet connected to policy)

1. `RegimeShiftDetector`: timestamped, scope-checked denied actions, surprises,
   contradictions, late evidence and abnormal vendor/approval events. Detection
   of unfamiliarity and actual authority are separate questions.
2. `RiskGovernor`: denies missing/stale/mismatched authority, uncertain prior
   commit, insufficient cash/crew and fast decisions during a detected shift.
   A permitted result **still requires atomic executor-side authorization**.
3. `OutcomeAttributionLedger`: append-only, hash-chained per-action effects
   separate from job payments. `unknown` / `censored_pending` do not become
   negative training labels; a job payment alone cannot cause trusted learning.

## Integration blockers and next steps

The v2.5 public policy observation has **no affirmative current authority
attestation**. It reports `unknown` unless a revocation reaches the project
manager. A genuinely fail-closed governor would therefore reject all writes
if wired directly against the old view. That is safe but would destroy useful
job completion. A proper v2.6 adapter needs a trusted, current, scoped
authorization result at the **execution boundary** (and matching revision),
not an inference from absence of a revocation. This is not a policy-side import
of hidden simulator truth. All compared policies must have the same authorized
interface in a new preregistered experiment.

Then: integrate observed regime signals with routing and hard gates; build
independently backed action-level effect verification; add controlled causal
transfer and targeted adversarial poisoning; freeze code/protocol before
**fresh** test indices; evaluate missed opportunities, denied attempts,
worst-case cash, paid jobs, calibration, memory-on/off and planning cost.
No automatic promotion regardless of synthetic results. Q01 independent
review, protected holdout custody and explicit founder approval remain gates.

The separate [Genesis ↔ TradeFlow knowledge contract](AION_GENESIS_TRADEFLOW_KNOWLEDGE_CONTRACT_V01.md)
specifies the longer-term domain information integration, without making the
research core application-dependent.
