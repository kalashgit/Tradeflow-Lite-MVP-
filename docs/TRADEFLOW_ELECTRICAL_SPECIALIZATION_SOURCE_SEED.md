# TF-EC-REFERENCE-01 — Electrical contracting specialist source seed

The [source registry](../data/knowledge/us-electrical-contractor-references.v1.json) contains eight **verified primary/publisher entry points** relevant to TradeFlow's initial US electrical contracting focus, especially Austin, TX. Links were checked on 2026-11-05, but **no code or standard body has been ingested**, and the AI app is not yet linked to them.

## Rules for the future specialized Intelligence

- Separate estimating and operations advice (bid/no-bid, labor hours, change orders, job costs, schedules, procurement, receivables, permits) from technical code compliance and safety decisions.
- For compliance advice, first identify address and jurisdiction; applicable adoption date and local amendments are project-specific. NFPA lists 2026 NEC as its current edition; Texas TDLR announced 2026 NEC adoption effective 2026-09-01 with a specific exception; Austin lists the 2026 NEC effective 2026-09-01. **Current publication and adoption aren't the same concept.** Later amendments may change these rules.
- NFPA 70 and NECA standards are not public-domain wholesale training data; respect subscription, licensed-use and distribution limits. Reference metadata is not permission to scrape full codes.
- Public official sources may be retrieved by a licensed/approved adapter with refresh, cache, origin, content digest, source location, date, jurisdiction and stale/unknown flags. A link catalog alone cannot answer any exact compliance question.
- For field electrical/safety guidance, refer to a qualified, licensed electrician or AHJ when judgment is material; do not give unsupported authoritative claims.
- The next feature is source-backed operational SOPs (job intake; estimating; labor/materials; crew/dispatch; procurement; change orders; progress/completion; invoice/collections), with distinct evidence, gaps and tests. Do not assume these SOPs are already approved or part of publisher content.
- Build the actual reasoning adapter against the existing TradeFlow Master Intelligence and its permissioned business context; no separate chat backend.

Test: `node --test tests/electrical-contractor-sources.test.cjs`. No deployment or production data.
