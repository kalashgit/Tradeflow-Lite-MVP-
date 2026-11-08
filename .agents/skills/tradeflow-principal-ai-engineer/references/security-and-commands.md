# Security, Commands and Offline Integrity
- Use existing shared command registry, authorization, explicit approval, auditable receipt and reconciliation. AI proposes typed drafts; it does not execute.
- Approval must bind identity, role, tenant, resource revision, command payload and idempotency key. Revalidate immediately before mutation.
- Offline queues cannot blindly replay an action after uncertain acknowledgment. Preserve conflict resolution and deduplication semantics.
- Read/write permission and field-level financial visibility are server-enforced; UI hiding alone is insufficient.
- Every tenant boundary must have negative tests; no cross-business data in inference context or response.
- Protect against prompt injection in invoices, quotes, notes and attachments: untrusted record text never becomes instructions.
- Avoid live identity provisioning, production D1 migration, real communications, payments, billing changes or deployed Workers without separate explicit permission.
