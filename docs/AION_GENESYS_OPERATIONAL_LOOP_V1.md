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

### Protocol

Three case sets, all on the same synthetic five-person book, all judged by the
independent store-diff judge (persisted records before vs after; never the
operator's own message). The approver approves whatever is proposed (worst-case
owner), so a wrong proposal shows up as an unsafe write.

| Set | Cases | Status |
|---|---:|---|
| `genesys-operational-cases-v1.json` | 24 | Written before any model run; **inspected** while diagnosing run 1, so now historical, not evidence of generalization |
| `genesys-operational-dev-v1.json` | 36 | Generated by `scripts/genesys-academy-dev-cases.cjs` from new phrase templates; any case equal or close (Jaccard ≥ 0.7) to a frozen case is rejected. Free to inspect and iterate on |
| `genesys-operational-holdout-v2.json` | 24 | Frozen at `1a97236` (SHA-256 `3d028a74…f6ed3449`) **before** interpreter v2 existed. No reference answers. Run **once** (CI 44330800598) after the candidate was frozen; now **spent** |

Categories: direct, multi-application (contact log + follow-up in one
instruction), unfamiliar language (slang, paraphrase, Spanish), ambiguity,
missing information, records that contradict the owner, repeated instructions,
unsupported or unauthorized requests (mark paid, send, delete, refund, pay,
wrong role, prompt injection) and read-only lookup.

Interpreter contracts:
- **v1** — model fills action, customer, date, contact method and outcome.
- **v2** — model only copies the owner's own words into fields; a field is kept
  only if those words occur in the instruction; `[]`/`none`/`n/a` count as empty;
  contact method/result are derived by the host; capability gaps (mark paid,
  send, pay, delete, refund, discount, prompt-injection phrases) are refused
  before the model is called; a dropped step turns the episode into a question.
- **v2.1** — from the development-set diagnosis only: when the model's quoted
  contact words do not settle method/result, the host reads them from the
  owner's sentence (only if it names exactly one method and one result), and the
  owner's request words decide invoice vs quote when they name exactly one.

### Results

No-model rows are local and CI-reproduced. Real-model rows are CI runs on free
CPU runners (Ollama 0.40.16, temperature 0, thinking off); identity is recorded
in every trace.

| Run | Set | Overall | Tasks (verified state) | Safe no-write | Unsafe writes |
|---|---|---:|---:|---:|---:|
| Baseline: today's TradeFlow (strict grammar, no model) | eval v1 | 5/24 | **0/10** | 5/13 | 0 |
| Scripted reference (NOT AI; tests execution layer) | eval v1 | 24/24 | 10/10 | 13/13 | 0 |
| Qwen3-0.6B, v1 — run 1 (`7bd12dd`) | eval v1 | 5/24 | 0/10 | 4/13 | 1 |
| Qwen3-0.6B, v1 (`e89121a`) | eval v1 | 3/24 | 0/10 | 3/13 | 1 |
| Qwen3-0.6B, v2 (`e89121a`) | eval v1 | 15/24 | 2/10 | 12/13 | **0** |
| Qwen3-1.7B, v1 (`e89121a`) | eval v1 | 10/24 | 4/10 | 5/13 | **8** |
| Qwen3-1.7B, v2 (`e89121a`) | eval v1 | 14/24 | 3/10 | 11/13 | **0** |
| Qwen3-0.6B, v1 (`e89121a`) | dev | 6/36 | 1/20 | 5/14 | 11 |
| Qwen3-0.6B, v2 (`e89121a`) | dev | 25/36 | 9/20 | 14/14 | **0** |
| Qwen3-1.7B, v1 (`e89121a`) | dev | 19/36 | 12/20 | 5/14 | 12 |
| Qwen3-1.7B, v2 (`e89121a`) | dev | 21/36 | 10/20 | 11/14 | **0** |
| Qwen3-0.6B, v2.1 (`b27d77e`) | dev | 27/36 | 11/20 | 14/14 | **0** |
| Qwen3-1.7B, v2.1 (`b27d77e`) | dev | 25/36 | **14/20** | 11/14 | **0** |
| **Holdout (run once, CI 44330800598, `6678ac3`)** | | | | | |
| Baseline: today's TradeFlow (no model) | holdout | — | 0/10 | — | 0 |
| **Qwen3-1.7B, v2.1 — frozen primary candidate** | holdout | **12/24** | **1/10** | 11/13 | **0** |
| Qwen3-1.7B, v1 | holdout | 10/24 | 7/10 | 2/13 | **7** |
| Qwen3-0.6B, v2.1 | holdout | 15/24 | 2/10 | 12/13 | **1** |
| Qwen3-0.6B, v1 | holdout | 3/24 | 0/10 | 3/13 | 4 |

Model identity: `qwen3:0.6b` digest `7df6b6e0…becea435` (751.63M, Q4_K_M);
`qwen3:1.7b` digest `8f68893c…4d1730e7` (Q4_K_M). Latency p50/p95 per call:
0.6B v2 dev 2505/4323 ms; 1.7B v2 dev 2104/4183 ms (CPU runner).

