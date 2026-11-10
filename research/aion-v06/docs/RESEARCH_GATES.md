# AION Genesis — independent scientific admission gates

This is a research protocol for AION v0.9 onward. **Do not edit a frozen
baseline or hidden evaluator to make a candidate look better.** If a protocol
changes, assign a new experiment version and new holdout seeds before running.

## Facts before experimentation

- v0.9 uses three declared electrical-contractor decision axes and enumerates
  12 combinations. It can rank *those*, not all possible real options.
- The generic Python core is reusable; the optional electrical domain pack
  provides invented costs, heuristics and evidence.
- Current model inference calls in the v0.9 strategic benchmark: **zero**.
- Latest published baseline (re-verify commit): 200 worlds seeded at 8000.
  Nominal average synthetic utility 18.1507; regret 0.4193; harmful-choice
  rate 0.5%. Shifted average utility 6.2246; regret 2.4707; harmful-choice
  rate **14.5%**. These were deliberately small simulator worlds.

## Versioned evaluation contract

1. **Define candidate**: version, hypotheses, source commit, permitted data,
   typed option schema, model/provider, prompt hashes, seed policy and call
   budget. Record intended success thresholds *before* using the new holdout.
2. **Split worlds**: development seeds for debugging; a disjoint frozen
   validation suite for selecting variants; a fresh holdout for the final
   comparison. Never read hidden effects in planner code or tune on a final
   holdout after its results have been revealed.
3. **Baselines**: v0.9 finite search; conservative wait/hold/quiet; rule-only
   alternative generator; if using an LLM, matched prompts with memory on
   versus off, and a model-free control. Budget model calls and tokens.
4. **Option discovery**: an independent challenge catalog contains admissible
   alternatives absent from the v0.9 axes (e.g., staged delivery, parallel
   task resequencing). Reveal admissibility evidence, not an answer key.
   Measure unique valid discovered options, invalid/ungrounded options,
   coverage, duplicate rate and missing-evidence abstentions.
5. **Decision quality**: under each owner's registered priorities, report
   realized utility, regret to hidden hindsight oracle, no-action harm rate,
   worst decile, consistency of evidence links and option set size. Include
   uncertainty calibration, not just one scalar score.
6. **Cost and speed**: p50/p95 end-to-end latency, actual model calls/tokens,
   provider/hardware, timeout rate, monetary estimate and decision-time
   compute. A Python 12-option microbenchmark must never be labeled live
   model reasoning latency.
7. **Transfer and robustness**: unfamiliar owners, extra/missing events,
   revisions and shifted supplier behavior, plus a second domain. Run
   tenant/cross-scope access, malformed model output, stale evidence and
   budget-exhaustion negative controls.
8. **Verdict**: PASS / FAIL / INCONCLUSIVE / BLOCKED, with exact commit,
   immutable config, number of worlds, uncertainty intervals, missing data
   and explicit real-world verification status. Save adverse case examples.

## Candidate milestone gates (targets, not achieved results)

- **G1 — Safe discovery:** 100% of *accepted* options have valid supporting
  evidence and meet the contract, including adversarial and stale inputs;
  increase valid distinct option coverage versus a frozen narrow baseline.
- **G2 — Independent usefulness:** on a fresh preregistered shifted holdout,
  reduce the harmful-choice fraction by at least 25% relative to the v0.9
  baseline **without** lowering mean nominal utility by more than 5%, with
  uncertainty intervals and no hidden-label leakage. These thresholds are
  experimental proposals, not safety guarantees.
- **G3 — Memory benefit:** show positive, repeatable memory-on versus off
  improvements at matched inference cost and equal evidence access, plus
  controls where irrelevant memory does not change actions.
- **G4 — Portability:** an unchanged core outperforms a declared baseline in
  at least two unfamiliar domain families; domain-pack retuning is recorded
  separately from actual learned transfer.
- **G5 — Product bridge:** independently review source/tenant/role boundaries,
  then expose read-only proposal output to TradeFlow. No direct production
  writes; owner approval and existing command receipts remain authoritative.

No gate above is satisfied merely because tests run or output JSON looks
plausible. Until G5 and real contractor checks, AION remains a research
component rather than a claimed production autonomous business intelligence.
