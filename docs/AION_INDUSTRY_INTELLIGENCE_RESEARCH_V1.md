# AION Genesis GKB-02 — Public Industry Intelligence for U.S. Electrical Contracting

**Research-only / source-scoped pilot** • as-of **2026-11-12** • stacked on external-knowledge PR #108.

This iteration extends the existing TradeFlow Qwen adviser with public industry signals beyond codes and management notes. It does **not** claim to possess every contractor's history, current supplier prices, a nationwide licensing database, or verified competitor usage results.

## Deployed research components (not production)

- `src/genesis-industry-intelligence.cjs`: reviewed source ledger; short original source-linked notes; separate authority classes; a public competitor feature matrix; one actual fixed historical BLS wire/cable producer-price series snapshot.
- `src/genesis-adviser.cjs`: bounded retrieval from official safety references, GKB-02 industry evidence, GKB-01 official contractor notes and earlier TradeFlow authored playbooks. Retrieval supplies untrusted **reference data** rather than a system-role tool prompt.
- `public/conversation-store.js`: exact HTTPS domain allowlist expanded for reviewed official sources, product manufacturers, suppliers and competitor software websites. These are **external source citations**, not authenticated company evidence or instruction authority.
- `scripts/local-ai-preview-server.cjs`: local synthetic preview health reports source, historical-observation and comparison coverage with exact schema version.
- Tests check classification, published history, claims versus facts, unavailable/not-checked features, state-rule effective dates, licensing uncertainty, product pricing boundaries, citations and Qwen's no-action policy.

## Source categories

| Category | Public examples | Authorized use | Key restriction |
| --- | --- | --- | --- |
| Market size and competitor density | Census County Business Patterns, Business Dynamics Statistics, NAICS 238210 | Compare establishments/payroll, historical firm dynamics and market density | Aggregate counts, not individual competitors; Census APIs now require a key |
| Electrician labor and employment | BLS OEWS annual tables and BLS time-series API | Dated wage/workforce benchmarks | National wage is not prevailing wage or full employer burden |
| Electrical input-cost history | BLS PPI via FRED series `WPU102603` | Material-cost trend sensitivity | Index is not copper futures, a supplier quote, or actual price for an SKU |
| Federal contracting competitors | USAspending public award API, NAICS/PSC categories | Public contracts, recipients, agencies and historical award activity | Public obligations are not winning companies' revenue/profit |
| Licensing and adopted code | TX TDLR (rule and guide), MN DLI, WA WAC, CA CSLB, FL DBPR | Official rules, state/date scope and local verification leads | Municipality, permit date, amendments and employer license status must be resolved |
| Estimating and labor productivity | NECA 2025–2027 MLU announcement; company-own verified production records | Estimating methodology and **licensed** benchmark discovery | Do not copy or invent proprietary NECA labor-hour tables |
| Construction agreements | AIA A201 publisher summary, Procore public change-order explanation | Contract workflow and change-request concepts | Licensed contract forms and legal review remain separate |
| Product manufacturer resources | Eaton, Schneider Electric, Southwire, Leviton, Hubbell | Find official product families and current data-sheet sources | Exact SKU compatibility, listed equipment, substitution and approval never inferred |
| Electrical suppliers | Wesco distribution portfolio, Southwire dated price-list information | Source and purchase workflow discovery | Stock, negotiated price, discount and delivery promises are unavailable |
| Software competitors | ServiceTitan, Simpro, FieldPulse, BuildOps, Procore, Housecall Pro, Knowify | Compare publicly advertised capabilities and design TradeFlow feature validation | Never interpret vendor ROI claims as independently audited benefits |

## Real recorded historical example

FRED's BLS commodity PPI series `WPU102603` (nonferrous wire and cable, **Index Dec 1982=100**, **monthly**, **not seasonally adjusted**) showed these data as of Nov 12, 2026:

| 2026 observation | Index |
| --- | ---: |
| May | 471.913 |
| Jun | 480.082 |
| Jul | 482.453 |
| Aug | 496.418 |
| Sep | 497.992 |

