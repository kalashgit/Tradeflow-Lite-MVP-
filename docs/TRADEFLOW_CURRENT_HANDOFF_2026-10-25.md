# TradeFlow latest context — 2026-10-25

**Status:** Project handoff / product decisions. This is not a claim that every feature is live. Check current branch code, tests, preview deployment and user data before making changes.

## Canonical environment
- Repository: `kalashgit/Tradeflow-Lite-MVP-`
- Active development branch: `feature/v05-map`
- Preview: https://tradeflow-v05-preview.bartoszszarafinski.workers.dev/
- Product: TradeFlow Lite / TradeFlow Intelligence. Local-first/offline-capable business headquarters for small US trade contractors (electrical, HVAC, plumbing, construction); optional AI, cloud and paid lead services. Early contemplated offer around $199 one-time plus usage-related services; **not final pricing**.
- Keep the separate Austin E01 electrical research plan intact; permits and project signals are not evidence of an actual live bid.

## Design contract
Use the existing navy/teal/cyan TradeFlow visual language, sharp compact typography, fine borders, consistent semantic status colors and tight, symmetrical layouts. Never introduce mobile horizontal overflow, overflowing form inputs, unnecessary vertical overlays, or gratuitous dashboards.

Universal intelligence header is shared by all pages. TradeFlow logo and name remain fixed; pressing that brand toggles contextual horizontally expandable action chips, while pressing a chip navigates to the workflow, not collapses the header. Concise summary by default; no orb, no extra AI icon, and no duplicate 'Needs attention' panel on each page. Same behavior on desktop and mobile (scroll chips horizontally if required). AI is ubiquitous in utility, unobtrusive in UI.

Calendar creation: quick direct-slot one-hour defaults; compact editable bottom sheet, configurable start/end, color-coded Event/Task/Site Visit/Meeting choices, drag/expand/collapse, tap-to-edit and minimal-delete affordance. No extra Create button for immediately persisted event, no redundant Today button; editable title should clear 'New event' easily. Keep calendar visible by allowing the sheet to retract.

## Connected application modules
Review actual code before assuming state; earlier preview work included:
- Opportunities: meaningful lifecycle/status colors, sourcing and evidence states.
- Finance / Invoices / Job Costing: recorded finances, costs, estimates/budgets and locally saved invoice drafts. Never claim regulated tax invoicing, email sending, payments or provider synchronization are operational unless actually verified.
- Suppliers: customer/job/network links and explicit authorized native-mail handoffs.
- Marketing Studio: targeting and campaign planning; advanced channel integrations and automation depend on authorized services.
- Research Briefs: saved research specifications, linked Opportunities, human QC review with evidence notes, approved-results and rejection-log export. A brief does not execute research, and imported source fields are not automatic external verification.
- Crew & Dispatch: roster, working days, leave, assignments, timed conflict checks, day-based dispatch. Unknown availability must remain unknown.
- Manual Route Planner was removed from More navigation; preserve saved route data. Later Map/Calendar/AI-driven routing should proactively propose route changes using real travel data and owner approval rather than make users open an extra planning tool.
- Integrations: branded searchable directory, categories, setup details, offline logos and local export handoffs. Catalog entry != connected account. Genuine OAuth requires secure provider registration, scoped tenant-separated tokens, refresh/revoke, callback, verified webhook and consent.
- Target Customers / Buyer Personas: saved ICPs and personas, active target, editable cards, explicit validation states, counts from actually linked Opportunities. Never fabricate profile validation or linked metrics.

## Strategic architecture: newest user discussion
Business Missions should probably be retained but reframed as a **Command Center** with:
1. **Missions:** measurable objectives with target, baseline, milestone, deadline, ownership, progress and traceable links to jobs, invoices, opportunities and tasks.
2. **AI War Room:** owner–AI strategic meetings and morning briefings, scenario evaluations, evidenced recommendations and proposed actions. This must use the **same** global business context, recommendation engine and authorization rules as the universal header, not a disconnected assistant.

This rebrand is an **unconfirmed proposal**; user has not explicitly approved replacing the Business Missions menu with Command Center yet. For immediate launch, prioritize reliable local Missions and real linked-record status. Clearly label any War Room concept/prototype rather than simulate a live agent.

AI communication architecture: user choice of voice, silent expandable proposal panels, or manual-only mode; configurable interruptions and daily briefings. The header is the entry point/attention signal, **not** a place to render full conversations. The system's goal is shoulder-to-shoulder business partnership, proactive optimization, and owner control. No silent schedule/financial/send/CRM mutations without appropriate permissions and explicit approvals. Browser-only local-first applications cannot guarantee continuous background AI execution on a locked phone; optional supported cloud or native background infrastructure may be needed.

## Operating rules for the next assistant
1. Inspect current GitHub files (repository has evolved) before edits. Never rely on stale snapshots or claims of deployment success.
2. Analyze the target page, compare commercial capabilities, agree a matching image/reference and proposed launch scope, then implement.
3. Preserve schemas, local data, exports, migrations and tests. Do not destroy legacy routes or overwrite separate research files.
4. Test functionality, business record referential integrity, honest source/connection/AI statuses, permissions, responsive iPhone layout, and offline cache invalidation.
5. Commit to the preview branch and verify CI/deployment before telling the user it is live.
6. Next step: inspect Business Missions implementation, decide Command Center/Missions/War Room framing, propose minimal functional V1 and reference; do not claim a working AI War Room yet.
