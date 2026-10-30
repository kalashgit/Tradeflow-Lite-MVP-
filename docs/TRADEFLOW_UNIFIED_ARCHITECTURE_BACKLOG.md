# TradeFlow unified architecture: evidence-based dependency backlog
Baseline examined: 471373afe5146047c6004966462438dd340a3057 (TF-H01 first green hardening increment). The ten contractor workflows and original 62-point register are preserved. This is architecture planning, not activation of unverified capabilities.

## Verified code foundations (not feature-completeness claims)
| Foundation | Existing implementation | Present boundary / gap |
|---|---|---|
| Local application and GUI | `public/app.js`, `public/index.html`, IndexedDB v9, service worker `public/sw.js` | Local data and cached app assets support offline usage; physical device reliability and multi-company isolation are unverified. |
| Shared commands | `public/command-registry.js`, `public/core-integration.js`, `public/business-events.js` | Explicit local-owner review, revision-bound operations and auditable receipts; local-owner is NOT cryptographic authentication or server-side authorization. |
| Contractor intelligence | `public/operational-intelligence.js`, opportunity/job/customer dossiers | Read-only detectors and local evidence; not a shared permission-filtered cloud Master Intelligence. |
| Sync intentions | `public/sync-queue.js`, `public/offline-conflicts.js` and `public/migration-ui.js` | Opt-in manual/explicit queue and conflict policy; no automatic app-wide enqueue/drain, no external-success guarantee while offline. |
| Cloud records | `src/tenant-api.js`, `src/tenant-security.js`, `src/oidc-verifier.js`, `src/tenant-record-store.js`, `src/schema-capabilities.js` | OIDC-scoped server API and record revisions exist; configuration and DB migration flags gate operation. Offline and local commands are not yet universally mapped to server-authorized effects. |
| Cloud-to-device preview | `public/cloud-retrieval.js` | Read-only comparison, not automatic merge or sync. |
| Voice entry | `public/voice-command.js`, `public/launch-more-commands.js` | Local voice/command surfaces exist; verified single orchestrator with Master Intelligence is not established. |
| Integrations | `public/integrations-v2.js` | Honest catalog and manual handoffs, not actual authenticated provider OAuth connections. |
| AI provider portability | No verified provider adapter located in inspected foundations | BYOAI configuration, secret redaction, costs, model availability and fallback are unimplemented/unverified. |
| Cloud portability | Cloudflare-oriented tenant API/D1 store and deployment scripts | No second verified deployment target; BYOC should begin with documented environment contract and one repeatable reference deployment. |

## Unified non-negotiable contracts
1. **RecordIdentity**: `{businessId, recordType, id, revision, updatedAt, sourceEvidence?}`; validate on both client and server, never infer tenant scope from the model. Legacy local records require a deliberate compatibility/migration strategy.
2. **CommandIntent**: `{commandId, parameters, actor, businessId, evidenceRefs, sourceRevisionHash, idempotencyKey}`. Plain-language and voice produce proposals only.
3. **Authorization**: registered capability, verified principal and company membership on the server for consequential writes, explicit human approval bound to intended records and current revisions.
4. **Receipt**: immutable-enough persisted audit identity, command and effect outcome, server revision when relevant, idempotency and reconciliation state. `queued_local` must never imply `externally_committed`.
5. **IntelligenceContext**: `{principal, authorizedBusinessIds, allowedRecordTypes, limitedRecords, sourceEvidence, freshness, uncertainty}`; retrieval must be permission-filtered *before* AI inference.
6. **SyncEnvelope**: `{businessId, operationId, recordKey, baseRevision, intent, dependencies, localStatus, remoteStatus, conflict?}`; server validation precedes remote writes; explicit conflicts never auto-merge.
7. **ProviderAdapter**: provider identity, capability negotiation, per-tenant credential reference, token/cost policy, timeout, retry, redaction and observability. AI responses cannot execute commands.
8. **IntegrationAdapter**: OAuth authorization code + PKCE where applicable, exact scopes, tenant-bound encrypted credentials, refresh rotation, revocation, webhook verification and audited operations.
9. **DeploymentContract**: documented public/private config, migrations, secrets, identity, storage, logs, backups and rollback; avoid requiring the browser to hold server API secrets.

## Dependency order
- **H01 (blocking):** Verify authorization ledger, concurrent writes, auditable atomicity, stale revisions, permission revocation and non-replaying recovery across TF-P01–P10. Exact-head Node/storage/Chromium acceptance required.
- **H02 (after H01):** Canonical record identity and revision metadata with versioned compatibility; no destructive migration. Ensure server and local record schema mapping.
- **H03 (after H02):** Connect explicit local intentions to sync queue, clear states (`local_draft`, `pending_authorization`, `queued`, `syncing`, `conflict`, `committed`, `indeterminate`); verify server authorization and recover replay safely.
- **H04 (after H02/H03 authorization envelope):** Permission-filtered Master Intelligence context and evidence references. Build read-only shared orchestrator first; command proposals only after capability contract is verified.
- **H05 (after H04):** Owner-approved structured command invocation from text; voice uses identical proposal/approval/receipt engine, without its own writer.
- **H06 (after H03/H04):** BYOAI one reference adapter through server-controlled credentials; traceable inference and optional model fallback; never direct model-to-database access.
- **H07 (after H03):** BYOC one reproducible Cloudflare deployment with documented credentials, schema, backup and recovery; portability interface only after a second target is justified.
- **H08 (after H03/H06):** One OAuth business integration using least scopes, vault-backed tokens, provider audit, idempotency and reconciliation.
- **H09 (after H04/H05):** Proactive contextual dossiers, premium GUI, in-app text/voice. GUI and offline records remain useful without AI.

## Parallel tracks that do not block H01
- Evidence/acceptance: map TF-P01–P10 to original register rows and prepare physical-iPhone / electrical-contractor scripted tasks; keep 0/62 retired until Code/Product/Operations/Outcome evidence exists.
- Security: inspect OIDC verification, server membership, tenant query isolation, backup retention and secret-management threat model without modifying production access.
- UX research: identify the simplest dashboard/dossier navigation tasks; do not preemptively redesign.
- Provider research: evaluate one BYOAI provider and one OAuth integration in read-only documentation without credentials or real connection attempts.

## Release gates
CI checkout must equal the candidate SHA. Tests and artifacts must state exact counts, failures, real-browser versus synthetic status, offline replay limitations, and absence of production actions. PR #16 stays draft; no merge/deploy, communications, payments or destructive migration without explicit authorization.
