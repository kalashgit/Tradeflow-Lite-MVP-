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
