# 04 — Designing data-intensive systems for Genesis

**Book family:** Martin Kleppmann, *Designing Data-Intensive Applications* (first edition); **second edition, February 2026**, by Martin Kleppmann and Chris Riccomini, [publisher contents](https://www.oreilly.com/library/view/designing-data-intensive/9781098119058/). This is an original technical primer built around the book's known topics, not a textual reproduction. Features and chapter numbering differ across editions.

## 1. What makes a data system correct?

Four dimensions:
- **Reliability:** continues functioning despite partial faults, and fails explicitly.
- **Scalability:** performance remains acceptable as users, records and requests grow.
- **Maintainability:** behavior is observable, modifications are testable, and complexity is controlled.
- **Correctness:** records and observable outcomes satisfy invariants, even under concurrent writes and failures.

For Genesis, a fluent AI answer is worthless if the invoice amount came from a stale replica, the wrong company, or an uncommitted workflow.

**Nonfunctional requirements** must be measurable: p95 request latency, uptime goals, recovery point objective (RPO), recovery time objective (RTO), error-budget policy, backup recovery tests, tenant leakage tests.

## 2. Relational versus document versus graph data

Use relational tables for transactional entities and constraints: jobs, invoices, vendors, payments, approvals, assignments. PostgreSQL is often a sensible default for a small application.

Use documents for source material with changing fields: emails, contracts, inspection notes. Preserve source bytes, revision, checksum and extracted text.

Use a graph representation when relationships matter: subcontractor-to-project, task dependencies, vendor-to-material, employee-to-certification. You may implement these with relational join tables before deploying a dedicated graph engine.

Use embeddings for approximate semantic search, **not** as the only copy of authoritative facts or a replacement for typed filters.

Avoid polyglot persistence merely because it sounds sophisticated. Add a specialized data store only when a benchmark and operational need justify it.

## 3. Transactions and invariants

A transaction groups reads and writes with atomicity and defined isolation. Real systems need carefully chosen levels; SQL databases don't all implement isolation identically.

**Critical invariants:**
- A paid invoice cannot receive an automated overdue notice based solely on an older read.
- A crew member cannot be assigned to overlapping exclusive shifts without explicit override.
- A vendor ETA cannot be overwritten by a lower-trust source without provenance.
- Every external write must be traceable to a tenant, authenticated actor, authority scope and request ID.

Race example:
1. Genesis reads invoice `unpaid`.
2. An integrated payment event marks invoice `paid`.
3. Genesis sends a reminder using stale data.

**Fix:** re-read authoritative payment state immediately before a consequential send, check version and authorization, commit with idempotency; never let stale prompt context decide a write.

## 4. Isolation and concurrency control

Lost updates arise when two writers read an old value and both overwrite it. **Optimistic concurrency control** checks a version token:

```sql
UPDATE jobs
SET status = 'scheduled', version = version + 1
WHERE tenant_id = :tenant
  AND job_id = :job
  AND version = :observed_version;
```

If zero rows change, somebody updated the record: refresh and re-evaluate. This does not solve every concurrency problem; multi-record invariants may require transactions, locks or serializable isolation.

**Read skew:** two related reads see different snapshots. **Write skew:** transactions independently satisfy constraints but jointly violate a rule. Understand the data store's documented guarantees and test them with concurrent requests.

## 5. Replication and staleness

Replication improves availability and read scale, but replicas can lag. **Read-your-writes consistency** matters when an owner edits a deadline and immediately asks Genesis for the new schedule.

When a system offers eventually consistent reads, the agent must either:
- read from an authoritative source when correctness matters;
- wait for a documented version/watermark;
- disclose that the view may be stale;
- refuse a risky action until it can validate current state.

Never equate timestamp ordering with causal order across independent systems.

## 6. Partitioning and tenant boundaries

At small scale, a single database with tenant-scoped indexes may be simpler and safer than distributed sharding. Partitioning becomes relevant when storage, throughput, geographic residence or isolation requirements demand it.

A tenant ID should be part of access-control checks at application, query and search layers. Database row-level security can provide defense in depth, but should be tested, not assumed.

## 7. Idempotency and at-least-once delivery

External integrations retry. A network timeout may occur *after* the vendor created a purchase order. Blind retry risks duplicate orders.

Attach a stable idempotency key to any write. Persist a write-intent record before the call and reconcile via external receipt/status lookup after ambiguous responses.

Exactly-once end-to-end effects are difficult across independent services. Build around realistic delivery semantics: at-least-once messages + idempotent consumers, durable outbox and reconciliation.

**Outbox pattern:** in one database transaction, update local business state and append an outgoing event. A separate worker delivers the event and marks delivery; retries are safe when consumers deduplicate.

## 8. Stream processing and batch processing

Batch jobs suit periodic reconciliation and heavy reporting. Streams suit urgent events such as job changes, payment status and vendor delivery notifications.

A stream event may arrive late, out of order, duplicated or malformed. Use:
- event ID and deduplication;
- event time versus processing time;
- schema versions and validation;
- dead-letter queue with alerting;
- replay and migration tests;
- retention and deletion policy.

Materialized views can keep a fast "job at risk" dashboard, but should expose their update watermark and dependencies.

## 9. Schema evolution

Data representations change. Introducing `invoice_currency` or splitting `status` into `payment_status` and `approval_status` should not silently break old events.

Prefer additive migrations, explicit schema versions, dual-read/dual-write only for measured transition periods, backfill checks and reversible migration plans. Apply contract tests to external integrations.

Store a parser/model version when AI extracts structured data. That allows later diagnosis of changed extraction behavior.

## 10. Consistency versus availability: a practical frame

The CAP theorem is narrowly about certain network partition conditions; it is not a universal "choose two of three" checklist for all system design. In Genesis, first identify:
- Which fields must be current and correct?
- Which operations can show a delayed but labeled view?
- Which actions must stop when the authoritative system is unavailable?
- What happens during a network split or provider outage?

A read-only summary can often degrade gracefully. Sending money, changing a contract, or issuing a binding purchase order should fail closed when prerequisites cannot be confirmed.

## 11. Operational readiness

Use traces to connect `user_request → retrieval → model decision → tool request → DB commit → external receipt`.

Implement backups and periodic restoration exercises. Track read/write errors, version conflicts, retry rate, queue lag, source staleness and schema validation failures. Test the recovery procedure rather than merely checking that backup files exist.

Suggested model:
```text
API gateway → policy + tenant auth → transactional DB (facts/events)
                                      ├─ outbox → workers/integrations
                                      ├─ document store + extraction
                                      └─ search index / embeddings
Orchestrator → authenticated queries + cached derived views → proposals
Approved proposals → action service → receipt → event log
```

## 12. Experiments for Genesis

1. Concurrently mark invoice paid while agent prepares reminder. Assert zero erroneous sends.
2. Delay the read replica by 30 seconds. Agent should honor version freshness before modifying a job.
3. Inject a network timeout after successful external action. Retry must not create a duplicate.
4. Replay events from a clean database. Current projections should match known checksums.
5. Mix two synthetic tenants with near-identical customer names. Assert no cross-tenant retrieval.
6. Apply a backward-incompatible schema change in a staging dataset. Verify detection and rollback.

**Study checkpoint:** explain isolation, consistency, transaction boundaries, idempotency, event time, schema evolution and exactly what a successful business write means.
