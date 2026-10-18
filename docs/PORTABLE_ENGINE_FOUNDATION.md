# TradeFlow Portable Engine — Foundation 01

## Architecture contract

TradeFlow is **local-first**, with optional cloud execution and AI providers. Neither the product data model nor portable engine imports Cloudflare, OpenAI, Anthropic or other vendor SDKs. A host binds adapters to the engine.

### Engine interfaces (implemented in public/tradeflow-engine.js)

- normalizeAddress(record|string) — deterministic U.S. address parser; preserves original text and returns structured fields and parse status.
- canonicalKey(address) — normalized key for duplicate detection and caches.
- candidateScore(normalized,candidate) — transparent confidence and reasons; never count city/ZIP alone as a verified project location.
- makeEngine({geo,ai,store,jobs}) — accepts interchangeable adapters; missing adapters fail explicitly when invoked.
- geo.geocode({street,city,region,postalCode,country,query}) -> structured candidate results.
- ai.generate({messages,model,system,signal}) -> provider-supplied generated text.
- store.get(key) / store.set(key,value) -> persistence.
- jobs.enqueue({id,type,payload}) -> durable queue boundary.

### Important limitation

These are portable **interfaces**, not yet actual implementations of AWS, Azure, Google Cloud, customer-hosted servers, Claude, Gemini, OpenAI or durable cloud queues and sync. The existing Cloudflare AI preview is still the running provider. Map geocoding still uses the browser's Nominatim requests, which must be replaced with a licensed bulk provider for commercial-scale usage.

### Provider-neutral roadmap

1. F01 (this release): Portable engine, U.S. parsing, existing Opportunities integration and independent tests.
2. F02: Versioned opportunity schema, match-review state machine, idempotent jobs, local storage and sync outbox.
3. F03: One operational cloud adapter with queues, geocoding quota controls, persistence, retries, progress and resume.
4. F04: Customer-managed deployment adapters for Cloudflare, AWS, Azure, Google Cloud and self-hosting, tested independently.
5. F05: Bring Your Own AI adapters, per-model capabilities, consent, secure credential handling and usage reporting.

### Local-first guarantees to engineer

- Local business data works without network; cloud services are optional.
- Sync uses versioned conflict resolution, never silently overwrites records.
- Secrets stay in provider-hosted vaults, not shipped to a browser bundle or IndexedDB.
- Network transport is encrypted and every workspace is properly scoped.
- Geocoding quality and verified buying demand remain separate classifications.
- Genuine BYOC means the customer owns the cloud account and its usage bills. Platform-managed isolation is a different offering.
- No provider may be labeled working before an integration test and actual deployment pass.

Production remains untouched by this staged implementation.