### Holdout verdict

The candidate (v2.1 contract, Qwen3-1.7B) was frozen on development evidence
(`tests/fixtures/genesys-holdout-v2-result.json`) and the holdout was run once.

- **Task completion did not generalize: 14/20 on development, 1/10 on the
  holdout.** v1 completes more holdout tasks (7/10) but with 7 unsafe writes.
- **Safety held for the primary candidate (0 unsafe writes vs 7 for v1), but
  v2.1 is not unsafe-write-free:** Qwen3-0.6B turned one site visit into three
  grounded `log_contact` steps and three contact notes were written.
- Diagnosis: in most 1.7B failures the model returned no steps and copied the
  prompt's example clarification question verbatim (also visible on
  development cases `dev-direct-1..3`, not addressed before the freeze); in
  others it added steps the owner never asked for, and the all-or-nothing rule
  turned the instruction into a question.
- **After the holdout** (`genesys-operator/1.2`): a planner invariant — one
  instruction never writes the same record twice; identical steps merge, the
  same target with different details asks. This was prompted by the holdout
  failure and earns **no holdout credit**; holdout-v2 is spent, and the next
  generalization claim needs a freshly frozen holdout.
- **Reproducibility correction:** results are *not* fully reproducible. CI
  installs the latest Ollama unpinned and runner hardware varies; Qwen3-0.6B
  v2.1 measured 27/36 and 30/36 on the same development cases in two runs, and
  Qwen3-1.7B v1 measured 10/24 and 11/24 on the v1 set. Treat single-run
  differences of a few cases as noise.

What the development and v1 numbers said (before the holdout):
- **v2 removed every unsafe write** in both models on both measured sets (v1:
  1–12 per run). The bigger model made *more* unsafe writes under v1, because it
  completed more instructions by filling in details the owner never gave.
- v2 helps the 0.6B model on tasks (dev 1→9/20) and costs the 1.7B model a
  little (dev 12→10/20): v1's extra completions came with 12 unsafe writes.
- Multi-application instructions were 0/5 for both models under v2 (diagnosis
  above → v2.1).
- The remaining v2 failures are almost all *safe*: the operator asks a question
  instead of acting. That costs owner effort, not records.

Run 1 diagnosis (CI 44320401398): Qwen3-0.6B wrote `"[]"` for empty fields,
which v1 treated as a refusal (most v1 "refusals" were accidental); it invented
dates, contact methods and outcomes; and it mapped "mark paid" to an invoice
follow-up (an unsafe write a real owner would have had to catch).

**Browser:** 8 cases in the real app in Chromium (direct, multi-application,
contradicting records, unsupported, repeated, ambiguous, owner declines, and the
same loop typed into the TradeFlow AI chat box) all match the expected IndexedDB
state, each leaves a trace, the Tasks view shows the created task, and the chat
reply is badged with the verified outcome
(`docs/evidence/genesys-chat-verified-reply.png`). The model in this check is a
scripted double.

### Disclosures

- All case sets, including the holdout, were written by the same engineer who
  wrote the operator; none is an independent or contractor-sourced test.
- While smoke-testing v2's contact-word reader, two holdout phrasings ("Had a
  site visit and met the office manager", "Tried emailing North Academy but got
  no response") were typed into a unit check. No code was changed in response,
  but the holdout is not perfectly unseen.
- Benchmark approval is simulated; a real owner may catch a wrong proposal the
  benchmark counts as unsafe.

## Next increment

1. Replace the few-shot clarification example that the 1.7B model copies, and
   stop treating unrequested extra steps as grounds for a whole-instruction
   question (ask only about the step that is not grounded). Develop on new
   Academy development cases only.
2. Pin the Ollama version and record runner CPU so runs are comparable; report
   medians over several runs.
3. Author a fresh holdout (ideally with phrasing from real owners, not the
   operator's author) and freeze it before step 1 starts.
4. Owner-facing test with real people: until then every number here is
   synthetic.

## Limits

- Four actions only: invoice follow-up, quote follow-up, contact log, lookup.
- Text chat entry point only; no voice entry point.
- Benchmark approval is simulated; real owners may catch wrong proposals the benchmark counts as unsafe.
- Case sets are small and developer-written; none is an external holdout.
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
  --intent=v2 --cases=tests/fixtures/genesys-operational-dev-v1.json \
  --failures=/tmp/genesys-failures.jsonl
node scripts/genesys-academy-dev-cases.cjs --queue=/tmp/genesys-queue.json   # regenerate dev cases
cd research/aion-v06 && python -m aion_genesis.gml.operational_intake \
  --failures /tmp/genesys-failures.jsonl --out /tmp/genesys-queue.json
```

## Rollback

All new files are additive. The two behaviour changes to existing code are the
`quotes` store added to the invoice follow-up transaction and the operator being
loaded in `index.html`/`app.js`; reverting those two lines restores the previous
app. Not merging the branch restores PR #110 exactly.
