# TradeFlow Acquisition Intelligence — Future Product Module
Status: Product roadmap only; NOT currently implemented, active, or for sale.
Recorded: 2026-10-16
Origin: Founder conversation in TradeFlow App Builder Chat 2.

## Product idea
TradeFlow should evolve into a business headquarters for any supported trade, combining existing local business tools and opportunity map with customer-specific acquisition research. Customers configure their **Ideal Customer Profile (ICP)**, **buyer persona**, market and buying signals, then eventually use a paid **Run Lead Search** action. Background research workers discover, enrich, verify, deduplicate, score, and present relevant business prospects and potential work opportunities with evidence, map pins where appropriate, and exportable results.

This feature is not a lead capture form and is not an outreach or follow-up automation feature. It is a **research / prospecting intelligence product**.

## Two-stage commercial rollout
### Stage 1: Founder-operated / done-for-you service
- On onboarding/sales call, ask each customer for ICP, buyer personas, trades, service geography, capacity, project preferences, desired buyer types, exclusion criteria and sourcing restrictions.
- Save an individual research brief for each paying customer.
- Run specialized research workers manually for their brief; perform source and contact validation and final quality control.
- Deliver verified evidence-backed prospects/opportunities and explain the distinctions and quality limits.
- Collect customer feedback on true lead quality and conversion; refine ICP and scoring.
- Don't promise that any prospect is actively hiring without direct evidence.

### Stage 2: Self-serve paid acquisition engine
- Customer edits saved ICP / buyer personas in the app, sets market/radius and optional source URLs, and presses **Run Lead Search**.
- Backend verifies the account and subscription/credits, enqueues an asynchronous research job, tracks progress and costs, enforces quotas, and returns results.
- Proposed job state: queued -> researching -> enriching -> verifying -> completed / partial / failed, with a rejection log.
- Saved runs allow rerunning the same targeting profile with freshness controls and tracking changes over time.
- Billing and account authorization MUST be server verified. Do not rely on local-only paywall checks.

## Saved targeting profile (schema concept)
- owner/account ID; profile ID/name; industry/trade(s); city/region/state; radius; service areas.
- customer segment: B2B/B2C, business types, roles, organization size, budget/project value range, preferred project types, capacity.
- buyer persona: decision-maker role, buying motivations, triggers/pain points, objections, urgency, preferred purchase method.
- signals: permit activity, tender/open bid, project planning/construction, facilities/property maintenance, real-estate listings, public corporate developments, news and other permitted source classes.
- custom sources: customer-supplied source URLs, authorized API references, monitoring cadence, permitted uses.
- exclusions: industries/project sizes/out-of-region, previously contacted or unwanted companies, blocked domains, duplicate policy.
- quality threshold, result quantity, freshness window, last-run timestamp and feedback-based tuning.

ICP describes **which organizations or consumers to target**; buyer persona describes **who makes the purchase decision, why and when**. Keep the two separate and link many personas to one ICP if necessary.

## Record outputs
Every result needs ID, tenant/profile/run ID, canonical organization/project identifier, name, location and optional coordinates, description, category (business prospect / project signal / potential opportunity / verified demand), ICP fit, buyer-persona fit, confidence and evidence explanation, source URL, source publication date, checked-at date, status, dedup keys, research owner/worker and public contact fields only when sourced and permitted. Missing fields must remain missing. Never fabricate email, phone, a live job need, bid status or buyer intent.

A permit or news item is not itself proof of a buyer seeking an outside contractor. Real-estate MLS access requires approved data rights; user-entered URLs do not automatically authorize crawling, republishing or bypassing access controls.

## Proposed backend boundaries
- UI: profile wizard and a separate lead-search Run button, results view, job status/history and opportunity map overlay.
- Auth & subscription: account scoped server-side entitlements, paid plan/credits verification, per-run quotas, usage metering and abuse controls.
- Orchestrator: persisted queue/workflow for slow work, retries, partial completions, cost limits and idempotent jobs; never run a large crawl synchronously as a single HTTP request.
- Research adapters: official open datasets/API feeds, authorized website collection, sector-specific searches and optional permitted user sources.
- Workers: discovery -> enrichment -> QC -> classification and scoring -> deduplication -> results publishing.
- Data: private multi-tenant account tables, source evidence, run logs, reports, feedback, rejection/audit trails; access-control checks on every read/write.
- Results: lead cards, explanations, map (only with supportable coordinates), watchlists, export, optional future refreshed monitoring.
- Privacy and compliance: obey site access restrictions, respect privacy and contact permissions, avoid harvesting personal data or encouraging unsolicited mass messaging, do not expose other customers' leads.

## Commercial hypotheses to test before automation
- Paid concierge prospect report priced per batch / custom engagement (to validate quality and demand).
- Subscription with research credits or limited runs; optional higher-volume credits later.
- Measure actual useful, source-backed results, report-to-conversation conversion, cost per accepted lead, user willingness to pay, and time saved.

## Example customer mission
Electrical contractor with 2–15 workers, Austin TX, radius 25 miles, target buyers: commercial general contractors and property managers, project scope: commercial renovations, panel upgrades and tenant improvements, selected project size: small/medium. Search for relevant evidence-backed prospects and opportunities; show source age, classification, contact evidence and map candidates.

## Relationship to other concepts
- Opportunity Map 2.0 / Live Intelligence: future monitored feeds and customer-specified authorized sources, with map visualization.
- TradeFlow Territory: separate future gamified, opt-in business competition product (not needed for acquisition research).
- TradeFlow AI: currently private preview; could eventually help create/revise ICP and explain report results. AI chat alone does not execute research jobs.

## Frozen near-term scope / immediate priority
1. Owner sets the Cloudflare AI private preview token and tests live AI chat.
2. Build subscription, account verification, checkout/webhooks and entitlement foundation.
3. DO NOT implement lead capture/follow-up automation, the new acquisition worker backend, live website crawling or Territory now. All remain future roadmap items.
4. Preserve existing working opportunity map and production deployment; use preview workflow for any future implementation.
