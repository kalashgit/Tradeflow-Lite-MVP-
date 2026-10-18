# Command Intelligence and Voice Command Lab — integration handoff

18 October 2026. Assigned branch: **`feature/voice-intelligence-lab`**. Separate worktree: `/workspace/Tradeflow-voice-intelligence-lab`.

## Baseline and milestones

The branch starts at GitHub integration baseline **`313e6e7dbed6d124041d04fe4e8b4ca76c01db89`**. Baseline GitHub Actions run **#511**, ID `39135150470`, was checked and successful for that exact SHA. Earlier run #498 was not used as evidence for newer code.

Implementation commits:

| Commit | Milestone |
| --- | --- |
| `cd463dd` | Interpretation-only engine, customer adapter reuse, context/ambiguity tests and API notes |
| `20203b4` | Contractor speech/error/constraint corpus and 2,560 compositional phrase combinations |
| `b87cfdc` | Standalone fixture lab, offline page scope, privacy/storage tests and context hardening |

All new tests were executed locally. No new branch CI or deployment is claimed. The shared workflow's push trigger is restricted to `feature/v05-map`; it was not edited or dispatched. Neither preview nor production was deployed by this assignment.

## Files created

All changes are **new files**. No integration-owned file was modified.

| File | Purpose |
| --- | --- |
| `public/command-intelligence.js` | Pure interpretation API, extensible tool vocabulary and explicit customer field corrections |
| `tests/command-intelligence.test.cjs` | Intent, identity, ambiguity, context, constraints, correction and extensibility tests |
| `tests/fixtures/command-intelligence-cases.json` | 44 named contractor and negative examples with expected outcomes |
| `public/voice-command-lab.js` | Local fixture validation/storage, regression runner and developer UI controller |
| `public/voice-command-lab.html` | Standalone developer page; no app navigation or voice panel wiring |
| `public/voice-command-lab.css` | Lab-only styles consuming existing graphite tokens |
| `public/voice-command-lab-sw.js` | Offline static assets with scope limited to `/voice-command-lab.html` |
| `tests/voice-command-lab.test.cjs` | Fixture privacy, import/export, errors, regressions, correction and worker isolation |
| `docs/COMMAND_INTELLIGENCE.md` | API, vocabulary, extension contract, lab usage and limits |
| `docs/COMMAND_INTELLIGENCE_HANDOFF.md` | This handoff and recovery/integration evidence |

## Verification results

- Baseline suite: **97 passed, 0 failed**.
- Engine milestone: **111 passed, 0 failed** across all available test files.
- Expanded speech corpus milestone: **115 passed, 0 failed**.
- Final implementation: **130 passed, 0 failed**, including all existing customer creation, voice entry, voice command, registry, Core, Calendar and other regressions.
- Engine-specific tests: 19. Lab-specific tests: 14. Equal-strength registered capability matches require clarification, including read-only tools. The engine tests include all 44 named fixtures and 2,560 generated schedule variants; these are phrase checks inside test cases, not 2,560 separately reported test cases.
- Syntax checks for all three new JavaScript modules and `git diff --check` pass.
- Rendered Chromium at **320, 390 and 1440 CSS pixels**: inspect structured intent/fields; edit expected outcomes; save a failing fixture; correct customer phone; persist/reload; export JSON; import 44 bundled examples; run **46/46** combined fixtures; clear only the lab key; no horizontal page overflow or page errors.
- Actual offline browser reload, interpretation and 46-case regression passed after installing the lab-scoped worker.
- Browser checks observed **no IndexedDB database created**. An unrelated local-storage sentinel remained unchanged through save/import/clear.
- Protected integration files compare byte-for-byte with the baseline. The original dirty workspace still matches every recovery-file hash.

Browser artifacts are in `/workspace/artifacts/tradeflow-command-intelligence/`: `browser-lab-verification.json`, `ownership-and-recovery.json`, reproducible `browser-lab-check.cjs`, mobile/desktop screenshots and exported fixtures. These are local verification artifacts, not a deployed preview.

## Exact integration points for the application team

Coordination is still required before applying any of these edits; none were made on this branch.

