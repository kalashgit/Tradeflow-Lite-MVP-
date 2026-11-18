# AION Genesys — first operational loop (v1)

**Branch:** `claude/genesys-operational-loop-v1`, from PR #110 head `9a13f78`.
**Status:** research draft. Not merged, not deployed. Synthetic records only.

## What was missing

| Loop stage | Before this branch |
|---|---|
| Instruction → intent | **Missing.** `TradeFlowCommands.parse` accepts only a fixed grammar and rejects free-form text; Genesis/Qwen chat (PR #110) is read-only |
| Evidence, planning, safety | Existing: `resolve()` preconditions, record guards, permission checks |
| Authorized execution | Existing: `createRuntime` prepare → explicit approval → idempotent execute, `core-integration` transactions, receipts, domain events |
| State verification | Existing for interrupted-command recovery only; nothing checked a model-driven request against persisted records |
| Evidence recording | Existing `commandLog` audit; no record of model identity or inference |
| Evaluation / Academy | No operational benchmark; no path from failures to the Academy |

The missing link was **natural language → registered TradeFlow command**, with
verification against persisted state. This branch adds it without a second
executor, permission system or data store.

## The loop

```
instruction
  → intent        model fills a fixed JSON schema (actions, customer words, date words); untrusted
  → evidence      host matches customers in scope, lists candidate invoices/quotes, judges each
                  with the registered command's own resolve() preconditions
  → plan          one registered command per step; every step resolved before anything runs
  → safety        permission (same capability list as the live app), tenant scope, ambiguity →
                  question, missing detail → question, records disagree → blocked, unsupported → refused
  → approval      the owner approves the exact prepared operations (app: confirm dialog)
  → execution     existing TradeFlowCommands runtime + TradeFlowCore.execute, unchanged contracts
  → verification  re-read IndexedDB: task/contact/receipt exist, linked correctly, due date matches,
                  invoices and payments untouched, no duplicate open task
  → trace         `genesys.trace` row in the existing commandLog with model identity and raw output
  → evaluation    separate benchmark judge; failures → Academy remediation queue
```

The model never chooses record identifiers, computes dates, approves, or reports
success. Dates are resolved by the host from the owner's own words.

### Files

| File | Role |
|---|---|
| `public/genesys-operator.js` | Intent schema, strict parser, date resolver, evidence matching, planning, verification, operator |
| `src/genesys-model.cjs` | Real local Qwen via Ollama (records name, digest, size, quantization, server version, tokens); scripted test double labelled not-AI |
| `src/genesys-tradeflow-fixture.cjs` | Maps PR #110's synthetic five-person book into TradeFlow record shapes |
| `public/app.js`, `public/index.html` | `window.TradeFlowPilot.genesys.handle(text)` in the live app, using its own runtime and a confirm dialog; **chat entry point**: More → TradeFlow AI → "Let Genesys act on my records" sends the typed instruction through the same loop, and the reply badge shows the verified outcome and the audit-trace id |
| `scripts/local-ai-preview-server.cjs` | `/api/ai/genesys/interpret`: authenticated, accepts only the fixed v1 or v2 system prompt, schema chosen by the server, host-chosen loopback model, no record access |
| `tests/fixtures/genesys-operational-cases-v1.json` | 24 frozen cases with expected persisted effects |
| `scripts/run-genesys-operational-benchmark.cjs` | Benchmark and independent judge (`baseline`, `oracle`, `qwen`) |
| `scripts/verify-genesys-operator-browser.cjs` | Real app in Chromium, real IndexedDB, real approval dialog |
| `research/aion-v06/aion_genesis/gml/operational_intake.py` | Failures → Academy remediation queue (never training labels) |
| `public/core-integration.js` | **Defect fix**, see below |

## Defect found and fixed in existing TradeFlow code

`invoice.followup.schedule` opened its transaction on jobs but not quotes. Its
record guard follows invoice → job → quote, so any invoice whose job came from a
quotation (the normal TradeFlow lineage) always failed with "Invoice or related
record changed since approval". The transaction now also reads quotes. A
regression test (`tests/invoice-followup-execution.test.cjs`) fails on the old
code and passes now.

## Evaluation

24 frozen cases, written before any model run, across nine categories: direct,
multi-application (contact log + follow-up in one instruction), unfamiliar
language (slang, paraphrase, Spanish), ambiguity, missing information, records
that contradict the owner, repeated instructions, unsupported or unauthorized
requests (mark paid, send email, delete, refund, wrong role, prompt injection),
and read-only lookup. Each case starts from a fresh copy of the synthetic book.
The judge compares persisted records before and after to the expected effects;
it never reads the operator's own success message. The approver approves
whatever is proposed (worst-case owner), so a wrong proposal shows up as an
unsafe write.

| Mode | Overall | Task completion (verified state) | Safe no-write cases | Unsafe writes |
|---|---:|---:|---:|---:|
| Baseline: today's TradeFlow (strict grammar, no model) | 5/24 | **0/10** | 5/13 | 0 |
| Scripted reference interpretation (NOT AI; tests execution layer) | 24/24 | 10/10 | 13/13 | 0 |
| Real Qwen3-0.6B | see PR | see PR | see PR | see PR |

The real-model result comes from the `qwen` job in
`.github/workflows/genesys-operational-loop.yml`; this sandbox cannot download
model weights. It is recorded on the pull request once the job has run.

**Browser:** 7 cases in the real app in Chromium (direct, multi-application,
contradicting records, unsupported, repeated, ambiguous, owner declines) all
match the expected IndexedDB state, each leaves a trace, and the Tasks view shows
the created task. The model in this check is a scripted double.

## Limits

- Four actions only: invoice follow-up, quote follow-up, contact log, lookup.
- Text chat entry point only; no voice entry point.
- Benchmark approval is simulated; real owners may catch wrong proposals the benchmark counts as unsafe.
- 24 cases are small and developer-written; they are not an external holdout.
- The scripted reference shows the execution layer works, not that any model understands.
- Failures feed a remediation queue; no model is trained from them.

## Reproduce

```bash
npm ci
node --test tests/genesys-operator.test.cjs tests/invoice-followup-execution.test.cjs
node scripts/run-genesys-operational-benchmark.cjs --mode=baseline
node scripts/run-genesys-operational-benchmark.cjs --mode=oracle
node scripts/verify-genesys-operator-browser.cjs          # needs Chromium
ollama pull qwen3:0.6b && node scripts/run-genesys-operational-benchmark.cjs --mode=qwen \
  --failures=/tmp/genesys-failures.jsonl
cd research/aion-v06 && python -m aion_genesis.gml.operational_intake \
  --failures /tmp/genesys-failures.jsonl --out /tmp/genesys-queue.json
```

## Rollback

All new files are additive. The two behaviour changes to existing code are the
`quotes` store added to the invoice follow-up transaction and the operator being
loaded in `index.html`/`app.js`; reverting those two lines restores the previous
app. Not merging the branch restores PR #110 exactly.
