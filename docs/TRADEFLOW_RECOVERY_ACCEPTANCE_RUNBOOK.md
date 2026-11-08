# TradeFlow — Recovery Acceptance Runbook (H04-15e)

**Status:** Proposed evidence and approval contract. Not authorized for a production restore, migration or backup operation.

## Purpose and boundaries

H04-15c verified committed `0001`–`0003` migrations in disposable Wrangler local D1; H04-15d verified a synthetic, schema-specific logical export/restore on separate temporary D1 bindings. These do **not** validate any live account backup, D1 point-in-time recovery, managed export, external storage, encryption key provisioning, offsite retention or actual user data. Production migration `0003_extended_business_records.sql` remains **PREPARED ONLY**. The authorization/role matrix for field and office roles remains unapproved. The user-facing app, production Worker and D1 database must not change as a consequence of this runbook.

This runbook describes evidence that a **future authorized operator** must gather and a founder must review before deciding on any real restore or migration. It is not a runbook for invoking the Cloudflare API and it contains **no executable remote commands or credentials**.

## 1. Mandatory decision gates

Before any live database action, record all of the following in an approved change ticket:

1. **Explicit scope:** exact Cloudflare account, database identity, environment, business/tenant boundaries, expected schema revision, and reason for the proposed operation. Do not infer a database from a project name or current default binding.
2. **Authority:** named founder approver, named qualified operator, distinct reviewer, approved permissions and timestamp. An app-local role or a CI test identity is not proof of cloud authorization.
3. **Change control:** intended read/write operations, maintenance window, customer-impact notice where relevant, monitoring, stop conditions, immutable evidence store and rollback owner.
4. **Backup:** obtain a backup/export through an explicitly approved Cloudflare-supported mechanism; record durable artifact reference, sha256 digest, size, timestamp, source database revision, and encryption/key-alias metadata. Do not put credentials, signed download URLs, bearer tokens, payloads or customer names in the manifest.
5. **Retention:** record the approved legal/operational retention policy, expiry, deletion authority and evidence of encryption at rest and controlled key access. The proposed contract specifies *no* default retention period.
6. **Restore rehearsal:** before live authorization, restore to an isolated non-production database using a separately reviewed method, independently verify the artifact digest, verify membership isolation, compare record/revision/tombstone counts and values, and measure actual restore duration. Record failures and a repeatable rollback drill.
7. **Go/no-go:** require evidence review, a fresh explicit founder decision and an independent operator checkpoint immediately before any real write. **No manifest or automated test result can issue approval.**

Any missing scope, uncertain data provenance, unverified encryption, failed integrity check, expired retention, contradictory count, unproven rollback or absent explicit authorization means **NO-GO**.

## 2. Metadata-only evidence schema

`src/recovery-evidence.js` implements `assessRecoveryEvidence(manifest)`, a pure function with **no network, storage, credential or database access**. It accepts only a narrowly allowlisted, size-bounded object:

| Section | Evidence fields | Semantics |
|---|---|---|
| `source` | environment, databaseAlias, schemaHash, tenantCount | Scope declaration, not proof of identity |
| `artifact` | backupId, createdAt, digestSha256, bytes, storageRef, encryptionAlgorithm, keyAlias | Opaque artifact and encryption **metadata only**, not decryption material |
| `retention` | policyId, deleteAfter | Reference to a separately approved retention policy |
| `integrity` | receiptId, verifiedAt, tenantIsolationReceipt, foreignKeyReceipt | Attestation references requiring independent inspection |
| `drill` | receiptId, completedAt, environment, restoreDurationMs, digestMatched, rowsMatched, tenantIsolationPassed, foreignKeysPassed | Measured synthetic/isolated restoration evidence requiring independent validation |

A positive result reports only `evidenceReadyForIndependentReview: true`, **never** `productionRestoreAuthorized` or `productionMigrationAuthorized`. The assessment intentionally sets `independentlyVerified:false` even when every attestation is present. The caller must not treat metadata claims as genuine proof, and must never pass the manifest to an operation executor.

Opaque IDs are identifiers, not guaranteed secret-detection; do not paste plaintext secrets in any field. The contract rejects extra fields but cannot determine whether a valid-looking identifier is actually sensitive. Manifest version changes must be reviewed, not inferred.

## 3. Rehearsal evidence to collect

Use **disposable, synthetic or appropriately approved non-production** data and prove the following, preserving reproducible CI evidence:

- Exact schema/migration version and database identity. A successful local migration does not imply live migration readiness.
- Source and target fingerprints plus a verified artifact digest checked **before** restore.
- Verified tenant separation, foreign-key integrity, copied payloads, revision counters, soft-delete timestamps, membership states, and audit event provenance.
- A deliberately injected restore failure, confirmation of transactional rollback (including schema/triggers), then successful independent restore.
- A post-restore attributed create/update test producing exactly one expected audit event per write, and negative invalid-type/foreign-tenant tests.
- Measured duration and dataset size. Report observed timings without guessing production RTO/RPO or a performance SLA.
- No production or customer-facing operation, no live AI egress, no new roles, no billing action and no automatic command execution.

The H04-15d fixture uses a logical JSON snapshot of **four known tables** with a small synthetic row limit; this is neither a complete backup tool nor D1 PITR. A future provider-backed solution must be designed and assessed separately.

## 4. Live recovery acceptance (currently blocked)

A future live restore may be considered only after evidence above is independently verified, founders have approved an access matrix and the specific operation, the actual D1 environment is confirmed, and a reviewed Cloudflare-supported backup/restore method with explicit rollback has been tested. Credentials and decryption keys must remain in authorized secret management and outside test fixtures or pull-request logs.

For any authorized recovery event, a human operator must record post-action integrity and business acceptance, open issues, compensating actions, owner sign-off and a follow-up review. Passing synthetic tests does **not** retire TradeFlow's original 62 research pain points or prove physical-device sync. This work must stay separate from the draft PR's production release gate.

## 5. Engineering verification

The exact-commit CI runs `tests/recovery-evidence.test.cjs` in the existing full Node regression. It verifies the positive evidence contract, failed drill attestations, secret/unknown-field denial, invalid timestamps, invalid sizes/hashes, oversized/cyclic input and the permanent **no production approval** flags.

**Acceptance for H04-15e is limited to:** the contract and runbook are published to PR #16; exact-commit Node, storage, contractor, disposable D1 and Chromium regressions pass; the PR stays draft/unmerged; no live resource is touched. Real backup, iPhone Cloudflare Access acceptance, live-cloud revocation, approved role matrix and actual contractor outcomes remain open.
