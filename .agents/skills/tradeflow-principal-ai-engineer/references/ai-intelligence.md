# AI Intelligence Engineering
- Separate three modes: (1) scripted synthetic mock, (2) general local-model advice with zero company records, (3) authorized record-backed briefing. UI must label each truthfully.
- Read only through existing server-authorized context reader. Bind actor, role, tenant, scope, revision, provenance and content trust. Re-read after inference and discard on mismatch.
- Deterministic finance first: amounts, hours, margin, variance, collection and profit are computed in trusted code with explicit units, period, precision, missing-data status and traceable source refs. The model may explain but must not create numbers, citations, permissions or action authority.
- Validate model output against allowed evidence IDs and allowed numeric claims. Fail closed on invalid references, fabricated numbers, incomplete generation or timeout. Never silently replace with misleading canned advice.
- Distinguish cash collection from new profit; labor actual vs budget does not prove financial loss without validated rates and scope. Missing data should produce actionable review requests, not fabricated figures.
- Keep Qwen transport loopback-only and opt-in; measure RAM, model loading, token latency, truncation and quality. The small model may be useful for general language but is not a trusted financial calculator.
- Use synthetic fixtures and negative tests for hallucinations, role downgrade, cross-tenant input, stale revision, model outage, prompt injection and zero writes.
- Before connecting real records, require separate authorization and privacy/security acceptance. Never feed browser-supplied tenant identifiers directly into trusted queries.
