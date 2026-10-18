# Founding Pilot command and intelligence foundation v1

2026-10-18. Development branch `feature/v05-map`. Target: `tradeflow-v05-preview` only. Production `calm-rice-1ea7` is excluded.

## Inspection and reuse

`app.js` remains the local-first host: native IndexedDB, existing navigation, record forms, explicit save, backup and restore. The database is still `tradeflow-lite-v1`, version **9**, with the same 23 stores. No upgrade, deletion, replacement or silent migration was introduced. The existing `commandLog` store holds the additional command journal rows and remains part of v9 backups.

`core-integration.js` already owns deterministic business-operation planning and idempotency records. The approved quotation-to-job path reuses it; its transaction now reads current quote, customer and linked jobs before committing, checks the reviewed record revision, and atomically writes the job and operation audit. Different requests and browser tabs cannot create two jobs from one quote through this path.

`calendar.js` supplies the existing normalized commitments and conflict rules. `schedule-engine.js` retains its separate scheduling proposal and approval behavior. The new detector uses recorded resources and includes hidden calendar layers; it does not implement a second scheduler. `revenue.js` supplies existing invoice totals and recorded payments. Partial balances past their due dates now appear in both Overdue and Unpaid filters.

`tradeflow-engine.js` retains its provider-neutral geo, AI, store and job ports. The existing AI preview remains advisory and has no command-execution or approval privileges. No new text/voice surface, assistant panel, orb, Library or War Room was added. The universal header still has brand, contextual actions and bell; its existing task/conflict counts consume the shared detector results. Mobile navigation remains Home, Map, Calendar, Finance, More. Calendar still has a maximum view of one week.

Legacy direct forms, notification generation, legacy render helpers and other business mutations still exist. This release does not claim that all of them have moved into the registry. The registry deliberately calls the existing workspace and form adapters instead of duplicating those interfaces.

## Public interfaces

Browser globals and dependency-free CommonJS exports:

- `TradeFlowCommands`: immutable definitions, deterministic `parse`/`resolve`, relationship validation, draft defaults/validation, filtering, `createRuntime`, `createLedger`.
- `TradeFlowIntelligence.createEngine({commands, calendar, revenue, detectors?})`: pure snapshot evaluation. Custom synchronous detectors have unique IDs and `evaluate(snapshot, context)`; input is cloned and frozen. Failures and malformed results produce diagnostics.
- `TradeFlowPilot`: app-bound `commands`, `context()`, `evaluate()` and `evaluateSnapshot(data, options)`; interface version 1.

The command host injects a consistent readonly snapshot, current context, capability check, durable ledger and existing UI/operation ports. Future models and page specialists can propose registered command inputs or consume findings. They must not translate interpreted text into authorization or call approval automatically. There are no model, cloud or network dependencies in these modules.

The app context supplies local actor/business, source workspace, selected record, local date, primary trade, selected calendar date and current filter. Prepared commands retain the relevant context and resolved record references. Local-owner capabilities are an application boundary, **not authentication, tenant isolation or protection from same-origin scripts**. Real multi-user authorization is separate future work.

### Registered commands

| ID | Example | Effect / review |
| --- | --- | --- |
| `workspace.open` | `open finance` | Existing workspace; no confirmation |
| `record.find` | `find quotes panel` | Local results with explicit record references |
| `record.open` | `open quote <id>`, `open this record` | One unambiguous existing record |
| `view.filter` | `show overdue tasks`, `show overdue invoices`, `show calendar conflicts` | Supported existing view |
| `draft.prepare` | `draft task for quote <id>`, `draft quote for customer <id>` | Existing form, unsaved; explicit Save required |
| `quotation.convert` | `convert quote <id> to job` | Explicit approval; accepted quote and valid customer required |

Task filters: all/open/done/overdue. Quotation filters: all/open/accepted/stale. Invoice filters: all/unpaid/overdue/draft. Calendar: conflicts/proposals. Record opening supports customers, quotations, jobs, tasks, invoices, opportunities, suppliers and calendar entries. Find results never silently choose between equal matches. Draft source syntax uses exact record IDs; task/quotation drafts support verified customer, quotation, job, task or opportunity sources.

```js
const api = window.TradeFlowPilot;
const prepared = await api.commands.prepare('draft task for quote existing-quote-id');
if (prepared.status === 'ready') {
  await api.commands.execute(prepared.id); // Opens the existing form, saves nothing.
}

const handoff = await api.commands.prepare({
  commandId: 'quotation.convert',
  params: {ref: {store: 'quotes', id: 'existing-accepted-quote-id'}}
});
// A real review UI must obtain explicit owner approval before this call.
if (ownerApproved && handoff.status === 'needs_review') {
  const approval = await api.commands.approve(handoff.id);
  if (approval.status === 'approved') await api.commands.execute(handoff.id);
}
// api.commands.get(id), history(id), reject(id) support future review UI.
```

