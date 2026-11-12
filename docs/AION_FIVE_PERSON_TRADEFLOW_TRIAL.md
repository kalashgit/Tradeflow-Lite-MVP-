# AION Genesis × TradeFlow — Five-Person Synthetic Electrical Contractor Trial

**Status:** Research-only, draft, no production merge/deploy, as-of **2026-11-12**.  
**Base:** layered on GKB-02 public market intelligence draft #109 (previous knowledge layers #108 and #107).

## 1. Explicit experimental scope

This is the first actual application-level test of AION against a *five-person end-to-end contractor operating book*, not merely a domain-only prompt. It runs within TradeFlow's existing authenticated **synthetic local preview** route and Intelligence/voice UI. The trial does not activate autonomous training or grant the model permission to act. No real customer, bank, payroll, supplier or private competitor data is accessed.

The previous frozen T01 fixture (`TF-SIM-05/12/20`) is preserved. The new test uses an independent `tf_genesis_lab_05` namespace and fixed 2026-11-12 date.

## 2. Simulated company

**Mock Blue Ridge Electrical LLC — SYNTHETIC** (Austin, TX reference only), 5 employees:
- Owner + estimator: Morgan Example
- Lead electrician: Casey Example
- Journeyman electrician: Riley Example
- Apprentice: Sam Example
- Office coordinator: Taylor Example

The machine-readable operating book includes five customers, four linked leads and quotes, four jobs (two finished, one active, one scheduled), four invoices and three settled payments, three suppliers and purchase orders, a crew calendar, an unsigned change order, two signed base contracts, employee payroll obligations, a synthetic bank balance and unsent customer communications.

Every record is linked by ID; record type, as-of date and synthetic provenance are preserved. This is an *entire small test company*, **not** a real contractor's company data.

### Frozen founder/CEO financial oracle

| Metric as of Nov 12, 2026 | Value | Evidence interpretation |
| --- | ---: | --- |
| Five-person weekly pay | $6,800 | Synthetic gross commitment; does not imply employer tax or exact net payroll |
| Confirmed bank cash | $18,400 | Synthetic bank-confirmed as-of snapshot |
| Next two payrolls (Nov 13 and Nov 20) | $13,600 | Committed |
| Supplier POs due within 14 days | $5,700 | $4,700 + $1,000; excludes $1,800 draft |
| Conditional two-week cash after listed obligations | **-$900** | No new collections assumed; excludes any unlisted obligations |
| Outstanding invoice receivables | $7,300 | Not cash until settled |
| Overdue portion | $4,800 | One partly paid invoice |
| Confirmed signed active-job backlog | $36,500 | Excludes $14,050 of sent/draft quotes |
| Lead electrician overlapping shift time | 180 minutes | One entry tentative |
| Panel expected-delivery gap beyond job start | 2 days | Shipment not confirmed |
| Proposed, unapproved change order | $1,950 | Excluded from authorized billings |
| Active Dental job estimate-at-completion | $12,400 | $8,900 spent + $3,500 estimated remaining |
| Dental cost overrun versus $11,000 budget | $1,400 | Forecast, not realized margin |
| Dental forecast contribution (unapproved CO excluded) | $2,100 | Before overhead; not booked profit |
| Planned vs projected dental labor hours | 72 vs 83 | 11-hour projected variance |
| Two completed jobs' contribution | $4,350 / $17,200 revenue | Only two completed jobs; insufficient for statistically strong segment decisions |

**Cash integrity:** previously settled receipts are already included in the bank cash snapshot; don't double-count them. Nothing guarantees collection of unpaid invoices or a future supplier shipment.

## 3. Scenario evolution

The test session can only replay three simulated internal events:

1. **Confirmed customer receipt**: $3,000 against `inv-100`. Bank cash moves $18,400 → $21,400; outstanding AR $7,300 → $4,300; overdue AR $4,800 → $1,800; conditional cash -$900 → +$2,100.
2. **Supplier delay**: `po-101` expected panel delivery moves Nov 18 → Nov 22; the gap after Nov 16 start moves 2 → 6 days. The new date is still not a delivered shipment.
3. **Signed change receipt**: `co-100` changes from proposed to approved with a simulation-only written receipt. Unapproved changes $1,950 → $0, but no invoice is ever issued or written.