Source: https://fred.stlouisfed.org/series/WPU102603. The snapshot is **not** live and the index does not measure contractor purchasing prices, labor costs or current COMEX market pricing. More history must come from an authorized source API/official downloadable file and be time-stamped; **no extrapolated or fabricated points**.

## Competitive benchmarking

`competitorMatrix` reports **only** features documented in a supplier's public first-party description and labels everything else `not_checked`, not `absent`. It never claims TradeFlow product parity or ranks competitors without independent user/outcome evidence. The comparison is useful for planning an informed product evaluation and for collecting reproducible feature evidence, not for treating vendor marketing copy as facts about another contractor.

For example, a feature comparison can be recorded for ServiceTitan's pricebook and dispatch, Simpro's job costing and AI site notes, FieldPulse's scheduling and margins, Knowify's WIP, Housecall Pro's electrical pricebooks, BuildOps's commercial-service focus, and Procore's permissioned change-event/order flow.

## Conflict evidence: 2026 Texas NEC

A publicly available TDLR rulemaking notice, posted **2026-09-01**, reports adoption of the 2026 NEC with a limited exception. An older Texas TDLR compliance-guide page still displays the 2023 NEC. Preserve **both sources** and the discrepancy. The actual binding law, effective date, location, project, permit date and local enforcement authority must determine the answer. AION must not silently favor whichever page was crawled more recently.

- Rule notice: https://www.tdlr.texas.gov/news/rulemaking/2026/09/01/commission-adopts-rules-12/
- Existing guide: https://www.tdlr.texas.gov/electricians/compliance-guide.htm
- Minnesota permit-date example: https://www.dli.mn.gov/business/electrical-contractors/electrical-codes-and-standards
- Washington transition rule: https://apps.leg.wa.gov/WAC/default.aspx?cite=296-46B-010

## Architecture for future comprehensive knowledge

1. **Licensed canonical-source inventory:** manufacturer/official code portals, AHJ boards, public government datasets, public trade association documentation, signed vendor contracts and authorized distributor feeds.
2. **Historical data factory:** Census CBP/BDS year × state/county/NAICS, BLS OEWS by occupation/location/year, BLS PPI monthly, USAspending public awarded contracts by fiscal year and NAICS. Preserve published year, observation year, revision/status, units, geography, source URL and legally permitted reuse.
3. **Public business-competitor intelligence:** public firm/service websites and published public contract wins (not private data or comprehensive personal profiles). Track claims separately from independently observed results; respect robots, publisher terms and rate limits.
4. **Product and supply graph:** manufacturer → product family → authorized SKU/specification → substitution review → distributor quote → inventory and delivery *with consent*. Do not invent SKU compatibility, price or availability from category pages.
5. **Labor learning:** estimate category → job quantity/conditions → actual verified labor hours → variance + uncertainty; distinguish company-private data from trade-level benchmarking. NECA/RSMeans/other licensed content requires an explicit license.
6. **Commercial strategy graph:** segments, financing, bid conversion, callback/rework, change-order approval, WIP, cash conversion and hiring. Test economic outcomes in synthetic simulations before real-company recommendations.
7. **Acquisition/QA:** narrowly allowlisted web/data adapters with ETags/hash, time budgets, source-evidence/rights checks, non-automatic publisher updates, adversarial instruction checks and independent holdout decision evaluation.
8. **Governance:** immutable provenance and snapshots; superseding/contradictory effective rules; separate read-only customer data with tenant/revision/consent; no external content can promote its own training weights or issue a business approval.

## Test and inspection

```bash
node --check src/genesis-industry-intelligence.cjs
node --test tests/genesis-industry-intelligence.test.cjs
node --test tests/genesis-external-knowledge.test.cjs
npm test
```

**Key future quality gates:** independent Q01 review, full app-suite green once the separate real orb media asset is restored, authenticated source-specific ingestion, time-/jurisdiction-aware retrieval, real contractor outcome validations, and an untouched protected evaluation set. No merge or production deployment authorized in this research PR.
