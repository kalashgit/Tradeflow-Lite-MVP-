> Historical implementation notes. For the current dual-mode, durable engine, see [Universal Lead Intelligence](UNIVERSAL_LEAD_INTELLIGENCE.md).

# Lead discovery and enrichment V1

## Boundaries and setup

Discovery is added to the existing Research workspace, with an entry from Opportunities. It uses the existing business profile, IndexedDB `tradeflow-lite-v1` version **9**, settings store for research history, and opportunities store for explicitly accepted records. Existing Research Briefs, the Austin starter pack, user edits and the mobile navigation are retained. No database migration or second CRM is introduced.

The Worker needs a **server-side** `TAVILY_API_KEY` secret. Configure it only on `tradeflow-v05-preview`, using Cloudflare's secret UI or `npx wrangler secret put TAVILY_API_KEY --name tradeflow-v05-preview`. Never put it in public files, `.env` committed to Git, chat, or browser storage. Search/extraction consumes the configured provider's credits.

Online calls also require the existing owner workspace access code (`TF_AI_PREVIEW_TOKEN`). The existing session code is reused; otherwise the user enters it in Research. This value remains in memory/session, not research records. A separately managed `TF_DISCOVERY_ACCESS_TOKEN` can authorize administrative verification without changing the existing AI code. This is the existing shared-owner preview authorization model, **not** a new multi-tenant authorization system. A public multi-business service requires per-business server authentication and provider quotas before rollout.

`GET /api/discovery/status` reports configuration booleans only. A configured secret is not proof the provider accepted it. Missing or rejected credentials produce an actionable error; they never produce fabricated results. `/api/discovery/search` and `/enrich` are authenticated POST JSON endpoints, same-origin in browsers, with bounded input/output and timeouts. Search sources carry an HMAC proof; arbitrary or modified URLs/metadata cannot be submitted for enrichment. Rotating the provider secret requires a fresh search for pending signed sources.

No production Worker configuration is modified. The deployment workflow accepts only the integration branch or `feature/lead-discovery-v1`, checks out its exact triggering SHA, retains its preview-name guard and targets only `tradeflow-v05-preview`.

## A research run

1. Select contracting opportunities or contractor business prospects. These have different qualification rules and persisted categories.
2. Defaults come from actual primary/secondary trades, headquarters/service area, services and project preferences. Override per run. All 50 states and DC, custom trades, national/multi-state/state/metro/county/city/ZIP scopes are accepted. Batch size is 1–20 and must allow a result per selected trade.
3. One Tavily query per trade discovers public URLs. Results are distributed across trades; the index is not exhaustive and empty results remain empty.
4. Canonical source identity is checked against existing Opportunities, current jobs, and equivalent recent runs before extraction. Recent pending/rejected candidates are reused through history rather than repeatedly enriched within 24 hours. Company websites deduplicate by domain in prospect mode; distinct project URLs remain distinct in opportunity mode.
5. Extract the source and, when linked, at most one same-site contact/about page. Provider errors retry once when transient; persistent failures, progress and attempts are saved. Resume explicitly after a reload/interruption. Completed jobs are not replayed. Cross-tab ownership uses transactional leases; this browser must remain open to execute a run. Offline access includes history/review/accepted records, not online discovery.
6. Apply hard trade, geography, category, deadline, company-size and optional radius constraints **before** scoring. Every candidate remains unverified pending source review. Score is a transparent relevance heuristic, not a probability.
7. Open original sources, verify classification/location and add a note. Only qualified candidates with explicit review can be accepted. Accept inserts into existing Opportunities and records the decision in one IndexedDB transaction; it never upserts over an existing record. Repeat submissions and concurrent tabs recheck current records. Reject retains research history without creating CRM records.

## Evidence and limitations

Each candidate has a stable SHA-256 source/mode identifier, original URL, discovery timestamp, publication date when actually supplied, trade/category, observed name, published location/service territory, public contacts with source quotes, enrichment state, verification state, limitations and rule-based relevance. Missing publication dates, addresses, employees and contacts stay empty/unknown. Generic contractor websites are not presented as job requests. Procurement pages are not contractor prospects. Closed/awarded/cancelled or explicitly expired ISO-dated bids cannot qualify.

City/metro/county relevance uses explicit published area wording and state evidence. It does **not** claim authoritative administrative boundary containment. ZIP matching uses explicit source text. No approximate geographic distance is manufactured: radius filtering requires independently matching US Census address coordinates for both the headquarters and source's published street address. Unknown/ambiguous/mismatched geocodes fail the radius constraint. Census coordinates are address-range interpolation, not rooftop surveying. Other deadline formats, source freshness and current availability require reviewer confirmation. Unknown company size cannot pass an explicit maximum-employees constraint.

