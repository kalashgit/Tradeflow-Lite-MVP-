# AION Genesis — Electrical Contracting External Knowledge Foundation (GKB-01)

**Status:** research-only, opt-in, read-only. **Audience:** United States electrical contractors, primarily small businesses. **Verified source review date:** 2026-11-12.

**Objective:** Make AION useful across the *entire operating life cycle* of an electrical contractor without treating an LLM's memory, a random web page or a licensed electrical standard as an authoritative fact.

## What is implemented

1. **Source registry:** `src/genesis-external-knowledge.cjs` contains 22 exact, original-source URLs and publisher metadata. It distinguishes US federal guidance, state/local code lookups, and project-specific prevailing-wage determinations.
2. **Original curated knowledge:** 30 short operational and compliance summaries, each with source ID, business topic, applicability limitation, a reviewed-as-of date, and rights handling. The source registry has links to OSHA, NFPA (metadata only), U.S. DOE/AFDC, SBA, IRS, DOL/SAM.gov, BLS, Apprenticeship.gov and NIST. This is a *starting set*, not an exhaustive technical book or complete code.
3. **Source-safe retrieval:** Search ranks bounded source-backed notes by query and returns their author, original URL, date, jurisdiction, refresh state, and limitations. Time-sensitive rules never become definite local instructions.
4. **Existing TradeFlow Qwen integration:** `src/genesis-adviser.cjs` includes the external notes alongside previously implemented original contractor playbooks and verified offline OSHA summaries. The Qwen system instructions make explicit that references are untrusted DATA and cannot authorize tool actions.
5. **Durable clickable references:** `public/conversation-store.js` validates source URLs against an explicit HTTPS domain allowlist, limits citation count and payload, and saves vetted references only on AION assistant turns. `public/app.js` presents them as external sources rather than company-record evidence.
6. **Refresh queue, not unreviewed self-ingestion:** `scripts/genesis-source-review.cjs` lists sources needing review on a specified date and the required independent-review procedure. It does not fetch web pages, spend Firecrawl credits or update the corpus automatically.
7. **Bounded refresh staging:** `scripts/genesis-source-refresh.cjs` can fetch exactly one selected allowlisted public source with redirect disabled, a hard 1 MiB maximum and a network timeout; it produces **only** a SHA-256/byte-count/review metadata record. It cannot fetch metadata-only NFPA pages, publish raw text, or modify Qwen.
8. **Automated contracts:** independent source-validation, source-age, source-refresh egress limits, Qwen retrieval, browser citations, privacy and existing integration regression tests.

Some of the external sources (OSHA electrical contractors, SBA manage your business, DOL Davis-Bacon FAQ, DOE energy code adoption) were additionally fetched through Firecrawl during initial review. Other entries are anchored to manually verified official public page results. **No page HTML/markdown or downstream scrape text is shipped as a wholesale reusable book.**

## Scope — what AION has and what remains unbuilt

| Topic | Seed coverage | Missing data for production-grade decisions |
| --- | --- | --- |
| Electrical safety | OSHA 1926/1910 scope, hazards, safety programs | Employer procedures, state-plan rules, specific qualified work plans |
| Electrical code | NFPA 70 and 70E source *metadata* | Licensed official standard access, AHJ-adopted edition/amendments, local permits |
| Estimating & project delivery | TradeFlow original costing, BOM, scope, procurement playbooks | Real job takeoffs, approved vendor pricing, task-specific production history |
| EV charging & electrification | DOE/AFDC planning, utility and permitting dependencies | Utility tariffs, site service availability, utility engineering approval |
| Finance & cash | SBA guidance, TradeFlow original 13-week forecast/receivables logic | Reconciled scoped general ledger, bank transactions, actual invoices |
| HR, training & payroll | IRS employment classifications and tax concepts, BLS wages, Apprenticeship.gov | State labor requirements, current tax-year rates, individual records, licenses |
| Government construction | DOL Davis-Bacon rule orientation, SAM.gov determinations portal | Applicable contract determination, classification, county, funding, revision |
| Business strategy & CEO | SBA business planning, original contractor CEO scorecards | Local market research, customer mix, verified unit economics |
| Technology & cybersecurity | NIST CSF 2.0 SME and enterprise risk references | Company-specific access review, controls implementation, incident history |