Each event changes only cloned in-memory fixture state and appends a before/after hash. Disallowed operations fail closed, no Write API exists and reset reproduces the original source hash.

## 4. Integrated TradeFlow flow

- Existing Intelligence conversation has an **AION Genesis** toggle and, within it, an explicit **Five-person company sandbox** toggle. It is only offered in the code-verified synthetic preview, never the public production cloud UI.
- Existing TradeFlow microphone transcription and spoken-reply controls remain the voice layer. Native voice/device quality still requires actual iPhone evaluation.
- The same preview `POST /api/ai/chat` gets a separate `assistant:'genesis_lab'` value. It ignores browser-supplied `business`, `businessId`, `role`, `events`, financial claims and permissions. The backend inserts only its own frozen five-person records.
- The lab passes **question-relevant raw records** plus a few existing reviewed contractor knowledge notes as the model's reference data. Crucially, the correct oracle answer is **never shown to the model**.
- The owner receives conversational advice with exact synthetic record refs and clear source labels. The model response is JSON-validated: unknown refs, non-JSON, tool-action claims and unbounded answers are rejected; no tool execution available.
- Prior local general-chat, Cloud records and unrelated assistant turns cannot migrate into the lab conversation. Mode switching creates a fresh thread.

## 5. Measurements, not impressions

`automation/simulator/genesis-five-person-evaluation.cjs` has 21 developer-owned, *inspected* questions spanning cash, payroll, receivables, leads, quote follow-up, procurement, supplier delays, crew planning, change orders, job cost/margin, backlog, owner strategy, unsafe action requests and three event-state changes.

Each observation records:

- Source identity and whether a real model actually ran
- Exact business numbers mentioned, with comma-normalized numeric checks
- Whether relevant synthetic record refs were cited
- Explicit decision caveats and unknowns
- No unsupported claims of completed actions
- Median and p95 answer latency; completions/invalid schema counts
- Accepted/rejected model status; fixture hash before/after; trace on event cases

There are **two separate tracks**:

**A. Scripted deterministic oracle, 21 cases:** This validates the app, business test data, reset, calculations, simulated events and inspection harness. **Do not use this as Qwen accuracy.**

**B. Actual local Qwen3 0.6B, 12 questions:** A separate CPU GitHub Actions job downloads the explicitly specified free open model with isolated Ollama, sends the same raw record packets to the actual model and scores its responses. Any failure counts as a failure; no synthetic oracle answer leaks to the model. Real-model inference is reported only after a completed run and artifact.

This suite is not an untouched holdout. It cannot certify performance on real unseen businesses; the next step is a separately custodied synthetic portfolio and human-reviewed sample of real use with tenant consent.

## 6. How to run

```bash
# Basic safety, data and route checks
node --test tests/genesis-five-person-business.test.cjs

# Scripted (not a learned model)
node scripts/run-genesis-five-person-benchmark.cjs --mode=oracle --cases=21 --out=/tmp/aion-oracle.json

# Optional real local Qwen: you must run Ollama on 127.0.0.1:11434
ollama pull qwen3:0.6b
node scripts/run-genesis-five-person-benchmark.cjs --mode=qwen --cases=12 --model=qwen3:0.6b --model-url=http://127.0.0.1:11434 --out=/tmp/aion-qwen.json

# Mobile preview UI with AION + five-person toggle (local only)
TF_AI_DEV_MODEL=live TF_AI_DEV_PREVIEW_TOKEN='your-private-development-code' node scripts/local-ai-preview-server.cjs
```

For preview-local inference the existing model provider uses its configured loopback inference service; the CLI explicitly targets Ollama 11434. This preview is not a public deployment.

## 7. Release gates

- Never merge without independent Q01 security/integration review and source/licensing verification.
- Full inherited TradeFlow app suite must pass; prior known missing approved 60-frame welcome orb media asset is a separate release blocker (no bypass).
- Demonstrate real local Qwen accuracy and natural speech on physical iPhone. Treat model output as untrusted narrative and require authorized evidence scopes and revision-rechecks before any future real tenant route.
- Check rare situations on unfamiliar businesses, stale supplier confirmations, conflicting cash receipts, unverified scope, actual costs, tenant role changes, and misleading source data.
- No self-directed Academy promotion into real TradeFlow merely because an inspected synthetic experiment improves.

**No customer data, external communication, purchases, financial writes, cloud deployment, or model-weight changes occur in this trial.**
