# TradeFlow Calendar and Universal Intelligence — Accepted Specification

Status: Design locked; implementation in progress. Development branch: `feature/v05-map`. Do not deploy to production Worker `calm-rice-1ea7` without explicit authorization.

## Product principle

TradeFlow is a local-first business command OS. One connected record system powers multiple specialized workspaces. Information-dense, sharp, responsive interface; meaningful icons and semantically consistent colors; minimal repetitive form entry. Prefer confirmed source data and editable smart defaults over invented assumptions. Offline single-user experience first; team-ready metadata without falsely advertising secure live collaboration.

## Universal intelligence header

- **Same structural design on mobile and desktop.**
- Fixed TradeFlow T logo and TRADEFLOW wordmark on left. **No orb, no separate AI symbol, no duplicated Calendar heading in top header.**
- Concise contextual summary is adjacent to wordmark, e.g. `3 priority tasks today ›`, derived only from saved records.
- Tapping that summary replaces it *in place* with a horizontally scrollable row of actionable chips (Tasks, Conflicts, Proposals). No vertical expansion, overlay, new header row, or moving brand.
- One notification bell stays at far right; no persistent search or profile icon. Bell's unread indication must be truthful.
- Tapping a chip navigates to an actual relevant workspace/review. Counts are real, never decoration. Context may include business-wide items, not just current page. Logo is the universal identity of the future intelligence system.

## Calendar UI

The approved visual reference is the provided dark TradeFlow calendar design: desktop left mini month + calendar layer toggles, time-positioned 7-day week, colored event blocks, compact Day/Week/Month controls; mobile readable Day view with independent timeline scroll and compact calendar-filter drawer. Avoid page zoom/drag conflicts. The main calendar should load real Tasks/Jobs immediately.

- Event tap gives a lightweight quick card loaded from existing client-side records. **Open Record** is the dominant CTA for linked business entries; it goes directly to the correct record, with return to same calendar date/view/scroll.
- Standalone event's primary action is Edit Event. Context-only secondary actions are permitted if genuinely useful.
- User-created calendar layers have unique IDs, names, colors, visibility and future permission metadata. Hiding a calendar affects display, never resource availability.
- Do not copy Opportunity pipeline statuses blindly into Calendar colors. Default semantic calendar colors: cyan brand/primary, blue customer calls, green jobs/site work, purple proposals/quotations, amber tasks/action, pink personal, slate internal, red only scheduling conflicts/blocked warnings. Never rely on color alone to convey status.
- Do not show proposed AI actions or fabricated recommendations before local data supports them.

## Linked data architecture

- Authoritative record created **once**. Existing Task or Job is visible in Calendar automatically when it contains relevant date/deadline metadata. Unscheduled Tasks appear in a planning queue; a deadline is not an invented appointment time.
- Separate stores `calendars`, `calendarEntries`, `calendarProposals`, `calendarPreferences`, `calendarAudit`. Preserve legacy `tasks`, `jobs` and activity-log `events`. Never repurpose activity-log `events` for calendar entries.
- A Task can have many linked calendar sessions. Scheduled time and actual completed work are distinct. Elapsed time alone never marks a Task complete.
- Store links as stable sourceKind/sourceId, and avoid duplicate conversion on repeated app opening. Read/change authoritative records across Tasks, Jobs, Customers, Quotations, Opportunities, Map and eventually Finance.
- Offline first: no remote AI or calendar provider needed for basic scheduling. Backup/migration must retain existing records.

## Hybrid local scheduler

- Default planning search horizon **14 days**, configurable. This does not limit how far ahead manual events can be booked.
- Fixed commitments protected. Flexible tasks can move; splittable tasks can use multiple sessions with user-defined minimum block duration. No overlapping assigned exclusive resources; respect approved working days/hours, dependencies, deadlines, estimated duration, breaks/buffers where entered.
- Deterministic local conflict detection and proactive recovery proposals, no silent edits. Explain what moves and why. Approval is mandatory; recompute/validate against latest records immediately before committing related changes atomically when possible. Record audit and safe undo where implemented.
- Distinguish unscheduled, proposed, scheduled with different visual treatments. If no feasible plan exists, show risk rather than fictitious availability. Do not infer travel times, skill coverage, materials delivery or job completion without evidence.
- Core priority uses critical/high/normal/low/optional and firm versus flexible. Fixed customer commitments are never automatically displaced by a higher priority task.

## Future intelligence architecture (not yet live)

Universal business assistant should eventually act through the same validated command/workflow layer, using voice and text; operational memory, preference learning, strategic objectives, and auditable decision/outcome history. It should act as a business coach and operator, be accessible across all pages but visually nearly invisible, and honor permissions/approval boundaries. Optional BYO AI/cloud; do not imply this has been shipped.

## R06 implementation checkpoint

Implemented on `feature/v05-map`: shared header with truthful contextual counts and horizontal chips; R03 time-grid calendar and mobile day view; layered calendars; standalone calendar entries; linked Task/Job records; non-modal quick-card opening; dominant Open Record; return-to-calendar navigation; local scheduler with splitting, deadline/dependency checks, 14-day horizon, approval hooks and audit; compact scheduling preferences; service worker asset refresh. Existing automated calendar and scheduling-engine tests passed in isolated execution on 2026-10-17.

**Not verified or not complete**: green GitHub Actions run for the latest commit and actual iPhone/desktop preview behavior; browser regression and touch/scroll checks; advanced schedule recovery and multi-party approval, robust undo UX, genuine shared permissions/sync, external calendars, voice, operational AI memory and strategic AI planning. Do not describe these as live features.

## Deployment discipline

Preview Worker: `tradeflow-v05-preview`; expected preview URL: `https://tradeflow-v05-preview.bartoszszarafinski.workers.dev/`. Protect production. GitHub code commit is not proof of live deployment. After each meaningful release verify GitHub Actions success and then test on the preview, ideally on iPhone and desktop. Preserve previous functionality and user data.
