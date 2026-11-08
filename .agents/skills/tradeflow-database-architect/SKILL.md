---
name: tradeflow-database-architect
description: Design and verify TradeFlow's offline-first IndexedDB and authorized D1 data architecture, including migrations, tenant isolation, conversation persistence, audit trails, sync conflicts and recoverability. Activate when implementing storage, schema changes, record queries, chat history, attachments, retention, offline synchronization or data migration. Preserve existing schema and approval gates.
---

# TradeFlow Database Architect

**Trigger:** Storage/schema, D1/IndexedDB, conversation history, migrations, sync, backups or retention. Read `references/storage-contracts.md` before touching persistent records.

1. Discover current IndexedDB version, D1 migration chain, existing tenant access-control SQL, commandLog and offline sync contracts; inspect actual record model and tests. Never scaffold another datastore independently.
2. Draw the read/write authorization boundary, durable identity keys, local-versus-server commit status and migration rollback strategy before code.
3. For every new field/table provide forward migration, old-client behavior, deletion/tombstone behavior, indexes, retention, tenant-scoped reads, source revision and deduplication rules.
4. Develop positive and negative tests: legacy restore, clean install, interruption, duplicated append, stale revision, cross-tenant read, role downgrade, quota/corrupt data and offline reload.
5. Preserve the sole approved command writer and audited receipts; chat transcript storage is **not** permission to execute tasks. No production migrations without explicit authorization.
6. Report exact schema delta, tests, backup/recovery plan and whether H03 physical-device gates remain blocked.
