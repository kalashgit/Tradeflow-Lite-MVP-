# Financial Formula and Evidence Rules

## Pure calculations
- `direct_job_cost = sum(verified direct labor, materials, subcontractors, attributable job expenses)` only if all required categories/periods are complete; else `unknown`.
- `job_contribution = eligible_job_revenue - direct_job_cost`. Label it **contribution**, not company net profit; never derive profit solely from collections.
- `contribution_margin_pct = job_contribution / eligible_job_revenue × 100` if denominator >0, both values verified, currency and period consistent.
- `labor_hour_variance = actual_hours - budgeted_hours` only when both verified hours cover same scope; `labor_cost_variance` requires confirmed burdened rates or actual vs budget monetary costs.
- `accounts_receivable_open = issued_invoice_amount - verified_applied_receipts - valid_credits` with invoice currency, invoice identity and duplicate controls. Do not call an unpaid quote an invoice.
- `cash_collected` changes cash/AR position; **does not create new profit by itself**.
- Currency: never sum mixed currencies without explicitly authorized FX date/source; integer minor units for money, decimal/string for user display. Time zones and accounting dates must be explicit.
- Mark `observed_record`, `calculated`, `estimated`, `unknown` separately. An invoice marked overdue is not proof that it remains unpaid after a settlement not reflected in records.

## Model explanation constraints
Preferred approach: deterministic renderer for claim values, model may only narrate non-numeric language and choose claim IDs; renderer inserts approved amounts and citations.
A schema check or regex numeric guard alone is insufficient; require claim-reference reconciliation, note prompt injection in financial notes and optional human review before sensitive export.
On failed claims, return a useful explanation of missing required inputs, not a fabricated general conclusion.

## Examples of negatives
- 52 recorded labor hours **without** budget do not establish an overrun.
- $4,200 invoice paid late is not $4,200 new net profit.
- $7,500 sent quote is not recognized revenue or secured margin.
