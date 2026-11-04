# TradeFlow — Full Infrastructure Execution Map (nonproduction)

Document: TF-INFRA-EXEC-01 · 2026-11-04 · Status: dependency/coverage map, NOT a release approval or replacement roadmap.

## Source precedence

This map implements, rather than supersedes, the Master Development Roadmap v1.1 and the following controlled Notion specifications:

- Canonical Product and Engineering Control: https://app.notion.com/p/40cf639e237381be888be113c3d10565
- Software / Data Contract: https://app.notion.com/p/40cf639e237381caadc7d007fb3fa835
- Bidirectional Roadmap Addendum v1.2: https://app.notion.com/p/40cf639e2373817381c8ee70b7e68368
- Knowledge Fabric TF-KNOW-01: https://app.notion.com/p/40cf639e2373812aa4d5e008b280551d
- Master Intelligence Workflow Universe TF-WF-MI-01: https://app.notion.com/p/40df639e23738195a78ae4e0bfc81ebf
- Founder-named 18-area / 16-capability inventory TF-WF-ALL-01: https://app.notion.com/p/40ef639e237381b9b8faef3cf85dde85
- Worker QA/change control: https://app.notion.com/p/40cf639e237381979daae142529a71c3
- Exact code state: draft PR #16 https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/16 and GUI draft PR #18 https://github.com/kalashgit/Tradeflow-Lite-MVP-/pull/18.

The 18 founder-named workspace areas and 16 engine/capability names are coverage requirements, NOT 34 independent services or existing implementations. The 22 internal workspace keys are an engineering snapshot, not the final product navigation. No page name proves a backed and authorized route.

## Architecture invariants

1. One existing TradeFlow offline-first application, role-adaptive interface and single business identity; no separate field, voice or agent app.
2. Existing IndexedDB record stores and authenticated versioned D1 tenant records remain business truth. A derived case, vector index, source summary, chat memory or workflow plan cannot rewrite truth.
3. Every cloud read/action is server-scoped to authenticated issuer+subject, active business membership, permitted record/job and current role. A display-only crew name is not a grant.
4. Only registered typed commands and their existing authorization/approval/audit/receipt pipeline can execute business effects. Model and UI cannot issue arbitrary writes. No second executor or scheduler.
5. Every material claim has a source pointer, revision, observed time, confidence/unknowns and current-access check. Stale/deleted/withheld evidence invalidates derived state.
6. Distinguish local draft, queued, committed but uncertain, readback verified, office response, crew acknowledgment, command effect receipt and observed business outcome. None is a synonym for another.
7. No normal record event requires an LLM call. Reactive checks are deterministic; deliberation is bounded and owner/policy controlled; learning cannot alter permissions.
8. GUI/text/voice use one authorized workflow and conversation history. Offline GUI/text continue without a model. A working microphone, model and TTS require real-device/proven-provider evidence.
9. Owner-selected automation setting is an upper bound, not a substitute for permission, consent, freshness or provider capabilities. Financial settlement, outgoing customer messages and irreversible effects require specific authorization.
10. Every adoption claim must pass Code, Product, Operations and Outcome gates; passing synthetic CI never counts as field/device or commercial validation.

## Infrastructure layers: evidence, current implementation, next acceptance