Examples refer to existing IDs; they do not insert example records. No command sends email, charges money, deletes data or executes arbitrary interpreted instructions. Unknown commands and extra authorization fields are rejected. Ambiguous text, missing records and invalid relationships return explicit results for the caller to resolve.

### Approval, audit and recovery

The runtime journals `prepared`, `approved` when required, `executing`, and `succeeded`/`failed`/`stale`/`rejected` events, with actor and timestamps. SHA-256 bindings cover effective parameters, actor/business, referenced records and draft defaults. A changed source invalidates approval. Relationships are validated recursively; missing records, duplicate identifiers, mismatched customers and explicit foreign business scopes require review.

`prepare(input, {requestKey})` accepts a stable caller key for retry deduplication. A key cannot be rebound to another command or revision. `execute` takes a prepared request ID only. Atomic journal transitions serialize across tabs; completed requests return their cached outcome. The underlying quote conversion has its own distinct operation key and transaction guard. A failed audit write prevents execution. Interrupted `executing` commands and uncertain final audit writes are not automatically rerun: inspect the journal and linked operation/job before manual recovery. There is no recovery/undo UI in this release.

Draft defaults include only verified relationships, an editable source-based title, today's local due date and configured trade. No quote price is invented. Closing a draft leaves business records untouched. Explicit form Save revalidates references; the existing form handles persistence and activity events. The command journal records draft preparation, while the existing save path records the final business save.

## Record detectors

Every finding has a stable ID derived from detector and source IDs, supporting record references, evaluation timestamp, explanation, confidence, limitations, priority with constraints, proposed registered command and status. Evaluation never writes or executes. Findings are deduplicated within evaluation and keep IDs across reevaluations; dismissal/history persistence is reserved for a later UI task.

| Detector | Evidence and boundary |
| --- | --- |
| `task.overdue` | Valid past due date, unfinished status. Unresolved dependencies block operational action. |
| `calendar.conflict` | Overlapping recorded commitments for the same resource, using existing calendar rules. Today is urgent; future conflicts are high priority. Default planning horizon 14 days, existing preference clamped to 1–90. |
| `invoice.overdue` | Issued invoice, past due date, unpaid balance after locally recorded payments. Partial payment included; paid, draft and void excluded. Invalid amounts, currency or customer payment links block the finding. |
| `quotation.accepted_handoff` | Accepted quote with no job explicitly linked by `quoteId`. Missing customer blocks action; matching titles do not prove a handoff. Any linked job suppresses this finding, including a cancelled one; cancellation recovery needs a separate workflow. |
| `quotation.stale_open` | Sent quote with no recorded contact/follow-up for 14 days by default; configurable 1–365. Proposes a reviewable follow-up task draft. Missing/invalid dates do not prove staleness. |

Eligibility and relationship/resource constraints precede scores: today's conflicts, eligible overdue obligations, eligible handoffs/follow-ups, then blocked items requiring repair. No amount, speculative revenue or external assertion changes that order. Diagnostics distinguish unavailable detectors from an all-clear result. Hidden layers still consume recorded capacity; unassigned legacy commitments use the local owner. Unknown travel time, external calendars and unrecorded customer contact are stated limitations.

Currency comes from actual invoice records, with the existing EUR convention explicitly disclosed for legacy records. This release does not convert the older finance forms into US invoicing or validate tax compliance, settlement or banking status.

## Files and validation

- New runtime and detector modules: `public/command-registry.js`, `public/operational-intelligence.js`.
- Existing adapters/integration: `public/app.js`, `core-integration.js`, `calendar.js`, `revenue.js`, `suppliers.js`.
- Offline assets: `public/index.html`, `public/sw.js` (cache v95, unrelated to database v9).
- Tests: `tests/command-registry.test.cjs`, `operational-intelligence.test.cjs`, `pilot-integration.test.cjs`, `helpers/local-db.cjs`.
- Preview CI: `.github/workflows/deploy-tradeflow-preview.yml` adds the new tests before the existing, unchanged deployment guards.

Run `node --test tests/*.test.cjs` and JavaScript syntax checks. See the separate verification report for results and preview evidence.

## Remaining product work

Separate UI tasks can consume these interfaces for a global command surface, Library, War Room and specialist views. Cloud/local models, voice, external execution, authentication, undo/recovery UI, persisted finding lifecycle and complete migration of legacy mutations remain unimplemented. The existing US currency/tax and real-device Safari/PWA review remain commercial pilot considerations. No improvement in the primary owner-intervention metric is claimed without observing real completed pilot workflows.
