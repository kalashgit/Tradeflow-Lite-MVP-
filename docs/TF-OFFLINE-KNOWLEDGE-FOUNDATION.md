# TF-KNOW-LOCAL-01 — Offline Knowledge Pack Foundation (nonproduction)

**Status:** additive developer proof. It does **not** add a trained model, electrical-code expertise, production knowledge retrieval, voice responses, workflow execution, subscriptions or billing.

## What exists

- `public/offline-knowledge-pack.js`: dependency-free browser/Node read-only index and local keyword search of pinned source excerpts. Never performs network requests or executes model/business commands. SHA-256 verifies passage integrity before results are available.
- `scripts/build-offline-knowledge-pack.cjs`: opt-in local JSON pack builder; checks explicit source/edition/jurisdiction/rights metadata and generates SHA-256 digests. It refuses an existing output path and never contacts a provider.
- `tests/fixtures/offline-knowledge-demo.json`: **entirely fictional** workflow text. No real electrical code, book material, or authority over a job.
- `npm run preview:knowledge`: localhost-only browser proof on `127.0.0.1:4237`; can search the loaded fixture while network is disconnected. This is a developer proof, separate from the real TradeFlow AI GUI, and is not precached for the PWA.

## Pack contract

```json
{
  "schema": "tradeflow.offline-knowledge.v1",
  "id": "my-pack-id",
  "version": "1.0.0",
  "builtOn": "2026-11-08",
  "audience": "private_device",
  "sources": [{
    "id": "source-id", "title": "Authorized reference", "publisher": "Publisher",
    "documentVersion": "Edition or revision", "reviewedOn": "2026-11-08",
    "jurisdictions": ["US-TX"], "kind": "book",
    "rights": "user_supplied_private_use",
    "rightsEvidence": "Owner confirmed private-copy use only",
    "contentStatus": "available_excerpt"
  }],
  "passages": [{"id":"passage-1","sourceId":"source-id","heading":"Topic","text":"An authorized short excerpt or owner's licensed notes."}]
}
```

Build after **lawful extraction/chunking** (not supplied by this task):

```bash
node scripts/build-offline-knowledge-pack.cjs source-manifest.json local-pack.json
```

For private content call `openPack(pack,{scope:{businessId,actorId}})` and supply the matching scope on **every** `search(query,{scope})`. This is a defensive in-memory binding, **not** cryptographic authentication or encrypted storage. Do not ship private packs as static public assets or load one in another business's browser. Proper private IndexedDB storage, role-authenticated read access, deletion, backup/restore and consent are later prerequisites. Reusable/redistributed reference packs require the separately reviewed `public_domain` or `licensed_redistribution` rights claim and evidence; user-supplied commercial books are not distributable assets merely because the user owns a copy.

Each result carries exact pack/source/version/section/review date/jurisdiction, passage digest, excerpt, synthetic or untrusted-reference status, and warnings to verify jurisdiction, revision and site conditions. These excerpts are **retrieval candidates**; the model may explain them only after proper sourcing and validated authority gates. A chunk is never itself an electrical safety instruction, current code ruling, financial figure, diagnosis, permission, approved command, or receipt.

## Developer proof

1. `npm run preview:knowledge` and open the shown localhost URL.
2. Search `material blocker` and `accepted estimate`; inspect provenance and synthetic labels.
3. Disconnect the network **without closing the page**, search again; the already loaded index continues working without the network. This is an offline search proof, not offline ASR/LLM/TTS or PWA launch/reload proof.
4. Run `node --test tests/offline-knowledge-pack.test.cjs`; run the existing full regression suite separately before integration.

## Required next stages

1. Founder provides the actual book titles/files and lawful-use terms. Rights-reviewed ingestion should extract/normalize sections (page, edition, source URL, effective date, jurisdiction) into short attributed chunks. Book bibliographic metadata alone is not its contents.
2. Add separate versioned private local storage through an approved existing IndexedDB upgrade, limits, tenant/actor security, import/delete/export, consent and stale-source invalidation. No private book bytes in the PWA's public SW cache or Git repository.
3. Integrate retrieval into **existing** Master Intelligence evidence/context adapter, with role-filtered business data and deterministic financial/electrical jurisdiction checks. Test prompt injection, stale codes, mismatched identity and no-action fallback.
4. Choose/test local on-device LLM and separate ASR/TTS only after phone RAM/storage/battery/performance and licensing measurements; remote online AI remains clearly labeled and explicit. No unconditional 'fully offline AI' claim.
5. Subscription/online usage metering is a separate server-authenticated commercial platform, gated by billing provider approval. Keep offline data usable with no subscription network round trip. Do not treat TradeFlow contractor invoices as TradeFlow SaaS subscription invoices.

**Safety:** no production deployment, D1 migration, PR merge, provider download, billing charge, customer data, microphone, model call or business mutation. Exact-head CI and physical iPhone acceptance are not supplied by this isolated local proof.
