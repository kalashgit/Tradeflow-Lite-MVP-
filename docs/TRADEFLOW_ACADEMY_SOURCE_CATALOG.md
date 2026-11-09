# TF-KNOW-02 — Source catalog seed (nonproduction)

This is a **versioned bibliographic and learning-objective metadata seed**, exported from the real Notion [TradeFlow Master Intelligence Academy](https://app.notion.com/p/40df639e237381928ea2eef4c1ea4d16) on 2026-11-05. It is the first concrete input artifact for [Issue #32](https://github.com/kalashgit/Tradeflow-Lite-MVP-/issues/32). It does **not** make the running Intelligence trained on or aware of all 59 books.

## Integrity boundaries

- Catalog includes exactly 59 row IDs, title, author, reference URL and original Academy training objective. Rows 1–19 refer to a separately described original paraphrased guide, 20–39 to structured notes, and 40–59 to metadata/curriculum only. **None of those book bodies are embedded here.**
- Publisher/external links do not establish rights to crawl or index full texts, and source metadata cannot substantiate particular chapter claims.
- Public repo contains only the Academy's descriptive bibliographic catalog. It contains no tenant/customer business data, private memories, copyrighted full texts, speech weights or license grants.
- A downstream ingestion job must first acquire permissible content, record evidence provenance/edition/digest/right-to-use, classify factual claims versus editorial hypotheses, and run tests before marking any KnowledgeItem as approved and retrievable.
- Never use this source catalog as a fact source to invent prices, electrical code compliance, job profitability or operator authority.

## Test

`node --test tests/academy-source-catalog.test.cjs`

## Next implementation slices

1. Ingest actual available original study-guide passages with source-page/block citations, review rights and version; generate typed principle/mechanism/counterexample/applicability records.
2. Add genuine, maintained electrical-contractor SOP and code-aware source references with jurisdiction/date/license, plus synthetic contractor tests; do not scrape paywalled codes.
3. Add retrieval to the **existing** TradeFlow Master Intelligence conversation/coordinator and distinguish text-only fallback.
4. Benchmark the retrieved principles on real-data-safe synthetic quote/job/cost scenarios and connect to the approved knowledge/memory contract.

**Do not merge or deploy this branch without engineering review and founder authorization.**
