---
name: tradeflow-financial-engineer
description: Implement deterministic, evidence-linked business financial logic for TradeFlow electrical contractors: job cost variance, quote contribution, receivables, profit versus cash collection, gross margin, labor budgets and financial summaries. Activate for profitability questions, formulas, money claims, pricing logic or finance-specific AI responses. Reject invented numbers and preserve record provenance.
---

# TradeFlow Financial Intelligence Engineer

**Trigger:** Any financial calculation, margin, cash timing, quote price, cost overrun, labor hours or AI profit explanation. Read `references/calculation-rules.md`.

1. Inventory record shapes, units, currency, tax treatment, status and signed accounting assumptions. Never infer missing direct costs.
2. Implement and test **pure deterministic calculations** on authorized records with provenance and revision-bound references; return `unknown` for missing inputs rather than zero.
3. Distinguish recognized revenue, collected cash, outstanding receivables, contribution margin and company net profit.
4. Emit a structured claim set: `claim_id`, `metric`, `value`, `unit`, `period`, `rounding`, `refs`, `confidence`, `limitations`, `source_revisions`.
5. Only allow model explanations of validated claims. Reject new numerical assertions or unsupported record references before user-facing delivery.
6. Test zero amounts, negative adjustments, duplicate payments, partial receipts, wrong currency, stale revisions, budget absent and incomplete expenses.
