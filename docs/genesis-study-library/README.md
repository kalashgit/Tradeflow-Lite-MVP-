# AION Genesis — AI Engineering Study Library
**Edition:** 2026-11-10 · **Status:** original engineering study notes, version 1 · **Destination:** isolated GitHub documentation branch; no production application changes.

> **Purpose.** Learn the concepts needed to design, evaluate and improve Genesis: a proactive, evidence-grounded, permissioned intelligence layer for electrical contracting businesses. These notes are an original synthesis and implementation curriculum, **not copied books** and **not a claim of full-book textual access**.

## Start here: the useful question
Not "How many books did I summarize?" but "What measurable capability does Genesis acquire after I understand a concept?"

**North-star experiment:** Given the same contractor information and time budget, does Genesis consistently make more correct, evidence-based, helpful decisions than a simpler LLM-with-search baseline—without unsafe actions or expensive complexity?

## Library map

| File | Core question | Priority |
| --- | --- | --- |
| [01 — Intelligence and planning](01-intelligence-planning.md) | How should Genesis represent goals, constraints, uncertainty, and multistep decisions? | High |
| [02 — Foundation models, agents, and evaluation](02-foundation-model-agents.md) | How do we build an LLM-based agent and prove it works? | **First** |
| [03 — Context, retrieval, and adaptive memory](03-memory-and-retrieval.md) | What to remember, when to retrieve, and how to prevent false or stale recollections? | **First** |
| [04 — Data systems and correctness](04-data-intensive-systems.md) | How should business records remain correct during concurrent updates, outages, and schema changes? | High |
| [05 — Reinforcement and outcome learning](05-reinforcement-learning.md) | How can actions be evaluated over time without mistaking correlation for improvement? | High |
| [06 — Neural network fundamentals](06-deep-learning-foundations.md) | What is a model actually computing and learning? | Medium |
| [07 — ML system building in Python](07-ml-systems-python.md) | How do datasets, baselines, training, and monitoring fit together? | Medium |
| [08 — Benchmark and experiments](08-genesis-benchmark.md) | What exact tests should determine a release? | **First** |
| [09 — Revision course and glossary](09-review-and-glossary.md) | How should this material be reread, tested, and applied? | Ongoing |

## Sources and provenance — distinguish the books precisely

User-provided five Google redirect links were tested through web retrieval. The first could not be resolved. Others resolved to GitHub-hosted PDF repository listings, **not a verified right to reproduce those files**. This library references official publisher/author material and knowledge of general technical subjects; it does not redistribute the PDFs.

1. **Unresolved Google link #1.** No verified title. For foundations, the library additionally uses Russell & Norvig's *Artificial Intelligence: A Modern Approach*, whose official companion includes chapters, pseudocode and code: https://aima.cs.berkeley.edu/
2. **Google link #2:** *Designing Machine Learning Systems with Python* (2016), **David Julian** (one listing also credits Vahid Mirjalili). *Do not confuse this with Chip Huyen's* Designing Machine Learning Systems (2022). Publisher/book metadata: https://books.google.com/books/about/Designing_Machine_Learning_Systems_with.html?id=vxOwDAEACAAJ
3. **Google link #3:** *Designing Data-Intensive Applications*, **Martin Kleppmann** (the linked repository appears to contain the older edition). The newer **second edition (2026)** is by Kleppmann and Chris Riccomini; avoid silently assuming the editions match: https://www.oreilly.com/library/view/designing-data-intensive/9781098119058/
4. **Google link #4:** *Reinforcement Learning: An Introduction*, **Richard Sutton and Andrew Barto**, second edition. Author-hosted source: http://incompleteideas.net/book/the-book-2nd.html ; publisher: https://mitpress.ublish.com/book/reinforcement-learning-an-introduction-2
5. **Google link #5:** *Deep Learning*, **Ian Goodfellow, Yoshua Bengio, Aaron Courville** (2016). Official full HTML text is available to read free (authors say PDFs are restricted by their publishing contract): https://www.deeplearningbook.org/
6. **Additional prior book:** *AI Engineering* (2025), **Chip Huyen**, official publicly posted chapter summaries and study notes: https://github.com/chiphuyen/aie-book
7. **Additional prior book:** *Designing Machine Learning Systems* (2022), **Chip Huyen**, publisher contents: https://www.oreilly.com/library/view/designing-machine-learning/9781098107956/

**Coverage labels:** 'Official contents / chapter-summary grounded' applies to AIMA, *AI Engineering*, *Deep Learning* and the newer DDIA edition's available contents; 'independent conceptual synthesis' applies to all implementation explanations; 'not fully reviewed' applies to the third-party PDF copies and the unresolvable first redirect.

## The architecture this library recommends (proposed, not textbook claims)

```text
TradeFlow records / owner requests / permitted APIs
              |
         Ingestion gate
(validation, tenant isolation, PII classification)
              |
        Evidence ledger + immutable events
              |                 |
       Current projections   Searchable history
              |                 |
         Context assembly + retrieval
              |
    Planner / reasoner / policy engine
              |
    Proposed action and expected outcome
              |
   Authorization boundary and execution
              |
       Verifier + outcome tracker
              |
    Benchmark / human feedback / review
              |
         Approved system updates
```

A memory store is not a self-learning model; a tool call is not a verified outcome; a persuasive explanation is not evidence. Preserve each distinction.

## What to build before choosing models or fine-tuning

1. Capture **100 controlled contractor cases** with answer keys and adversarial cases (see file 08).
2. Define a **minimal evidence schema**: source, tenant, timestamp, validity, visibility, revision and conflicting claims.
3. Implement **baseline retrieval** and measure evidence recall and temporal correctness.
4. Add a **typed, allowlisted, reversible tool layer**; require explicit approval for consequential external writes.
5. Instrument latency, cost, grounding, task success, error classification and actual post-action outcomes.
6. Only then compare alternate models, context strategies, additional planning complexity, and eventually learning policies.

## Reading strategy

Each topic follows the same loop: explain it aloud without jargon → work one example by hand → implement a small experiment → run the same benchmark before/after → record what changed. Use [09](09-review-and-glossary.md) to review without rereading the entire library.

## Legal, reliability and scope notes

- Original explanations only. No full copyrighted text, scan archive, or third-party PDF redistribution.
- These notes do **not** guarantee equivalence to each textbook's chapter-by-chapter detail; read the official material for definitions, proofs and nuance.
- General concepts are stable, but specific APIs, infrastructure choices, prices and laws must be reverified during implementation.
- Do not use client data in a public repository or public benchmark. Use synthetic or explicitly authorized/redacted data.
- Nothing here changes the TradeFlow app, merges a PR or triggers a deployment.