| Layer | Verified source foundations / limited evidence | Missing integrated capability or acceptance |
| --- | --- | --- |
| Business records and canonical links | public/record-model.js; public/app.js; existing IndexedDB; migrations/0001–0004 in source | Cross-area relationship inventory, real enterprise-scale pagination, complete identity/migration rollout, customer-authorized contracts |
| Auth, tenant, job grants | src/tenant-security.js; src/job-access.js; src/tenant-record-store.js; disposable D1 tests | Approved live roles/identities; job-scoped policy on every routed endpoint; role revocation on physical two-device test |
| Durable event and synchronization | public/business-events.js; public/sync-queue.js; commandLog, correlation IDs and ambiguity states | Verified cross-device event transport, recovery on devices, propagation/cursors, safe stale-source cancellation |
| Crew ↔ office ↔ crew | src/role-exchange.js; src/role-exchange-actions.js; src/crew-office-inbox.js; real disposable D1 test | Authenticated routed app journey, role-aware GUI, actual notification/ack and operator validation; internal record receipt is not external delivery |
| Evidence/provenance | public/intelligence-evidence.js; src/intelligence-context.js; new pure knowledge-fabric-contracts.js | Incremental current-source invalidation, smaller authorized paged reads; delete/permission revocation cascades; no server trust from client-created pointer |
| Operational detectors | public/operational-intelligence.js and committed domain events | Minimal recomputation by changed source IDs, bounded dedupe/cursor, role-relevant notification states and measured false positives |
| Master Intelligence cases | public/intelligence-case.js; public/master-intelligence.js; deterministic office blocker conversation | Current cross-record blackboard and plan effects with fresh source checks on every effect, full thread/server role integration |
| Knowledge + memory + learning | aiConversationThreads / aiConversationTurns; read-only evidence; unsaved KnowledgeItem candidate | Source-linked editable consented knowledge, distinct owner preference, retention/delete/correction, audit-safe outcome feedback; no cross-tenant learning |
| Workflows + command registry | public/command-registry.js; core-integration.js; auditable local receipts; existing approved internal review commands | Versioned inventory/definition per registered capability, dependency graph, policy/undo classification, secure server command parity; no invented command names |
| Owner delegation | Notion-defined Ideas/Proposals/Delegated and automation ceilings; existing explicit approvals | A versioned revocable bound policy with current server enforcement, quota, real inverse where safe, interruption and independent audit |
| Unified role GUI | Existing TradeFlow dark PWA; PR #18 presentation/host modules | Founder-approved adaptive navigation, actual source-backed role screens for all relevant roles, responsive/reduced motion/VoiceOver on devices |
| Conversation + voice | Existing saved local threads and proposed protocol; office blocker deterministic unsaved response | Signed-in thread-to-evidence binding, actual ASR/model/TTS, mic permission/barge-in, one thread across phone & desktop, provider-failure text fallback |
| External integrations and research | Existing connectors/catalog and staged research designs | Explicit consent, OAuth scopes, encrypted credentials, webhook verification, provenance/expiry, provider budgets; no automatic contacting or crawling |
| Scale/operations | Exact-head CI, browser regression, disposable D1 migration/restore, known local budgets | Latency and cost baselines, quotas, log privacy, backup/restore rehearsal in approved dev, support runbooks, real device/pilot acceptance |

## Full founder inventory coverage (link contract, not an implementation claim)

The maintained inventory must explicitly cover all 18 user-facing areas:

Home; Map; Calendar; Finance; Library; Opportunities; Customers; Quotations; Jobs; Tasks; Suppliers; Invoices; Job Costing; Marketing Studio; Research Briefs; Crew and Dispatch; Integrations; Target Customers and Buyer Personas.

It must also cover all 16 named Intelligence capabilities:

Lead Discovery Engine; Contact Enrichment; Workflow Runs; Scheduled Research; Performance Analysis; Business Health Checks; Growth Recommendations; Conversion Improvements; Message Templates; Scheduled Communication; AI Response Drafting; Review Requests; Opportunity Signals; Buyer Fit Analysis; Source Monitoring; Data Quality.

For each of the 34 items, TF-WF-ALL-01 requires a grounded individual row: founder name, current route/UI, code files, canonical store/IDs, accepted input and produced output/event, upstream/downstream links, actor/job permission, consent/provider status, supported typed commands/approval, offline/sync behavior, implemented/partial/planned/unsupported status, and exact source/CI evidence. This **34-row code-and-route audit is not completed by this map**; no status is inferred from naming. Keep legacy Growth Intelligence, Business Missions and Route Planner until migration/deletion approval.