1. **`public/index.html`**: load `command-intelligence.js` after the existing `record-interpreter.js` and before `voice-command.js`. The new engine consumes the existing parser API and does not replace it.
2. **`public/voice-command.js`**: call `TradeFlowCommandIntelligence.interpretCommand(transcript, context)` where the current local `intent(input)` is used. Supply the actual business-local `today`, `businessId`, customer records from the current snapshot and selected record from `TradeFlowPilot.context().record`. Keep microphone/transcription lifecycle unchanged. If `status` is not `recognized`, show `clarification.questions`; never execute a suggested command from an ambiguous result.
3. **Customer route**: pass the returned `recordReview` to the existing customer review/prepare path. Keep all current warnings, duplicate checks, approval and explicit-instruction policy authoritative. A high rule score, a recognized intent or `suggestedCommand` does not authorize a save. `correctInterpretation(previous, {fields: {...}}, context)` updates an unsaved interpretation and must be followed by normal shared-layer validation/review.
4. **Quotation route**: use `parameters.customerRef` with the existing `draft.prepare` command, `kind:'quote'`. Show the actual saved customer name when a partial match produced a warning. Never assume a missing or ambiguous identity.
5. **Schedule route**: route `parameters.date` through the existing Calendar record/query adapters and read-only display. The current `tomorrowWork(data, date, calendarRecords)` already accepts a date, but it does not implement every scope/trade filter. Preserve `parameters.scope` and optional `parameters.trades`; apply verified record filters or clarify if unsupported. Do not silently discard these constraints or invent bookings.
6. **Task/job/calendar draft routes**: use the existing `draft.prepare` forms after required parameters and customer references are resolved. Missing date, time, duration, job scope or identity remains missing. Calendar interpretation never books an appointment. Business-summary intents return topics/optional dates only; existing finance/data functions must supply the actual answer.
7. **`public/sw.js` and the shared deployment workflow**: integration owners can version/precache `command-intelligence.js` and add the new Node tests when rolling out app wiring. No changes are supplied to these files. The standalone lab has its own narrow worker scope and needs no main app worker edit.
8. **Developer access**: serve the new lab page directly, or add an explicitly chosen developer-only entry later. Do not add a permanent navigation item or change the locked header. Import `tests/fixtures/command-intelligence-cases.json` with the lab's explicit Import JSON control to run the named corpus.

Useful mapping:

| Interpreted intent | Existing execution owner |
| --- | --- |
| `customer.create` | Customer review, registry approval and transaction-safe Core |
| `quotation.prepare` | `draft.prepare`, kind quote |
| `schedule.query` | Calendar query/read-only display |
| `workspace.open` | Existing workspace navigation command |
| `record.find` | Existing read-only record command |
| `task.prepare`, `job.prepare`, `calendar.prepare` | Existing reviewed draft forms |
| `business.query` | Existing read-only finance/record adapters; no fabricated answer |

## Known limitations and conflicts

- Deterministic compositional vocabulary is intentionally bounded. The tested phrase combinations do not establish unrestricted language understanding. Unknown periods, unsupported actions and uncertain constraints require clarification.
- Confidence measures rule strength, not factual correctness or calibrated probability. No engine output grants permission, skips review or proves a record fact.
- Customer extraction uses the baseline parser's supported patterns and phone normalization. No phone-digit reconstruction, invented names or background identity lookup is attempted. Current voice-create requirements include a complete phone even though some other legacy forms may permit optional phone.
- This branch does not train Apple speech recognition, access audio, add an AI provider, implement Library/memory/background agents or perform operational planning/execution.
- The lab stores explicitly saved transcript fixtures as plaintext local JSON. The developer controls retention/export/deletion. Previously exported files remain separate copies. Memory fallback is temporary and labeled.
- Physical iPhone Safari, microphone behavior and application integration remain with the parallel application track. Chromium viewport checks do not certify those workflows.
- No textual file conflicts exist with the baseline: only new isolated paths were added. There is an intentional integration dependency on the existing record-interpreter API and on host handling of the new structured result. The existing assistant continues using its current matcher until the application team coordinates the wiring.

## Recovered unfinished work

