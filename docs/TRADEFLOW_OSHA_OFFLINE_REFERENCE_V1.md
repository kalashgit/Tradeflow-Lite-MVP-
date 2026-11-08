# TradeFlow Intelligence — First real offline electrical reference pack

**Status:** Implemented locally, read-only; not a full code library, live model enhancement or field authorization. Date: 2026-11-08.

## Source and rights

The first pack has four official OSHA federal regulatory sources and six short, original TradeFlow-authored paraphrases:

| OSHA reference | Indexed topics |
| --- | --- |
| [29 CFR 1926.417](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.417) | Lockout/tagging in construction |
| [29 CFR 1910.333](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.333) | Deenergizing, energy isolation, verification by qualified people |
| [29 CFR 1926.404](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.404) | Jobsite ground-fault protection |
| [29 CFR 1926.400](https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926.400) | Construction electrical hazards/scope |

The source manifest records publisher, source URL, jurisdiction `US`, review date, document version and rights rationale. These OSHA regulations are US federal-government material; the pack copies no third-party graphics or textbook content. All summaries are newly written; they are not official OSHA interpretations. The United States copyright rule for federal works is [17 USC 105](https://uscode.house.gov/us/usc/119-124/t17/s105/).

## Offline retrieval and chat integration

- The structured manifest is `docs/TRADEFLOW_OSHA_ELECTRICAL_REFERENCE_MANIFEST.json`.
- `scripts/build-offline-knowledge-pack.cjs` creates `public/osha-electrical-safety-pack.json` with SHA-256 hashes of each passage.
- `public/offline-knowledge-pack.js` verifies audience, rights, source metadata, scope, passage checksums and bounds before exposing a read-only `search` method.
- `public/electrical-reference-chat.js` handles explicit OSHA/electrical-safety questions and formats citations. It does not execute operations or call a model.
- `public/app.js` routes those questions into the **existing** saved conversation and labels replies `OFFLINE OSHA REFERENCE · ORIGINAL PARAPHRASE`. The source identifier is `offline_knowledge`; references are retained with saved turns.
- `public/index.html` and `public/sw.js` load and cache the pack and modules. After the updated PWA installs online, these references can be read without connectivity. Offline voice recognition/synthesis is **not** supplied by this pack.

## Acceptance and remaining limitations

Verified Node scenarios: relevant lockout and GFCI queries, citations, unsupported-question no-match, checksum tampering, untrusted-source rejection, and chat/PWA wiring. The full application tests also remain required. Browser/iPhone verification must be performed on a reachable development preview; the managed environment's Playwright Chromium download failed and its separate cloud browser could not reach the container-local server.

This narrow pack cannot tell workers how to repair, diagnose or energize particular equipment. The exact applicable electrical code, employer procedure, AHJ, training and site conditions must be checked by competent professionals. Do not confuse OSHA workplace safety rules with the full NFPA/NEC installation code. The 59 Academy sources remain **metadata-only** in the installed catalog until actual rights-cleared notes are supplied. There is no fabricated claim of model fine-tuning, online grounded generation, live electrical code compliance or production readiness.

**Next technical gate:** expand into rights-cleared electrical/business excerpts, store passage-level jurisdiction and edition records, add semantic ranking and evidence validation for model-assisted answers, then test online model reasoning against holdout contractor scenarios. No new business-action permissions.