WhatsApp is optional in prospect mode. Only a source-advertised WhatsApp link with business-contact context can produce `public_contact_confirmed`. An ordinary phone number never establishes registration and never generates a wa.me link. Other statuses are `not_publicly_found` (on checked pages only) and `not_checked`/unknown, including failed contact-page checks. No outbound messaging is implemented. Accepted records preserve unknown consent/opt-out status; existing opt-outs and edits are never overwritten.

History, search summaries, public source quotes and pending candidates are stored locally under `settings` IDs `tf-discovery-run:<uuid>` and included in existing backups. API keys and access codes are excluded. No raw audio, AI-generated facts, fake app records, schedule automation or autonomous outreach is added.

## Extensible interfaces

- `TradeFlowLeadDiscoveryCore`: pure `defaults`, `validateCriteria`, `buildQueries`, `assess`, `duplicates`, `toOpportunity` and geographic/evidence helpers. Uses the existing portable engine's state list/address parser.
- `TradeFlowLeadDiscoveryRuntime.createRepository(database)`: existing IndexedDB transaction boundary.
- `createHttpProvider({fetcher, accessCode, origin})`: browser-to-Worker transport.
- `createRunner({repository, provider, snapshot, uid, now, onChange})`: `start(criteria)`, `resume(runId)`, `review(runId, candidateId, decision)`. Provider port: `status()`, `search(criteria, query)`, `enrich(criteria, candidate)`.
- `createTavilyProvider({apiKey, fetcher, delay})`: server adapter. Credentials never cross the server port. Additional real providers can implement the same transport contract and source provenance rules.
- `TradeFlowLeadDiscoveryUI.configure(bridge)`: existing app database/render/navigation/record-opening adapters; render output stays in Research.

Persistent versioned runs and injectable ports permit later server scheduling/worker queues without replacing Opportunities or rewriting qualification policy. V1 executes manually in the foreground; scheduled execution is not claimed.

## Verification and release gate

Run `npm ci`, `npm test`, `npx playwright install chromium`, `npm run test:discovery:browser`, and `npm run build:preview`.

The browser suite serves the actual application and Worker handler with an **explicit synthetic provider adapter**, in an isolated browser database. It covers Plumbing/Ohio and Roofing/Colorado in both modes, actual UI review/import, repeated/reloaded persistence, all 25 starter records and user edits, credential non-retention, duplicate prevention, offline access, and widths 320/390/1440. Screenshots/report are written to `test-results/lead-discovery` (or `TRADEFLOW_DISCOVERY_ARTIFACTS`). This is execution verification, not a live search-provider claim or a physical iPhone test.

For live acceptance: configure the preview secret; start Plumbing/Ohio and Roofing/Colorado research in a fresh test profile using the owner code; inspect original-source evidence; verify/reject results; reload and open accepted records in Opportunities. Check both modes and at least one actual Census radius query. Record provider responses, run IDs, source URLs and deployment commit/version without exposing credentials. A live provider call and live persistence must be recorded separately from synthetic tests. Do not mark the full definition of done complete until this succeeds.

### Verification notes

An added browser assertion initially tried to use the list's Discover leads button while an Opportunity dossier was still open. It timed out because that button belongs to the list. The test now uses the existing dossier Back button before using the list entry; record opening itself succeeded. The first preview workflow run was cancelled before deployment while this test was corrected.

The first completed CI attempt passed all unit/regression tests but exposed a browser-test wait race: an absent submit button during a render was treated as enabled. The wait now requires a present, enabled button and the expected persisted run-history count. Deployment was skipped by the guard. Live Census probes independently resolved matching public street addresses in Columbus, Ohio and Denver, Colorado; this does not substitute for live Tavily discovery acceptance.

### Live-provider qualification correction

After Tavily was configured, the first actual preview UI runs completed but returned contractor directories, a multi-company PDF and ranking articles in prospect mode. No candidate was accepted. Shared policy now rejects collection/ranking sources, including previously staged candidates at the import boundary; search excludes recognized collections before paid extraction and focuses on the requested trade. Educational procurement articles cannot qualify as opportunities, and fax-labelled tel links are excluded from voice phone fields. These real synthetic-free discoveries are regression fixtures, not evidence of real job availability.

Live tests also returned a union page and a generic bid-search collection; these now fail qualification/import rather than becoming individual businesses or projects. Review includes an editable, source-verified organization/project name, so a marketing page heading does not have to become the CRM identity. The original discovery title/evidence remains in run history and the accepted name is audited with the review. No discovered company is assumed to be small when its employee count is unknown. One blocked extraction produced a persisted retryable error, not a fabricated candidate.