The original `/workspace/Tradeflow` was on `feature/v05-map` at `387ec34`, with **7 modified tracked files and 5 untracked files**. Before fetching/switching, it was preserved in place and archived under:

`/workspace/artifacts/tradeflow-recovery-2026-10-18/`

- `tracked-changes.patch`: binary-capable tracked diff.
- `unfinished-work.zip`: all 12 changed/new source/test files plus earlier browser artifacts.
- `manifest.json`: original SHA, paths and per-file SHA-256 hashes.

The work includes the earlier customer interpreter/capture, approved customer commands, source-retention handling, Calendar drafts and tests. GitHub's newer baseline already contains recovered/improved versions of those integration-owned modules. Applying the old patch would risk overwriting that newer work, so it was **not merged, reset, deleted or committed onto the integration branch**. A final hash check confirms that every preserved original file is unchanged. The earlier browser artifact reported failure and is retained as historical evidence, not reported as a passing test.

## Continuation: compositional tests and independent evaluation

The 18 October additional requirement is implemented in two further milestones:

- `7bf120f`: boundary-filler/repeated-grammar normalization, field-clause permutation, contradictory identity protection and generated metamorphic tests. No whole-phrase training lookup was introduced. Existing business parser files remain unchanged.
- The following evaluation milestone adds transcript provenance, separate interpretation metrics and labeled transcription examples. `interpretCommand(transcript, context)` and `correctInterpretation(previous, changes, context)` retain their existing interfaces. `runRegression` adds a backward-compatible `metrics` object and per-case `initialIntent`.

Additional paths: `tests/command-intelligence-metamorphic.test.cjs` and `tests/fixtures/command-intelligence-transcription-cases.json`. Updated isolated paths: `public/command-intelligence.js`, `public/voice-command-lab.js`, `public/voice-command-lab.html`, `public/voice-command-lab-sw.js`, `tests/voice-command-lab.test.cjs`, and both module documents. Lab cache is versioned separately as `tradeflow-command-lab-v2`.

Validation: **138 Node tests passed, 0 failed**, using `node --test tests/*.test.cjs`. Generated coverage includes 2,016 customer combinations and 2,560 schedule combinations, plus contradictory names, repeated identity/digits, missing data, explicit corrections, and electrical/plumbing/HVAC task scopes. Chromium checks passed at 320/390/1440 widths and the provenance/metrics checks passed online and offline at 390. No page errors, horizontal overflow or business IndexedDB creation was observed. No physical iPhone/microphone claim is made.

Evaluation across the two imported corpora:

| Stage | Result | Scope |
| --- | --- | --- |
| Transcription | Not measured | Text-only lab; no audio or device-recognition evaluation |
| Intent | 48/48 expected intents | Labeled regression fixtures, not production accuracy |
| Field extraction | 48/48 annotated parameter leaves | Unannotated fields are not evaluated; corrected cases excluded |
| Business execution | Not measured | This layer never executes business commands |

The new corpus contains one **user-supplied** jobs→jibs text example without audio/device provenance and three **synthetic** mutations. The original 44 cases have unspecified provenance. No additional observed iPhone errors were supplied during this work; the lab supports importing user-reported pairs without mislabeling synthetic examples. Fixture pass rates do not establish unrestricted natural-language generalization or independent recognizer accuracy.

Evidence is under `/workspace/artifacts/tradeflow-command-intelligence/`: `generalization-metrics.json`, `browser-generalization-verification.json`, `browser-generalization-check.cjs`, `lab-generalization-390.png`, plus the existing desktop/mobile browser verification. Main app wiring still belongs to the integration team at the points documented above. No integration-owned files, production resources or deployment workflows were changed, and no deployment was attempted.

## Additional error taxonomy and supplied mutation bank

Further milestones:

- `209abf6`: contextual coats/sight/sail/in voice recovery, structural action-object selection, field-scoped spoken digits, explicit name-correction review, marked-noise safeguards. Validation: 143 Node tests passed.
- `0b7fe32`: business timezone/date interpretation, explicit next-weekday ambiguity policy, contact-reference review and unexecuted dependent draft plans. Validation: 148 Node tests passed.
- Following evaluation milestone: 20 error-category fixtures, 648 additional mixed mutations, the supplied 282-row synthetic bank, transparent CLI coverage, and safety fixes for truncated navigation/conditions. Validation: **157 Node tests passed, 0 failed**. No deployment or branch CI is claimed.

