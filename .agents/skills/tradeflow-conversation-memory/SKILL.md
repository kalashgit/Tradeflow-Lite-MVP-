---
name: tradeflow-conversation-memory
description: Implement durable, tenant-scoped chat history, voice/text thread continuity, retention, export/delete, searchable conversations, provenance and privacy for TradeFlow Intelligence. Activate when asked to save AI chats, resume conversations, remember contractor context, synchronize conversation history or connect voice transcripts to TradeFlow's AI page.
---

# TradeFlow Conversation Memory Engineer

**Trigger:** Saved TradeFlow AI chat, histories, thread search, voice transcript, recall, deletion or cross-device sync. Read `references/memory-lifecycle.md` and the database architect's schema.

1. Reuse the existing `tfChatMessages` presentation and TradeFlow AI page; migrate data behind that interface through approved schema changes, not additional chat UI/application.
2. Define tenant, actor, thread, turn and source-revision identities; keep long-term *business memory* separate from conversation transcript and untrusted model summaries.
3. Append **final user text** and **validated assistant text** with durable idempotent event IDs. Partial ASR, interrupted TTS and unverified LLM completions must have distinct provisional states.
4. Persist offline local-first, then optional server sync using existing approved tenant auth and uncertain-write reconciliation. User-visible local/synced markers, recovery and clear history controls required.
5. Implement retention, search, export, deletion, quota protection, financial-role filtering and tenant switching with negative tests.
6. Memory retrieval is read-only, provenance-linked, recency-scored and reauthorized; never claim a stale recalled fact is current.
