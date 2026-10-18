# Voice intelligence application integration

Development branch: `feature/voice-intelligence-integration`. Based on integration baseline `313e6e7`, with the intelligence source through `62581a5` brought in by a clean fast-forward. The original dirty `/workspace/Tradeflow` worktree remains untouched; all 12 file hashes match its recovery archive.

## Application boundary

`index.html` loads the record interpreter, command registry, speech ranker, command intelligence and `voice-intelligence-integration.js` before the existing voice surface. The main service worker caches the same versioned assets. No database schema or store changes were made: `tradeflow-lite-v1`, version 9.

`TradeFlowVoiceIntegration.interpretCommand(text, context)` includes registered view-filter, scoped-record-open and accepted-quotation conversion adapters alongside the reusable intelligence tools. `rankCommandCandidates` provides clarification alternatives. `run(text, host)` receives the existing snapshot, context, customer-review controller and authoritative command runtime. It returns actual execution, clarification, review, lookup or query results. It never infers approval from interpretation confidence.

`app.js` supplies current workspace, selected reference, local business, trade, business timezone and date. Record context comes from a transaction-consistent local snapshot, with foreign-business rows and image payloads excluded. The existing local-owner permission boundary remains authoritative; this does not introduce multi-tenant authentication.

Navigation, record lookup/open, supported invoice/task/quote/calendar filters, task/job/quote/calendar draft preparation and accepted-quotation handoff use the command runtime. Calendar queries use its existing record projection and deduplication. Missing categories are not invented when filtering trades. Customer creation always opens the existing editable review form; only its confirmed save approves and executes the command. Retaining original wording remains off by default. Quotation conversion has a separate explicit approval button. No compound action executor or external communication is added.

The previous controller-only three-intent execution fallback was removed. A missing intelligence module fails closed. The existing microphone lifecycle and Stop & process interaction remain in place; no physical speech-recognition improvement is claimed. The pure legacy `intent()` export remains for compatibility tests, but does not execute application commands.

## Verification

Run:

```sh
node --test tests/*.test.cjs
python -m http.server 4175 --directory public
# In a second terminal, with Playwright and Chromium installed:
node scripts/test-voice-application.cjs
```

The browser harness creates synthetic fixtures only in a fresh isolated browser profile. It runs the actual application, command runtime, UI adapters and IndexedDB transactions. It verifies persistence after reload, duplicate review, explicit conversion approval, unsaved forms, offline reload, navigation and mocked recognition delivery. It does not use or overwrite an existing user's database. Artifacts default to `/workspace/artifacts/tradeflow-voice-integration`; `TRADEFLOW_TEST_URL` and `TRADEFLOW_TEST_ARTIFACTS` can override the target and output directory.

The full 361-entry execution coverage is recorded separately in `COMMAND_EXECUTION_COVERAGE.json`. Matching an intent alone does not establish execution. Missing records, unsupported constraints and missing execution adapters retain explicit coverage statuses. The previous interpretation-only audit remains reproducible and is not substituted for browser results.

## Failures discovered and reproduction

- **Customer save failed in the pre-existing application adapter.** Open the assistant, enter `Create customer Test Avery phone 512-555-0177`, then confirm the review. Before this fix the UI reported `window.TradeFlowCustomerCapture?.sourceForRequest is not a function`. The source accessor belongs to `TradeFlowCustomerEntry`, the controller instance. The adapter now calls that instance; the browser persistence test guards this complete path.
- **Job/calendar drafts opened Quotations.** Prepare a job/calendar draft through the runtime. The old adapter routed every non-task draft to Quotes. It now opens Jobs or the existing explicit Calendar appointment form, without auto-save.
- **Filters falsely appeared compound.** `Show overdue invoices` matched both the registered filter and a generic business-query interpretation. Clause analysis now compares the strongest intent per clause; equally strong candidates and real multi-clause operations remain ambiguous.
- Early browser harness runs had asynchronous render races while entering the next command and clicking record links. The controller now returns its start/close repaint promise and the harness waits for the actual rendered result. These harness failures did not indicate failed record persistence.

## Preview protection

The existing preview workflow previously always checked out `feature/v05-map`, even when dispatched from another branch. It now allowlists only that branch and this integration branch, checks out the exact triggering SHA, runs the complete Node suite and retains the exact `tradeflow-v05-preview` Worker/configuration guard. Push deployment remains limited to `feature/v05-map`; integration deployment requires explicit workflow dispatch. The workflow writes and verifies a preview-only source manifest and compares deployed asset hashes. It never targets production `calm-rice-1ea7`.

## Limits

No physical iPhone/audio test has been performed. Browser speech delivery is mocked; this measures lifecycle and execution, not transcription accuracy. Speech recognition may require browser/provider connectivity even though typed interpretation and supported local operations work offline. Broader business summaries, arbitrary record editing, external sending, automatic compound plans and unregistered feature operations are not connected. Calendar drafting currently requires explicit 24-hour time and duration; uncertain dates request clarification. Existing preview AI endpoints are unchanged and are not used for command understanding.

## Verified integration milestone

- `npm test`: **193 passed, 0 failed**.
- Actual Chromium application harness: **14 workflow checks passed**, with all **225 annotated navigation utterances** executed against 20 rendered workspaces.
- Complete library audit: **253 execution-tested**, **14 require parameters or confirmation**, **3 interpreted but disconnected**, **2 unsupported underlying capabilities**, **89 ambiguous or incorrectly/unmapped**. Every source ID has an entry in `COMMAND_EXECUTION_COVERAGE.json`.
- The three disconnected expense requests are `Show my expenses`, `Show this week’s expenses` and `Show expenses for job 104`. Use `Open Finance` for the developed workspace; voice financial-summary/period/job filtering still needs an appropriate adapter.
- Screenshots at 320, 390 and 1440 pixels were captured; the 320/390 assistant renderings were visually reviewed. This is browser layout evidence, not physical iPhone validation or visual-parity certification.
- The preview workflow also installs the pinned Playwright dependency, repeats actual browser execution before deployment and uploads its JSON/screenshots as a CI artifact. Deployment success is reported separately only after its result and source manifest have been verified.

The first preview run passed both test stages and deployed version `b0ced412-4c9a-4723-858c-2ecefa29ffdd`, but its immediate root-HTML hash check encountered the preceding asset version during propagation. A later independent download matched the source exactly. Deployment verification now retries manifest and exact asset-hash assertions for a bounded period; mismatches still fail closed. This is a deployment-verification fix, not a relaxed assertion or a change to the application.
