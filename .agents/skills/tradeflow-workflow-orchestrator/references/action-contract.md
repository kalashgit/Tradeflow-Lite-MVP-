# Master Intelligence Action Contract

## Proposed typed draft
`{proposal_id,kind,tenant_id,actor_subject,source_refs:[{type,id,revision}],draft_params,required_permission,risk_level,expires_at,idempotency_key,status:'proposed'}`.
All fields derived from trusted server-side identities and current authorized evidence. The model may suggest an intent label but not authorize the operation.

## State transitions
`observed -> suggested -> draft_prepared -> review_required -> approved -> executing -> verified_receipt`.
Alternative: `dismissed|expired|denied|stale|uncertain_ack|failed`.
Only existing command system may transition `approved -> executing`. Stale evidence, role changes or lost approval invalidate the prepared draft.

## Voice safety
'Send this quote', 'call the customer', 'collect invoice' and 'move crews' spoken by the owner are **requests to prepare/review** and do not send or mutate by themselves. Dictation is untrusted user input; assistant voice response never constitutes a command signature. Read-back and review panel required for external communications, payments, schedule changes and irreversible actions.

## Proactive detection
Use deterministic detectors with source refs and uncertainty labels. State expected impact only with validated formulas; don't count invoices as new profit or quotations as won revenue. Rate-limit notifications and de-duplicate by source revisions.

## Tests
Every action: authorized success, denied role, wrong tenant, stale ref, duplicate request, interrupted acknowledgment, offline retry, no model, partial transcript and denied side effect. All claims grounded in actual receipt state.
