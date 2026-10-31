# TF-H01 — Command safety and recovery hardening contract

Status: engineering design checkpoint; not proof of implementation or contractor acceptance.
Baseline: 9ac12e9b581f34eab55bab6a37c436babf330829 (TF-P10).

## Trust boundary
- Parsing, model output, notification detection and task suggestions are **never** approvals.
- Local-owner permission is not authentication, tenant isolation or delegated authorization.
- Only a human-initiated, explicit approval of the exact canonical command payload and evidence revision can permit a modification.
- Approval must expire or fail closed if any referenced source, linked record, business scope or relevant evidence changes.
- No implicit email, SMS, payment, bid submission, customer authorization, bank reconciliation or accounting verification.
- Fail closed when storage is unavailable, incomplete, ambiguous or mismatched.

## Command contract inventory
For each modification command, document: allowed actor, business scope, parameters, source records, revision fingerprint, expected writes, approval text, idempotency key, audit receipt, recoverable statuses, external side effects, and stale-state error.
Include customer.create, customer.source.delete, calendar.conflict.reschedule, invoice.followup.schedule, customer.contact.record, quotation.followup.schedule, job.change_order.review.schedule, job.change_order.authorization.record, job.cost_review.schedule, job.labor_review.schedule, invoice.payment_review.schedule, opportunity.bid_review.schedule, quotation.reuse.create, customer.economics_review.schedule and quotation.convert.

## Mandatory adversarial regression matrix
1. Prepare then mutate each linked source before approval and before execution: reject with no partial writes.
2. Approve then alter parameters, scope, or idempotency key: reject.
3. Two tabs concurrently approve/execute same command: at most one business effect and one durable canonical receipt.
4. Reload/crash at prepared, approved, writing and committed boundaries: reconcile without replaying uncertain writes.
5. Duplicate click, retry and browser back/forward: no duplicate tasks, drafts, authorizations or notifications.
6. Missing, corrupt, cross-business or mismatched linked records: fail closed.
7. Stale approval after customer identity, quote acceptance, invoice payment, cost or opportunity change: reject.
8. Event/receipt/write atomicity: all committed together or none; no success notification before commit.
9. Read-only intelligence path must never call modification execution.
10. Synthetic mobile and desktop checks must remain labeled synthetic; require independent real-device and contractor acceptance.

## Evidence and release gates
- Capture exact commit SHA, Node/storage/browser outputs, failures and screenshots in CI artifacts.
- Keep PR #16 draft and unmerged until these gates pass on its exact head.
- Never claim a research pain point retired from automated tests alone.
- Do not enable autonomous external operations as part of this hardening phase.

## Next implementation
Begin with a focused concurrency/idempotency regression against the existing shared command engine. Fix observed failures in the engine, not by bypassing it in GUI code. Follow with stale linked-evidence tests and a complete contract inventory.

## Implemented engineering increments (2026-10-30)
- `471373afe5146047c6004966462438dd340a3057`: seven Node adversarial tests and execution-time owner approval evidence enforcement. CI run #224 success.
- `ab776a84a6cb7588527fe72913f58a173cebf028`: three further Node tests and capability checks at approval and reconciliation. CI run #226 success.
- `24fef213a6300705b8556ea27114b55dded98608`: true two-tab Chromium verification on mobile/desktop synthetic viewports. CI run #228 success.
- Subsequent exact-head CI summaries must include Node and browser counts and reject skipped/partial coverage.
- Engineering code gates do **not** satisfy physical iPhone, tenant security penetration, contractor workflow operations or original-register outcome gates. All 62 remain open.
