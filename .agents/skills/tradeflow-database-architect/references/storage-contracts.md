# Storage and Conversation Contracts

## Existing foundations
- Current application: `public/app.js` IndexedDB `tradeflow-lite-v1`, version 9; `src/intelligence-context.js` reads H04-01 permission-filtered D1; `public/record-model.js` and `src/tenant-security.js` enforce record and tenant boundaries.
- Existing local commandLog/audit/sync queues must be retained. No new offline queue to bypass them.
- Never alter live D1 0003; prepare and test disposable local D1 migrations only.

## Conversation proposal (design, NOT yet implemented)
`conversation_thread`: `thread_id` UUID, `tenant_id`, `owner_subject`, `title`, `created_at`, `updated_at`, `last_message_id`, `retention_policy`, `deleted_at`, `revision`, `sync_state`.
`conversation_turn`: `turn_id`, `thread_id`, `tenant_id`, `role=user|assistant|system_notice`, `modality=text|voice`, `text`, `source=general_advice|record_evidence|model_unavailable|synthetic`, `refs` (revision-bound), `status=provisional|committed|interrupted|failed`, `created_at`, `event_id`, `revision`.
`conversation_event`: `event_id`, `thread_id`, `kind`, `logical_order`, `timestamp`, `payload_version`, `state`.
**Raw audio default:** no retention. If audio opt-in is later introduced, use separate encrypted attachment storage with independent consent, quota and retention.

## Transaction & provenance
- User final transcript/text is durable only on explicit send or voice-final commit. Never persist partial ASR hypothesis as final user speech.
- Append conversation turn and revision-bound refs atomically; use `event_id` for idempotency and `logical_order` for ordering across retries. An interrupted assistant turn must not become a completed claim.
- Outbox states: `local_only`, `queued_review`, `authorized_sent`, `server_acknowledged`, `uncertain`. No blind replay of uncertain writes.
- Never claim local-only data is backed up or synced. User-facing Delete must delete local thread/tombstone on sync according to retention and legal rules.

## Acceptance matrix
Fresh install; migration; restore; offline resume; duplicate event; stale response; role change; tenant switch; deleted thread; device storage quota; spoken-vs-saved transcript equality; read-only viewer; no data leakage through logs, inference or exports.
