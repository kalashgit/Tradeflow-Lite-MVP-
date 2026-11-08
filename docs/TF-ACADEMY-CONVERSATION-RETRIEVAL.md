# TradeFlow Academy — Conversation Retrieval v1

## Scope

The existing TradeFlow Intelligence text conversation now recognizes explicit Academy / book / reading-list questions. It uses the same local conversation scope, message persistence, and rendering as other TradeFlow Intelligence responses. A local metadata-only index searches the 59 Academy source entries, and each answer is marked **OFFLINE ACADEMY CATALOG · METADATA ONLY** with source identifiers.

This is **not** an electrical reference-answering engine. No book content, licensed passages, trade-code text, or verified technical procedures have been ingested. The Academy source registry has `ingestionStatus: metadata_only`, `rightsStatus: not_reviewed`, and `passageCount: 0`. Its learning objectives are curriculum metadata, not substantiation for electrical work.

## Files and route

- `public/academy-catalog.json` mirrors the registry in `docs/TRADEFLOW_ACADEMY_59_METADATA.json`.
- `public/academy-retrieval.js` validates the registry, searches titles/authors/objectives locally, and returns bounded metadata-only answers.
- `public/app.js` routes explicit Academy questions before the cloud/preview-key fallback and saves both user and assistant turns through the existing conversation path.
- `public/conversation-store.js` allows the `academy_metadata` provenance source.
- `public/index.html` loads the retrieval module, and `public/sw.js` precaches both index and catalog for subsequent offline visits.

## Manual acceptance checks

1. Load TradeFlow while online once so the updated service worker caches the Academy files.
2. In the existing TradeFlow Intelligence chat, ask: “Show Academy books about construction costs.”
3. Confirm the reply appears **in the same thread**, displays the metadata-only provenance, and lists relevant curriculum entries.
4. Reload the app, open the same conversation, and verify the messages remain saved.
5. Disable network access and repeat an Academy query. It should work once the app and catalog are cached. No API charge or server-side action is involved.
6. Ask an operational command or ordinary business question and verify the existing route remains unchanged.

## Next gate

Before retrieval can give grounded electrical-contracting answers, ingest rights-cleared source excerpts or original study notes, record jurisdiction/edition/provenance per passage, index them locally, and require citation-backed scenario checks. Any workflow action must still pass through TradeFlow's established authorization, preview, and audit controls.