New paths are `tests/command-intelligence-error-categories.test.cjs`, `tests/command-intelligence-mutation-bank.test.cjs`, `tests/fixtures/command-intelligence-error-categories.json`, `tests/fixtures/TradeFlow_Universal_Mutation_Bank_v1.jsonl`, `scripts/evaluate-command-mutations.cjs`, and `docs/COMMAND_MUTATION_BANK.md`. Existing isolated engine/lab tests, fixture expectations and module docs were updated. Main-app files remain unchanged.

Important integration additions:

1. Supply `businessTimeZone`, a business-local `today` or an explicit `now` timestamp. An optional explicit `nextWeekdayPolicy` distinguishes upcoming from following-week dates. Otherwise show the supplied date alternatives; never infer a business policy from the phone timezone.
2. Show `CORRECTION_REVIEW`, contextual-recovery warnings and all clarification reasons. The draft may contain a clearly corrected name, but the host still owns approval. Grouped/uncertain spoken numbers remain unresolved.
3. Treat `proposedPlan.executable:false` as a draft for review. Step dependencies reference unsaved draft steps, not business record IDs. No autonomous executor is supplied.
4. `customer.contact` only resolves candidates for review. It never dials. Sales-query topics also require a real host read adapter; the interpreter produces no financial answer.
5. Navigation refuses to discard extra date/filter constraints. Conditional requests and visibly truncated instructions remain blocked even after a field correction.
6. Lab-only worker cache is now `tradeflow-command-lab-v3`; main application service worker and deployment workflow remain integration-owned and unchanged.

Final labeled fixture evaluation: **68/68 intent labels and 79/79 annotated parameter leaves matched**. Separately, the mutation bank has **31/31 designated safety gates** but incomplete language coverage: **25/96 full lexical agreement** in recognized contextual baselines. These are different datasets and metrics. The [mutation bank report](COMMAND_MUTATION_BANK.md) documents unsupported cases and all denominators. Transcription and successful execution remain unmeasured.

Chromium browser verification passed the standalone lab at 320/390/1440 widths. New category workflows passed at 390 online and offline: spoken phones, explicit name corrections, timezone/date alternatives and dependent plans. The 68-fixture offline run passed, no horizontal overflow/page errors were observed, and no business database was created. Browser harness setup failures (an interrupted local server and an unopened context disclosure) were corrected and the checks rerun successfully; neither is claimed as a product failure or an initial successful run. Physical iPhone/microphone validation remains outstanding.

New evidence: `error-category-metrics.json`, `mutation-bank-evaluation.json`, `browser-error-categories-verification.json`, `browser-error-categories.cjs` and `lab-error-categories-390.png` under the existing artifacts directory. Original unfinished work remains preserved; no integration-owned path or production resource was changed.

## Universal contextual ranking and master library continuation

Milestones:

- `7b0a28b`: standalone `public/speech-mutation-engine.js`, typed-field evidence, contextual ranking and independent tests; 170 Node tests passed.
- `d25f482`: default interpreter integration, declarative tools, generic compound verbs, critical-field preservation and standalone lab wiring; 179 Node tests passed.
- Final evaluation/navigation milestone: read-only shared-registry navigation, whole-quoted instruction protection, 20 additional labeled fixtures, master-library audit, and separate candidate metrics. **185 Node tests passed, 0 failed**, via `node --test tests/*.test.cjs`.

New paths in this continuation: `public/speech-mutation-engine.js`, `tests/speech-mutation-engine.test.cjs`, `tests/speech-mutation-integration.test.cjs`, `tests/command-library-audit.test.cjs`, `tests/fixtures/speech-mutation-cases.json`, `tests/fixtures/TradeFlow_Master_Voice_Command_Library_v1.json`, `scripts/evaluate-command-library.cjs`, `docs/SPEECH_MUTATION_ENGINE.md`, and `docs/COMMAND_LIBRARY_AUDIT.md`. Existing isolated engine/lab code, mutation evaluator, fixture policy expectations and module docs were updated. No integration-owned file was edited.