## Prioritized integrated slices (subordinate to the existing roadmap)

| Order | Work / GitHub issue | Acceptance evidence | Owning boundary |
| --- | --- | --- | --- |
| A | Finish TF-RM-03 / #25: field ↔ office ↔ same crew | Two signed-in assigned accounts and one office account; current grant, real job revision, verified source/readback/receipt, revoked/offline/duplicate tests; rendered mobile and desktop. Dev D1 synthetic proof is already present, not field acceptance | AI Principal server contract; General Engineer on disjoint files; Codex UI |
| B | TF-KNOW-P01 / #20: versioned EvidencePointer and candidate KnowledgeItem | Revision/actor/tenant/content digests current; corrections/deletes/revocations invalidate; never publish an unsourced model claim; no new business store | AI Principal evidence contract |
| C | TF-KNOW-P01 / #20: reactive labor source change | Existing job-cost committed event leads to one existing deterministic finding, no model call, replay deduped, stale/new revision replaces finding; no parallel detector | AI Principal, general read-only adapter |
| D | TF-RM-04/05 / #21 and #24: existing GUI + source-bound case | Home → job → same Intelligence thread → existing typed proposal → approved command → actual receipt → return; exceptions visible, stale/cancelled denied | AI Principal case/command; Codex presentation |
| E | TF-WF-MI-01: capability inventory and workflow definition contract | Audit all 34 names against real code; at least one cross-domain quote → job → crew/cost → invoice pathway with live source IDs and no unsupported actions; every node has current permissions/receipt/undo class | AI Principal registry, Manager audit |
| F | Knowledge/editor and learning contracts | Approved SOP/owner preference distinct from facts, consent/revision/expiry/deletion, verified outcome feedback and QA against baseline | AI Principal, QA |
| G | TF-RM-07: smallest reversible delegated action | Owner configures, pauses, revokes; exact actor/tenant/action/quantity/time limits; actual inverse/compensation/uncertainty behavior, not fake Undo | AI Principal + Codex |
| H | Voice and integration slices / #19, #17 | Actual licensed model/ASR/TTS and same saved thread on device; provider-off fallback; model/CPU/cost data; external OAuth only by approved scopes | AI Principal voice/infra, Codex presentation |
| I | Expansion + independent acceptance | Material readiness, scheduling, quotes, billing, leads, marketing and research incrementally through registered capabilities; privacy and uncoached contractor metrics | Manager + QA + Analyst |

Do not build all rows independently or push speculative engines into the UI. Link every ready slice to one registered command and one truthful test receipt. A capability may be a pure read or research recommendation; it need not be an executing operation.

## Evidence vocabulary

- Specified: accepted target only.
- Coded: reviewed source committed, exact SHA.
- Regression verified: exact-SHA Node / disposable D1 / Chromium outcome where exercised, NOT implicit end-to-end coverage.
- App accepted: rendered real navigation and role workflow evidence.
- Device accepted: physical signed-in phone/desktop, offline/revocation, lifecycle and microphone where relevant.
- Contractor validated: independent uncoached usability and operational outcome with disconfirming cases.
- Production authorized: a separate founder decision after security, migration, restore, privacy and support gates.

## Next implementation continuation

Complete TF-KNOW-P01's bounded reactive source-change projection **using the existing detector engine**, then connect the source-linked findings to one real approved-only internal review command through existing command and receipt semantics. The current evidence/KnowledgeItem contract only creates in-memory, unapproved candidate material. No durable knowledge store, automatic watcher, owner consent or model inference has been implemented by it.

Record each exact commit, CI result, source and negative paths in docs/TRADEFLOW_ENGINEERING_TASK_LEDGER.md and the relevant GitHub issue. PR #16 and #18 remain draft, unmerged and undeployed. No live customers, production migrations, external messages, payments or permissions are activated.