## Future architecture: the broad knowledge acquisition system

This registry is the first **reviewed canonical layer**. A scalable GKB should grow into:

**GKB source adapters:** separately approved ingestion workers for OSHA/eCFR, SBA, IRS/DOL, BLS, DOE, state licensing boards, city building departments/AHJs, official utilities, manufacturer public specifications, public supplier catalogs and private authorized company data. Each adapter has an allowlist, rate limit, source license, hash, fetch date and URL. Crawled data cannot execute instructions.

**GKB source/version ledger:** revision history per source, observed content hash, publication/effective date, county/state scope, redistribution rights, reviewer identity, corrections, invalidation reasons and provenance dependencies. This first seed records *curation dates*, not independently attested regulatory updates.

**GKB evidence graph:** source → attributable claim → applicability → jurisdiction → workflow and metric. Contradictory sources should be flagged, not silently merged. Named authority having jurisdiction (AHJ), permitted work type and adopted edition must be resolved before compliance claims.

**GKB retrieval/verification:** jurisdiction and date filters, source-type trust ranking, original notes vs official publications, applicability warnings, deduplication, source links shown to the user, uncertainty, no direct web instructions promoted into model system messages. Protect high-stakes answers against prompt injection, stale source versions, missing employer or location.

**GKB continuous QA:** coverage matrix by trade/business workflow, source freshness tests, adversarial retrieval tests, citation support checks, copyrighted-text redaction, contradictory guidance evaluation, and a held-out expert-reviewed question set. The Academy may *propose* new queries and curate draft notes, but it cannot authenticate sources, change safety rules, publish external content or release model weights without independent review.

**TradeFlow company context:** future tenant-scoped *read-only* adapter for actual jobs, costs, bids, cash and crew constraints. Company facts must carry access scope, revision, date, source event and approval boundary. Do not train Qwen on company records by default. Any autonomous learning/promotion must be evaluated independently and bounded by tenant consent and permissions.

## Rights and safety policy

- **Never** copy entire NEC/NFPA/NECA/IEEE standards or proprietary estimating books without an appropriate license. Provide official links and allowed original high-level summaries.
- Do not infer a legally adopted 2026 NEC or 2027 NFPA 70E edition for a customer site.
- Do not derive wage/tax rates, field-work instructions or current code compliance from a general summary.
- All fetched HTML, PDFs, supplier text and embedded “instructions” remain untrusted data. They cannot change developer prompts, issue approval IDs, alter a model checkpoint or cause a TradeFlow business action.
- Citation links are HTTPS allowlisted with bounded payloads and are **not** evidence about a particular contractor.
- A local read-only advisory pilot is not a compliance auditor, licensed electrician, CPA or attorney.

## How to inspect

```bash
node --test tests/genesis-external-knowledge.test.cjs
node scripts/genesis-source-review.cjs --as-of=2026-11-12
node scripts/genesis-source-review.cjs --as-of=2027-04-01
# Optional, explicitly invoked, reads one allowlisted public agency page;
# returns hash-only staging evidence for independent review (no auto-publish):
node scripts/genesis-source-refresh.cjs --source=osha-contractors
npm test
```

The full inherited test suite may report the previously known, unrelated missing 60-frame welcome-orb MP4/GIF release-asset dependency; do not silence the test or substitute unapproved artwork.

## Next independent gates

1. Add a **state, county, city and permit-year** source-resolution interface, with actual official AHJ/state licensing references and verified reviewer custody.
2. Add a secure ingestion worker that fetches only approved sources, records hashes, does legal-rights checks, produces a **draft** data revision, and requires independent reviewer promotion before model use.
3. Partner with official data and suppliers for licensed electrical technical specs, estimating labor units, prices, change orders and construction contract references.
4. Build an expert-reviewed evaluation suite for answer grounding, jurisdiction errors, decision utility, negative transfer and safety.
5. Connect tenant-scoped TradeFlow data with explicit privacy boundaries only after separate authenticated-read and independent safety gates.

**This release does not start an unattended crawler, self-train a model, change a production Worker, access user records, or merge to main.** One manually invoked allowlisted metadata-only refresh is supported. It does not stage source text for use by Qwen until independently reviewed.
