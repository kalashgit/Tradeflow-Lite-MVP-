# Universal Lead Intelligence V1

The existing Research workspace supports **contractor prospects for TradeFlow** and **contracting work for the owner's business**. These modes use separate qualification and import classifications. Existing Austin starter records, profile settings, Opportunities, user edits, navigation and IndexedDB `tradeflow-lite-v1` version 9 remain intact.

## Components and stages

- `lead-intelligence-config.js`: offline natural-language configuration and bounded search planning. All states and DC, custom trades, 1–100 results, employee ranges and explicit geographic scope. Ambiguous city/state or radius-center details require clarification. It never executes a search. Registered aliases and profile trades are reusable; a free-text unknown trade remains available in the structured form.
- `lead-discovery-core.js`: normalization, trade/location validation, configurable weights totaling 100, evidence-backed field extraction, E.164 phone validation, provenance, conservative qualification and import construction. Same names need corroborating addresses/phones; publisher profiles do not merge by publisher domain. Scores are separate from verification. Missing fields remain absent.
- `discovery-api.mjs`: authenticated bounded API, server-only provider secrets, signed discoveries, extraction, strict Census geocoding and provider adapter contract (`name`, `check`, `search`, `extract`). Tavily is the implemented provider. Additional factories register in `createConfiguredProvider`; selecting an unknown adapter fails explicitly. Tavily `/usage` checks actual credentials before a durable run searches. Provider-reported credits are retained when supplied; they are not a complete billing estimate.
- `discovery-jobs.mjs`: discover → normalize → deduplicate → enrich → verify → score → stage. Deterministic orchestration is independently tested against SQLite.
- `discovery-workspace.mjs`: Cloudflare SQLite Durable Object and alarms, one isolated coordinator per authorized principal/business. Runs progress without a browser. RPC is reachable only through the authenticated Worker. SQL uses bound parameters. Each stage checkpoints before provider I/O; alarms have a recovery watchdog. Cancellation wins over in-flight results. At-least-once recovery may repeat a provider request after an interrupted response, but cannot duplicate the stored candidate/import.
- `lead-discovery-ui.js` / existing runtime: local offline history mirror and existing atomic Opportunities import. Approved server history on a new device requires a local import review; it never falsely claims an IndexedDB record exists there. Review during polling is preserved.

## Execution boundaries

Ten active runs per principal/business, one executing provider stage at a time, a 1.5-second gap between stages, provider request timeouts, bounded transient retries/backoff and a daily workspace limit of 500 search/enrichment jobs. An enrichment job can involve a primary and contact-page request and provider retries; the job count is not an exact HTTP-call count. Batches cap at 100; search plans cap at 100 queries and declare incomplete coverage when truncated. Results are a maximum, not a guarantee. Empty/partial/failed runs remain visible. Explicit retry covers retryable failures. A separate source-card action refreshes unreviewed completed candidates with missing fields, retaining previous evidence and enrichment metadata. Accepted/rejected records cannot be silently refreshed or overwritten; missing fields may remain unknown after retry.

`POST /api/discovery/runs/{create,list,get,cancel,retry,review}` uses JSON workspace credentials, optional `businessId` (default `business`) and pagination (`offset`, `limit`, maximum 100). Creation requires a stable `requestKey`; repeated keys reuse the original run and conflicting criteria return 409. `get` paginates jobs; `list` returns run metadata. Source evidence is durable staging, not a second CRM. Final approved records remain in the existing Opportunities store, with classification `business_prospect`, `potential_opportunity` or `project_signal`; discovery does not automatically assert verified demand.

## Authentication and tenancy

The established owner secret `TF_AI_PREVIEW_TOKEN` authorizes the owner namespace. Optional temporary `TF_DISCOVERY_ACCESS_TOKEN` is isolated in a preview-test namespace. An optional server secret `DISCOVERY_TENANTS` can provision distinct principal credentials as `{ "tenant-id": { "accessCode": "private-code" } }`; tenant names and credentials never come from caller-supplied identity claims. Each principal/business gets a separate Durable Object. Business IDs are additionally checked against a server-side allowlist: `businessIds` for provisioned tenants, or `DISCOVERY_BUSINESSES` for owner/test access. The default permits only `business`; callers cannot create arbitrary billable workspaces. No provider key reaches frontend assets or local business records.

This preserves the existing private-preview authentication model. It does **not** provision public SaaS accounts, identity verification, access-code distribution, billing or an administration UI. A production launch needs its intended identity provider and tenant lifecycle wired to the same server-side principal boundary. Do not share the owner code among unrelated customers. Nothing in this task deploys production.

The existing direct search/enrich endpoints remain for compatibility with old local runs; those calls do not acquire durable queue semantics. New runs use durable execution when the binding is available. The UI identifies background execution; local fallback requires an open tab.

## Verification and limitations

Verified means a scoped source review, not guaranteed current demand, contractor eligibility, accurate third-party assertions or consent to outreach. Dates are explicit; no missing year or timezone is invented. County/metro checks use published wording, not authoritative boundary polygons. Radius uses source addresses, strict US Census matches and documented haversine miles; unverified distances cannot qualify. The NLP interpreter does not silently choose a state for a city name.

Public WhatsApp links require published evidence. No number enumeration or outreach occurs. Source HTML is displayed as escaped text. Public individual opportunity requests do not expose extracted personal contacts. Private homeowner marketplaces, scheduled recurring runs, cross-provider failover, AI summarization, and automatic re-enrichment of accepted records are future work.

## Tests

`npm test`: complete application regression and new configuration, geography, duplicate, provider, auth, cancellation, recovery and SQLite checks.

`npm run test:discovery:durable`: actual workerd, Durable Object RPC, SQLite, alarms, runtime restart and isolation with an explicitly synthetic outbound provider boundary; no live provider success is implied.

`npm run test:discovery:browser`: actual app, API, review, import, preserved 25-record starter set, both discovery modes, reload/offline and 320/390/1440 layouts with synthetic provider fixtures. Live provider searches are reported separately.


Live-source regression policy: contractor ranking tables, directory search pages, careers pages and municipal inspection/code-enforcement information cannot become individual contractor prospects. The same guard runs before enrichment, during source assessment and at import (including old pending candidates). Page headings may be marketing copy; the prospect label defaults to the observed source title and the reviewer must supply the source-verified business name. Durable searches request a bounded set of 20 candidate URLs before local deduplication/quota selection, so cached sources do not consume the entire enrichment batch.
