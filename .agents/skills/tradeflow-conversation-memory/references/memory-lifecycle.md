# Conversation Memory: Persistence and Provenance

## Current reality
TradeFlow AI chat today is a `tfChatMessages` in-memory array in `public/app.js`. Do not say it is already saved. The separate voice command UI is not persistent full-duplex voice chat.

## Thread rules
Every text or voice turn belongs to one `thread_id`. Thread list, title, timestamps, search, local-vs-synced icon, export, deletion and retention preference belong to TradeFlow AI page. Existing presentation and profile/navigation remain.

## Durable events
- `user.text.final`: committed after send.
- `user.voice.partial`: ephemeral captions, no durable fact.
- `user.voice.final`: committed text plus voice modality and ASR confidence/uncertainty when available.
- `assistant.text.provisional`: not yet validated and must be removed/marked interrupted on abort.
- `assistant.text.committed`: validated answer with source `general_advice|record_evidence|synthetic|unavailable` and exact refs/revisions.
- `assistant.voice.played`: optional playback status; text is canonical for accessibility and retrievability.
- `approval.proposed`: typed draft only; `approval.executed`: result from existing command audit receipt, never inferred from conversational text.

## Privacy & synchronization
No raw audio storage by default. Enforce tenant and role authorization for every persisted thread and retrieval. Offline local-only state must not be represented as backed up. On log out, account switch or revocation, clear sensitive in-memory retrieved context and suspend access; preserve only legitimately retained local data behind proper permission.
Prevent cross-device duplicates via `event_id`, `thread_id`, `turn_id` and revision. Unknown server acknowledgment ⇒ uncertain, reconcile before replay.

## Retrieval
Use recency/turn window and optional summaries with `summary_version`, `sources`, `as_of` and role filter; re-fetch any business record that influences a financial decision. Vector retrieval is optional and must not bypass access control.
User-facing 'remember' must mean a documented, consented scope; deleting history must invalidate corresponding summaries/indexes per retention policy.

## Gates
Browser restart restores chat text; voice transcript appears in same thread; source refs survive; deletion and local-only states accurate; denied user sees no other tenant; no partial ASR or cancelled output falsely saved as full.
