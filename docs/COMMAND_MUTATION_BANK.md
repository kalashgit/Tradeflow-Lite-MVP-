# Universal Mutation Bank v1 — evaluation

The supplied CSV and JSONL contain the same **282 records with 282 unique IDs**. JSONL is preserved byte-for-byte in `tests/fixtures/TradeFlow_Universal_Mutation_Bank_v1.jsonl`; retaining both equivalent encodings would add duplicate test data. All 202 lexical candidates are labeled `synthetic_candidate_not_observed`; all 80 scenario rows are `synthetic_test_case`. Neither label establishes a real iPhone recognition error.

Source SHA-256:

- JSONL: `25b691fa0aff2e121eae4a06eb1f19bc72739c7d99ecfdbdb63a873122951ec0`
- CSV: `96dba6e9c18e1fcd10df8515d2b7b51f3703298136e6c28d7b449b6c5e33b978`

## Reproduce

Run from the repository root:

```sh
node scripts/evaluate-command-mutations.cjs > /tmp/tradeflow-mutation-report.json
node --test tests/*.test.cjs
```

The script has no dependencies beyond Node and the existing interpreter. It uses deliberate synthetic records, a fixed business date and timezone, and never accesses the business database. The runtime engine never imports the bank, mutation IDs, evaluator or expected outcomes. No automatic alias registration or model training occurs.

## Interpretation of results

Canonical strings and recommended behaviors are advisory; they are not full intent/parameter annotations. Some pairs deliberately change meaning, including a different valid phone digit, negation, conditions and ambiguous temporal phrasing. Equating all rows would be incorrect.

Lexical candidates get one explicit contextual template when the current foundation supports a relevant domain. Field-only Phone examples get a synthetic customer wrapper. All other scenarios are passed as supplied. Templates and wrappers are identified in the per-row report. No supported context is fabricated for dispatch, payments, deleting, sending, website creation and other future operations.

Current result:

| Classification | Rows |
| --- | ---: |
| Contextual agreement | 42 |
| Clarification or recovery gap | 79 |
| Semantic difference requiring review | 15 |
| No contextual template for the lexical domain | 102 |
| Baseline itself needs clarification | 4 |
| Baseline outside supported intents | 9 |
| Designated safety gate satisfied | 31 |
| Total | 282 |

These classes are disjoint. Clarification/recovery gaps deliberately combine conservative rejection with unresolved recognition failures; neither is counted as successful understanding. Semantic differences need human review rather than automatic failure or acceptance.

Of **202 lexical rows**, 100 have templates; 96 of those have a recognized canonical baseline. For those 96, **88 preserve intent**, **72 preserve intent and parameters**, and **26 preserve intent, parameters and recognized status**. The standalone ranker proposes the matching top intent in **89/96** cases (also 89/96 in the top three). The other four templated canonical baselines require clarification, including navigation/query ambiguity. Recovered write/draft vocabulary requires review, so full recognized-status agreement is intentionally much lower than intent agreement. This is bounded canonical agreement, not measured real-world accuracy. Stricter navigation checks can reduce agreement when a mutation is understood only as a candidate but cannot faithfully open the requested workspace.

**31/31 designated safety gates passed**, covering negation, conflicting entities, missing fields, conditions, compound requests, identity ambiguity, truncation, help/reported speech and marked interference. This only proves the tested interpretation requests clarification and suppresses command suggestions; no operation was executed. The bank exposed `Show my jobs to` being incorrectly accepted as navigation. The engine now blocks trailing prepositions and refuses to discard unsupported view/time constraints. Field-only corrections also cannot dismiss a conditional request.

Remaining gaps include unsupported lexical domains, colloquial and elliptical grammar, ambiguous grouped numbers, route/report vocabulary, some pronoun references and unsupported financial/external operations. Candidate ranking now uses reusable spelling/phonetic/segmentation evidence in structural roles; unfamiliar critical values are never corrected to match the bank. The bank's spelling variants have not been wholesale installed as aliases. Additional support should be developed through reusable grammar/entity rules with independent safety tests.

## Separate measured stages

- Transcription: **not measured**. No audio, recognizer integration or verified device references.
- Intent and fields: the bank provides canonical agreement where evaluable, not fully annotated accuracy. The separate labeled regression corpora pass **88/88 intents and 103/103 annotated parameter leaves**.
- Execution: **not measured**. This branch never calls the business executor.

The 20 error-category fixtures can be imported into the standalone Voice Command Lab using `tests/fixtures/command-intelligence-error-categories.json`. The raw mutation bank intentionally remains a CLI evaluation input: its advisory recommendations must not be converted silently into expected outputs or approvals. Complete per-row evidence is in `/workspace/artifacts/tradeflow-command-intelligence/universal-ranker-bank.json`.
