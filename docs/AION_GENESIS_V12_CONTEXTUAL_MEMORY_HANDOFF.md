# AION Genesis v1.2 — contextual memory research increment

**Status:** experimental implementation only; not promoted, merged, deployed, or
validated against a new independent holdout.

## Base / change isolation

- Frozen parent: `research/aion-genesis-v1-safety` @
  `27f261d7d35166bd959d398269aa81df41276ab0`.
- Candidate branch: `research/aion-genesis-v12-context-memory`.
- **V1 memory remains the default** with exactly the same `outcome_memory` path.
- New capability is explicitly opt-in: `contextual_outcome_memory`. Asking for
  both memory modes produces an abstention, never an implicit selection.
- No TradeFlow production paths, customer records, outbound tools, live models,
  hidden simulated outcomes or promotion-gate thresholds were changed.

## What was implemented

- `runtime/contextual_memory.py`: immutable bounded experience history
  (128 verified residual records per scope), deterministic JSON, validation,
  conservative context matching and correction shrinkage.
- Public context uses only usable, current `ObservationV1` numeric values
  available when the proposal was produced. The proposal stores its exact
  context snapshot for later receipt reconciliation; it never learns from
  hidden state, unavailable actions or counterfactual results.
- Corrections require the *same complete action keys* and sufficient contextual
  similarity. They reject missing/unrelated contexts, outcomes not yet observed
  at decision time, and experiences aged past 32 logical ticks. Residuals are
  bounded; the model is provisional, not a trusted factual record.
- Scope separation: persisted candidate models use the existing tenant-isolated
  versioned SQLite model store keyed by domain + scope + contextual version.
  Legacy memory is stored under its unchanged domain key.
- Confirmed receipts still require the existing outcome contract. Research
  proposals still require human review and perform no external action.

## Verification

The pure candidate module's standalone local tests completed **3/3 passing**
before publication. This is not a complete repository regression result.
The branch contains a larger unit/integration regression suite, including
runtime round-trip, receipt deduplication, memory-mode isolation, tenant
boundaries, deterministic replay, contradicted experience and staleness.
The branch-specific GitHub Actions job runs the full Python suite and the
*unchanged* v1.1 dev/validation safety replay. No protected holdout is run.

## Known limitations

- Context feature selection is an initial conservative numeric representation,
  not a validated domain-specific similarity metric. The 0.82 threshold, 32-tick
  age limit and sample shrinkage are research parameters needing development
  and validation ablations.
- The opt-in policy is **not yet registered as a lab candidate**. No memory-on
  improvement, business outcome improvement or generalization claim is made.
- No cross-episode training or selective transfer between scopes is implemented;
  initial scope isolation favors avoiding unverified transfer.
- Receipt/memory storage atomicity under concurrent writes remains a separate
  engineering hardening task; this patch does not claim to fix it.
- GitHub CI and any failing regressions must be reported against the exact
  published candidate SHA.

## Next experiment (not completed by this patch)

1. After exact-head CI passes, register a *new-versioned* v1.2 candidate
   in a separate, explicitly versioned laboratory protocol.
2. Select development and validation seed sets independent of the examined
   v1.0 holdout. Freeze metric definitions and compare against no-action,
   v0.9 memory-off and v1 additive memory policies on matched scenarios.
3. Include negative-transfer, context-switch and changing-resource conditions,
   and inspect harm and worst-tail outcomes by family.
4. Keep protected holdout unexamined until a reviewer approves frozen candidate
   code, grading protocol, seed plan, and an independently controlled judge.