### Integration API

Load the existing `record-interpreter.js` and `command-registry.js`, then the new `speech-mutation-engine.js` and `command-intelligence.js`. Main app script/worker edits require integration-team coordination and are **not applied** here. The standalone lab loads/cache these dependencies itself using its narrow `tradeflow-command-lab-v5` cache.

- `TradeFlowCommandIntelligence.interpretCommand(transcript, context)` remains the application entry point.
- `rankCommandCandidates(transcript, context)` exposes candidate alternatives, structural normalizations, protected spans, contextual evidence and conservative review requirements.
- `createEngine({tools, records, commands})` accepts existing callback tools or declarative `language` definitions. A new tool declares actions/action concepts, objects/synonyms, contexts and typed fields; no phrase-by-phrase parser is required.
- `commands` defaults to the existing registry API and is used only for pure workspace parsing/validation. Composite labels must resolve to one destination. Registry runtime creation, approval and execution are never called.
- `candidateRanking`, `interpretationPath`, `criticalEvidence` and `parameterEvidence` explain the result. Unrepresented amounts/dates/times trigger clarification. Recovered action/draft vocabulary requires review. A field correction cannot dismiss unresolved action, condition or critical-detail ambiguity.
- Compound steps use all registered tool verbs. `proposedPlan.executable` remains false. No unsaved draft becomes a fabricated record ID or authorized commitment.

The authoritative business-command registry still owns permissions, approvals, duplicate checks, atomic writes and idempotency. No database/schema/storage migration occurred.

### Final evidence

| Evaluation | Result | Interpretation |
| --- | --- | --- |
| Labeled fixture corpora | 88/88 intent expectations and safety statuses | 103/103 annotated parameter leaves; unannotated fields not measured |
| Synthetic bank safety | 31/31 designated gates | Clarification and proposal suppression only |
| Bank contextual lexical interpretation | 88/96 intent, 72/96 intent+parameters, 26/96 full status agreement | Recovered draft mutations intentionally remain review-required |
| Ranked bank candidates | 89/96 matching top candidate (89/96 top-three) | Plausibility, not authorization or production accuracy |
| Master library | 192/225 annotated navigation targets agree | 33 need mapping/clarification; no rendered-page verification |
| Transcription | Not measured | Synthetic text, no device/audio reference evaluation |
| Successful execution | Not measured | No executor in this layer |

All 282 mutation rows receive classifications. 102 lexical entries lack a supported context template; four templated baselines require clarification. The master library has 361 entries and retains its unverified implementation labels and exclusions. Operation rows without full expectations remain coverage observations, not passing outcome tests. Review [COMMAND_MUTATION_BANK.md](COMMAND_MUTATION_BANK.md) and [COMMAND_LIBRARY_AUDIT.md](COMMAND_LIBRARY_AUDIT.md) for full denominators and limitations.

Generated tests include 5,512 customer/schedule/mixed/future-tool combinations. This demonstrates reusable composition across unseen tool metadata, not unlimited language understanding. Grouped spoken numbers, unfamiliar colloquial/elliptical grammar, some pronouns, future domains and unsupported external/high-impact operations remain unresolved or require adapters.

Chromium verification passed at 320/390/1440 widths, with no horizontal overflow/page errors or business database creation. The new ranker and shared registry load offline, all 88 fixtures run offline, fuzzy actions require review, critical amounts remain visible, and custom declarative tools produce unexecuted compound plans. Physical iPhone recognition and application execution remain unverified.

Evidence directory: `/workspace/artifacts/tradeflow-command-intelligence/`. Current reports: `universal-ranker-fixtures.json`, `universal-ranker-bank.json`, `universal-command-library-audit.json`, `browser-universal-ranker-verification.json`, `browser-shared-navigation-verification.json` and `lab-universal-ranker-390.png`. Browser scripts are retained alongside them. Original unfinished work remains preserved. No branch CI, preview deployment or production action is claimed.
