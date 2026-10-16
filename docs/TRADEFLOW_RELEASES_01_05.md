# TradeFlow — Release Delivery Plan (01–05)

Date: 2026-10-16
Owner direction: Build an original TradeFlow operating system, not a reproduction of Jobber's UI.
State: **Development in progress.** The word "released" below means preview deployment only, not public commercial release.

## Non-negotiable product rules

1. Maintain TradeFlow's distinct visual identity: sharp, dark, information-forward, readable typography; avoid unnecessary visual effects or interface imitation.
2. Primary mobile navigation stays **Home, Map, Opportunities, Finance, More**. Make functionality discoverable through a well-organized, searchable More directory.
3. Use one record graph: Opportunities → contacts/tasks/calendar → Quotes → Jobs → Invoices → Payments → Finance. Preserve IDs, source history, auditability and privacy.
4. Keep acquisition results classified honestly: verified demand, potential opportunity, project signal or general business prospect. Source URL, source date and checked-at date accompany research claims. Never invent contacts or sales demand.
5. Core one-time founding offer is **$199 (launch hypothesis)** with 25 manually sourced, evidence-backed prospects/projects selected for that customer, subject to acceptable fulfillment terms. Paid research credits and other metered services may be one-time purchases; ongoing expenses must be priced sustainably. No unbounded AI or API usage is included by default.
6. Only label tested features Available. Show work-in-progress as Preview or Planned. Never represent drafts as sent, quotations as paid revenue or suggestions as actions executed.
7. Preview on branch **feature/v05-map** and Worker **tradeflow-v05-preview**. Do not modify main or production **calm-rice-1ea7** without explicit approval.

## R01 — Navigation, targeting and AI Missions

**Status: Implemented in development preview; needs hands-on phone acceptance.**

- Improved More directory: Growth Intelligence, Business Missions and searchable Explore Capabilities.
- Persist multiple independent editable ICP records. Fields: name, trade, B2B/B2C, service area, travel radius, organization size, target organization types, preferred jobs/project values, buying signals and exclusions. One ICP may be active at a time.
- Persist multiple editable buyer-persona records; link to a selected ICP. Track decision role, motivators, objections, pain points, trigger events and preferred outreach channels.
- Targeting records are saved in existing IndexedDB settings records; backups cover them. No remote account is assumed.
- Rule-based mission recommendations are created from actual local records. User explicitly adds each recommendation into existing Tasks; Tasks/Missions share completion status. TradeFlow AI chat provides advice; it does not autonomously create actions or call research tools.
- Opportunity dossier supports public business phone/email/contact person, HTTPS source URL and ICP assignment. Call/SMS/mail use native browser phone links; contact evidence status must not be fabricated. Opportunity CSV import/export covers optional new fields.

**R01 acceptance:** Profile create/edit/delete and link constraints, no duplicate pending mission creation, task status persistence, contact validation and navigation, map regression, backup compatibility, iPhone usability, production untouched.

## R02 — Scheduling, crews and field operations

**Status: Calendar foundation implemented in preview. Advanced R02 work remains.**

Now implemented:
- Calendar day/week/month navigation using real Jobs' scheduled dates and Tasks' due dates.
- Create an appointment with optional time, minutes, location, staff assignment note and description; stored as a Task in the same local DB.
- Prepare a scheduled call/site visit from an opportunity.
- Calendar entry in More and in the capabilities directory.
- No automated crew GPS, booking confirmations, notifications or routing service yet.

Next development work:
- Job assessment checklists and reusable field forms with offline drafts; downloadable/printable PDF, signatures and versioned submissions.
- Job-linked photos and documents, local storage limits, import/export and cloud storage migration later.
- Schedule conflict detection, drag/drop/rescheduling and daily agenda.
- Crew identity, roles/permissions and assigned work. Authenticated shared workspace is prerequisite.
- Map overlay for today's scheduled field visits; manual stop selection first, then API-backed travel times and constrained routing. No invented ETAs.

**R02 acceptance:** Calendar date correctness across timezones, no lost edits, data portability, usable iPhone viewport, form attachments supported offline, routing results sourced from a real routing provider, consent for location features.

## R03 — Quotation, invoice, payment and profitability workflow

**Status: Planned.**

