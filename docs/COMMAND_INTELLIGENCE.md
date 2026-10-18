# Command Intelligence v1 — isolated development module

Branch: `feature/voice-intelligence-lab`. Integration baseline: `313e6e7` on `feature/v05-map` (18 October 2026). No application integration or deployment is performed by this branch.

## Ownership boundary

This work adds `public/command-intelligence.js`, its tests, a standalone Voice Command Lab and module-specific documentation. It does not change `app.js`, `index.html`, `sw.js`, the existing command registry, customer parser/capture, voice surface, database layer, Calendar or deployment workflow. The existing record interpreter is reused read-only for customer extraction and field validation.

## Engine API

UMD browser global `TradeFlowCommandIntelligence`, or dependency-free CommonJS `require('./public/command-intelligence.js')`.

```js
const result = intelligence.interpretCommand(transcript, {
  today: '2026-10-18', // actual business-local date supplied by the host
  businessId: 'local-business',
  customers: actualSavedCustomers,
  record: {store: 'customers', id: actualSelectedCustomerId}
});
```

Results include `intent`, `status`, `parameters`, `effect`, rule-strength `confidence`, `missingInformation`, `warnings`, `clarification`, `normalizations`, candidate intents and an optional `suggestedCommand`. The engine does not retain the transcript. Extracted names, numbers and notes are business values and may appear in the result. The host decides whether to retain any input or result.

Effects distinguish `read_only`, `navigation`, `draft` and `proposes_modification`. Recognized intent and a suggested command are **not authorization**. Existing permissions, approval, duplicate checks, record validation, atomic writes and idempotency remain authoritative. The host must never infer approval from confidence.

Initial vocabulary covers customer creation, quotation preparation, scheduled-work queries, existing workspace navigation, record search, task/job/calendar drafts and read-only business-summary topics. A schedule query describes which local Calendar query is intended; it does not fetch or fabricate appointments. Relative dates require a valid `context.today`. Customer identity is resolved only against supplied records. Missing, foreign or ambiguous records require clarification.

Customer field corrections use `correctInterpretation(previous, {fields: {phone: '512-555-0198'}}, context)`. Corrections revalidate the existing parser's review and refresh duplicates; they do not save records or resolve conflicting action instructions.

## Future capability registration

`createEngine({tools, records})` registers explicit, trusted interpretation adapters. Each tool has a unique `id`, `description`, `effect`, `requiredParameters`, `match(lexical, context)` returning a rule score, and `extract(lexical, context, result, adapters)` filling the result. `builtinTools` can be combined with custom tools. No executor is accepted. The host must register pure callbacks; this JavaScript API is not a sandbox for untrusted code.

This is a compositional, deterministic language layer. Vocabulary and structural rules cover phrase variations without one exact sentence per command; it is not an unrestricted language model, speech recognizer or universal semantic parser. Phonetic corrections affect intent vocabulary only, never customer names or phone digits. Unknown actions, uncertain facts and unsupported external requests need clarification. Additional synonyms and tools can be added without rewriting authorized execution.

## Verification

Run `node --test tests/command-intelligence.test.cjs`, followed by the repository's `node --test tests/*.test.cjs`. Milestone results and final integration requirements are recorded in the handoff document.

## Regression corpus and constraints

`tests/fixtures/command-intelligence-cases.json` contains 44 named electrical, plumbing, HVAC, scheduling, customer, quotation and negative examples with expected intent/status/parameter subsets. It uses synthetic developer-test context, never app records. Tests additionally exercise 2,560 compositional schedule variants made from conversational lead-ins, query structures, work nouns and supported speech errors. This verifies those combinations, not unrestricted natural language.

Reordered date and customer prefixes are supported. Negation, excluded constraints, conflicting independent actions, tutorial/reported speech, unavailable identities and unsupported periods cannot silently yield an execution suggestion. Trade filters such as HVAC are retained in the interpreted schedule parameters; an integrating host must apply those constraints or clarify, not silently show all work. Results never contain financial answers or fetched schedule records.

Adapters receive frozen lexical data and a frozen copy of context. Required parameter paths are checked after extraction. Register trusted, synchronous and pure match/extract callbacks; this module does not provide a security sandbox or execute callbacks named `execute`.

## Voice Command Lab

Open `/voice-command-lab.html` from a local static server serving `public/`. For example, `python -m http.server 4174 --directory public`, then visit `http://localhost:4174/voice-command-lab.html`. This branch does not deploy the page or add it to the app's navigation.

The lab displays the structured result, lets the developer change expected intent/status/effect/parameter subsets, and explicitly save a transcript fixture. Customer draft field correction is also supported and saved as a reproducible correction step. Incorrect expected outcomes stay visible as failing regressions; neither kind of correction changes language rules, model weights or Apple's recognizer.

`TradeFlowVoiceCommandLab` exports `validateFixture`, `createFixtureStore`, `runRegression` and `mount`. The store uses **only** `localStorage['tradeflow:voice-command-lab:v1']`. No app IndexedDB is opened. Saving/importing is explicit. Export, load, edit, delete and clear operate only on lab fixtures. Exported fixture JSON and the named contractor test corpus are importable; conflicting IDs and invalid collections are rejected atomically. Corrupt/unknown versions are not silently replaced. Memory-only fallback is labeled; quota/access errors are displayed.

The lab limits collections to 300 fixtures, transcripts to 8,000 characters and imported files to 2 MiB, with a conservative collection-storage budget. Context permits date, business, customer interpretation fields and selected references; it excludes photos, secrets and unrelated business datasets. Test transcripts and extracted contact information can still be sensitive. The developer controls explicit retention and exported copies.

A dedicated `voice-command-lab-sw.js` registration is scoped to **`./voice-command-lab.html`**. It caches only lab dependencies in `tradeflow-command-lab-*`, never the main application's cache namespace. On a secure origin/localhost, offline reload is available after first installation. On file origins or unsupported browsers, local assets and fixture functionality remain usable where the browser permits; service-worker installation is not claimed. The main `sw.js` is unchanged.

No microphone is used, no audio is collected and no network/model call is needed for interpretation or fixture regression. The dedicated worker fetches static assets for installation/update only.
