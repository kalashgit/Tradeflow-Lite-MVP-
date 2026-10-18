# Master Voice Command Library v1 — coverage audit

The supplied library is preserved byte-for-byte in `tests/fixtures/TradeFlow_Master_Voice_Command_Library_v1.json`.

- SHA-256: `b367794445c15e703efff84199728a90dc9f77336baac6e46d65658469128d6e`
- 361 unique entries across 20 named pages.
- Operations: 229 navigation, 81 read, 48 draft, 2 create, 1 modify.
- Source branch label: `feature/v05-map`; this is not proof of a particular deployed SHA.
- Source exclusions retained: Optimization, Communication, Automation, Data Intelligence.

The library explicitly labels most phrases as desired, unverified or needing mapping/testing. Its notes are neither capability registration nor execution authorization. Runtime modules never load this file or match its IDs/whole utterances.

## Current audit

Run `node scripts/evaluate-command-library.cjs > /tmp/tradeflow-library-audit.json` from the repository root. The auditor invokes only the interpreter and the existing command registry's pure parse/resolve functions. It does not create a command runtime, approve requests, execute operations, access the database or test rendered pages. Business records are deliberately absent from its synthetic context.

| Classification | Entries |
| --- | ---: |
| Navigation interpretation matches declared target | 192 |
| Navigation needs clarification or mapping | 33 |
| No registered interpretation | 73 |
| Interpretation only; operation mapping unverified | 35 |
| Candidate needs review or parameters | 28 |
| Total | 361 |

Of 229 navigation operations, 225 supply a target in their notes. The first two rows evaluate those 225; four other navigation entries have no fully annotated target and remain in the other coverage classes. All 20 declared workspace IDs are registered, but this does not establish their UI or form behavior. The remaining 136 page-operation entries generally lack complete parameter expectations and authoritative records, so this report is coverage, not an accuracy score or a passing-test count.

## Registry reuse

Verified navigation uses the existing registry's parser and workspace validator. A small shared grammar recognizes navigation verbs across all registered destinations; it is not a phrase table per workspace. Composite labels such as Settings / Preferences and Finance / Expenses are accepted only when both sides resolve to the same registered workspace. Different destinations remain ambiguous. Unverified aliases remain unsupported.

This required no edit to `public/command-registry.js`, main application navigation, header, database, service worker or deployment workflow. The standalone lab loads the existing registry as a read-only dependency; the application team must coordinate main-app script wiring. `createEngine({commands})` may receive the existing pure registry adapter. No executor is invoked by this option.

Customer creation, conversion of an accepted quote, assignment, scheduling and other business operations still require supported parameters, verified records and the authoritative approval/execution layer. In particular, the bulk-customer and quotation-conversion examples are not silently installed as new mutation capabilities.

Physical iPhone recognition, successful business execution and rendered workspace pages are **not measured** by this audit. Complete evidence is under `/workspace/artifacts/tradeflow-command-intelligence/universal-command-library-audit.json`.