- Quote → accepted quote → Job → invoice draft → delivered invoice → paid/part-paid/overdue, with traceable IDs.
- Invoice PDF and customer-facing payment links, taxes, due dates, deposits, reminder and refund records.
- Business-specific payments through verified merchant accounts (e.g. authorized Stripe Connect integration); webhooks and idempotency determine payment finality, not a locally edited label.
- Job costing: budget, labor hours/rates, materials, travel, subcontractors, allocated overhead and variance to actuals.
- Distinguish projected margin, actual profit and cash flow. Prevent double counting estimates and posted expenses.
- Owner's country-specific currency/tax rules and a full quote/invoice audit trail.
- Financing only through a legal, approved external provider with eligibility and disclosure; do not claim all customers qualify.

**R03 acceptance:** Payment sandbox tests; webhook replay and refund tests; totals reconcile; correct invoice IDs and ownership; authorization and data security; tax/fee handling; no phantom revenue.

## R04 — Paid acquisition intelligence and marketing automation

**Status: Planned. The current opportunity import is manual and AI chat cannot conduct background research.**

- User selects ICP/persona, trade, location, sources, exclusions and desired quantity. A one-time research package or credit purchase authorizes a defined batch; server verifies entitlement before any costly search.
- Research orchestrator handles queued → researching → enrichment → source verification → deduplication → QC → completed/partial/failed, with retry/cost caps/rejection logs.
- Store evidence and verified public business contact information; publish results into Opportunities only after validation and preserve which ICP, persona, run and sources produced them. Optional plotting with supported coordinates.
- Outreach: draft and review email/SMS/phone scripts, native handoff initially, approved provider integrations later with opt-out and sending logs.
- SEO/Google Business Profile audits, optional website editor, Google/Meta ad drafts connected to owner's approved accounts. Actual campaign publication and spending require granular confirmation.
- Google review request and referral workflows only for eligible past customers; neutral requests, permissions and no review gating or incentive manipulation.

**R04 acceptance:** Real research precision/quality measures, public source audit, server-side quotas/payment checks, contact compliance, suppressions, retries and spend constraints, measured conversion to relevant opportunities.

## R05 — Secure integrations, customer experience and operations sync

**Status: Planned.**

- Secure owner/company accounts; tenant-level separation, roles for crews, staff permissions, audit logs, access revocation and account recovery.
- Cloud file storage and multi-device sync/migration from existing local IndexedDB. Do not silently upload existing local customer records.
- Customer portal for approved quotes, appointment confirmation, forms and invoices, with robust authentication.
- Two-way QuickBooks Online sync if technically and commercially justified: OAuth, webhook listener, object-mapping, deduplication, reconciliation, ownership rules, conflict resolution and retry logs.
- Third-party integrations (e.g. Make/Zapier) behind authorized webhooks/automation triggers and scoped keys.
- Route optimization for multiple crew/task constraints and optionally consent-based live fleet tracking with strict privacy controls.

**R05 acceptance:** AuthZ/tenant-isolation penetration tests, safe onboarding/migration, connection cancellation/reconnect flow, no destructive sync loops, accounting reconciliation, permission-based crew tracking, support and error monitoring.

## Public launch is a separate gate — not automatically satisfied by five releases

The current environment is offline-first local IndexedDB; the AI preview access code is **not** a customer account or purchase entitlement. Before inviting paying customers into live multitenant features, deliver:
- Registration/login, verified ownership of accounts and paid feature entitlements.
- One-time checkout, receipts, refunds, fulfillment terms, safe key/secret handling and backend payment webhook security.
- Multiuser data isolation, privacy policy and terms, consented contact usage, file handling and backups/recovery.
- Real-device iPhone tests, full regression suite, security tests, production monitoring and support contact.
- A sales test with real electrical contractors in Austin: confirm at least a few paid orders, source-backed lead relevance and customer use—not just positive reactions to the demo.

Market readiness should be accepted based on these checks and customer evidence, not the number of screens.

## Next work in sequence

1. R02 finish: assessment checklists, downloadable job forms, file attachments, appointment edits/conflict handling and daily map jobs.
2. R03 start with **invoice drafts and job costing** as local-first workflows; integrate hosted payments only with a verified provider account and customer identity.
3. R04 connect saved ICPs/personas to a human-operated research fulfillment interface first; only add paid automated workers after quality is demonstrated.
4. R05 add secure, tenant-scoped cloud foundation incrementally as features require it rather than introducing fragile integrations on local-only data.
5. Run full commercial launch QA, fulfill the first 25-record customer packages honestly and improve based on paying-user feedback.
