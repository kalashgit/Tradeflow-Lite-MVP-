# Extended business record model

One shared catalogue (`public/record-model.js`) now covers the 20 existing business-record stores. Local settings/credentials, command journals and calendar audit stay local. Activity/contact history in `events` is business data; it is not treated as independently verified server audit evidence.

Server record authorization, relationship validation, tenant snapshots, offline conflict policy, persistent queue and migration preview all consume the catalogue. Explicit supplier, calendar, crew, opportunity, campaign and purchase-order references are validated within the same tenant. Recognized job/customer/etc. `sourceKind` + `sourceId` links are checked too. The source preserves unknown custom record fields instead of inventing values or silently dropping them.

New financial types (`payments`, `expenses`, `jobCosts`, `supplyOrders`) require owner/admin permission, checked both at the API boundary and inside the actual SQL statement. This does not perform a bank transaction or external settlement. Existing invoice behavior is unchanged.

## Activation boundary

`TF_EXTENDED_RECORDS_ENABLED=false` remains the deployed default and is enforced by preview CI. `/api/v1/me` reports the actual available type list. Queues retain unsupported extended records as pending with `server_schema_required`, and migration previews use server capabilities rather than assuming a schema upgrade happened. The default four-type API remains usable without a database migration. No records are uploaded automatically.

`0003_extended_business_records.sql` expands the SQLite CHECK constraint using an explicit table copy, preserving payloads, revisions, tombstones, attribution and existing audit rows. It recreates the existing index and audit triggers after copying, so old records do not create new audit events. No production database or live pilot database was modified by this source delivery.

Before applying it to an authorized database:

1. Obtain and protect a current database export/recovery point. Record counts, revisions, audit counts, foreign-key check, table columns/indexes/triggers and migration bookkeeping must match the inspected foundation. Stop for unexpected schema additions instead of discarding them.
2. Inspect the migration ledger: earlier pilot migrations were applied manually. **Do not blindly run all migrations**, which could reapply the existing attribution columns.
3. Apply only the pending expansion with the platform's atomic migration runner after staging it against a recovery copy. Do not execute the DROP/rename statements as separately committed ad hoc queries.
4. Compare all existing rows and audit counts, foreign-key checks, role/revision behavior and a rollback exercise. Keep the API expansion flag false until the authorized owner/data migration prerequisites are satisfied.
5. Activation is a separate controlled configuration change; never infer customer ownership from a local profile or the feature flag.

Local executable coverage includes all 20 types, legacy capabilities, richer migration relationships, queue schema/permission blocks, financial SQL permissions, interrupted migration rollback and exact row/audit preservation. These checks do not assert human login or actual cross-device synchronization.
