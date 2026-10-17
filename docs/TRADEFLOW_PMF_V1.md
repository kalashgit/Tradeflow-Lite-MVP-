# TradeFlow — Product/Market Fit V1 (launch hypothesis)
Date: 2026-10-16
State: Launch positioning DECIDED FOR TESTING; product-market fit NOT yet empirically proven.

## Positioning
TradeFlow is an opportunity-first, phone-friendly business workspace for small trade contractors. The launch combines a one-time-purchase core operations app with a manually curated, evidence-backed local business-prospect / project-signal package. Paid monthly upgrades are optional and cover ongoing AI and researched data services.

One-line pitch:
"Find relevant electrical work around Austin and organize your business in one place—without mandatory monthly software fees."

## First ICP / buyer
- Geography: Austin, Texas, then the metro.
- Vertical: independent owner-operated electrical contractors.
- Staff: target 2–10 first, allow 2–15 based on job fit.
- Work: commercial renovations, tenant improvements, electrical upgrades, maintenance; relevant subcontracting and property/facility relationships.
- Decision maker: owner or owner/operator controlling software spend and finding work.
- Friction: fragmented records and sources; needs a credible, manageable pipeline of relevant work; little appetite for complicated ongoing platforms.
- Exclude initially: large enterprise subcontractors, purely high-volume residential emergency dispatch operations, government-only bidders without qualifications, companies needing sophisticated multiuser crew dispatch, full-service accounting/bank integration, or guaranteed live/closed sales leads.

## Launch offer
$199 one-time FOUNDING EDITION (hypothesis, test with customers; don't promise indefinite price):
- Current TradeFlow Core workspace: customer records, quotes, jobs, tasks, manual cash-flow/expense recording, research/opportunity records, interactive 2D map, import/export/backups and offline local storage.
- 25 individually researched, de-duplicated, relevant prospect/project records matched to the paid customer's documented ICP and buyer-persona brief.
- Optional founder onboarding to configure trade and geography.
- Core purchase entails a defined software version and support terms, not lifetime API hosting or all future cloud services.
- Review the app's current functions before describing advanced invoicing, bank feeds, online payments, cross-device sync, team accounts or automated outreach as already working.
- Research classification MUST distinguish (1) verified demand (explicit request), (2) potential opportunity (relevant subcontracting signal), (3) project signal (activity without confirmed buyer need), (4) business prospect (target company without current need). Do not sell all 25 as confirmed job-ready buyers; source URLs, evidence and checked-at date required.
- If fewer than 25 suitable records are available, offer more research time or mutually agreed refund/revised delivery before taking payment as guaranteed results.

## Proposed optional pricing hypotheses
- AI Pro: $29/month, usage capped; AI assistant, contextual analysis (with permission), advanced assistance when implemented.
- Intelligence: $79/month; refreshed customized project/permit/prospect research with explicit cadence and result/credit allowances, NOT yet implemented.
- Acquisition: $199/month; future account-gated worker-run lead discovery/enrichment/QC with quotas, NOT yet implemented.
- 3D map and advanced imagery: later premium feature, licensing/costs to be validated; Google Earth Pro is not an embeddable API.
- All upgrades OPTIONAL; no subscription required for current purchased core.

## Competitors / triangulation as of 2026-10-16
- Jobber: Core advertised $29/month billed annually and $49/month month-to-month; industry-standard operations suite, more mature than TradeFlow. https://www.getjobber.com/pricing/
- Housecall Pro: Basic starting $59/month billed annually; scheduling, quoting and payments. https://www.housecallpro.com/pricing/
- ConstructConnect: starter $129/month per market; verified commercial project intelligence. https://www.constructconnect.com/pricing/
- Do NOT claim feature parity with those products. TradeFlow's advantage is its specific opportunity-first bundle and no mandatory subscription, subject to validation.

## Buyer research brief (manually gathered on sales calls)
Collect trade and specializations; cities and travel radius; preferred project types; job value/crew size; buyer-organization types (GC, property manager, property owner, facility manager); decision maker roles; current project sourcing and software; excluded categories and companies; desired results; current costs; explicit purchasing intent. Avoid assuming every buyer wants the same 25 leads.

## Initial funnel and PMF gates (hypotheses—not evidence yet)
1. Identify 40–60 qualified local owner-operated electrical contractors from publicly documented business profiles (no spam, respect contact permissions).
2. Conduct at least 15–20 real customer problem conversations; ask about last attempted purchase, where leads come from, how they organize quotes/jobs, what projects they would reject, what solution they pay for today.
3. Present a working live demo + 3–5 sample real, accurately classified local records per customer; no imaginary 'confirmed' leads.
4. Make at least 8 explicit $199 purchase offers.
5. Seek >=3 customers actually paying $199, not just complimenting the demo, with refund/fulfilment terms disclosed; this is **initial willingness-to-pay validation**, not established PMF.
6. Deliver 25 researched records to each initial customer, QA against their saved ICP. Target >=80% buyer-rated 'relevant' after actual review, and >=5 attempted permitted business contacts/applications per customer within 14 days.
7. Interview buyers about usefulness 14 days after delivery. Track refunds, accepted opportunities, qualified conversations, time savings, bugs, and upgrade intent.
8. If conversion is low, diagnose profile/lead quality vs product utility vs offer/pricing and iterate before building auto-lead agents or 3D map.

## Launch release gates
- Live AI preview has worked, but private preview password is NOT a customer account or subscription identity.
- Need individual account auth, verified Stripe one-time checkout, non-replayable fulfillment, license-to-account relation, entitlement checks on paid features, payments/webhook idempotency, privacy/terms/refunds, and end-to-end test before general public sale.
- Offline first IndexedDB currently saves data per browser origin, not cloud synchronized. Customer onboarding must state this and encourage backups.
- Marketing must distinguish current demo capabilities from future roadmap. Paid Pro subscription features unavailable until implemented, metered and tested.
- Preserve existing production and finished opportunity map. New features use separate preview branch and reviewed deployments.

## Message testing
Variant A, core-led: "A practical mobile business workspace, owned for $199, with 25 researched Austin electrical business opportunities included."
Variant B, opportunity-led (PREFERRED): "Find your next electrical opportunity and manage the job from one place. $199 once, with 25 researched prospects/projects chosen for your business."
Variant C, service-led: "We'll personally build your Austin electrical prospect list and give you a simple app to manage it and your daily operations."

Test which message attracts a paid purchase rather than merely clicks, and retain only verifiable promises.
