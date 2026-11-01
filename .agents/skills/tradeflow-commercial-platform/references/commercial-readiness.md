# Commercial Readiness Matrix

## Non-negotiable gates
- Real identity with server-enforced owner/admin/member/viewer behavior; validate real role revocation and tenant isolation in independently approved non-production environment.
- Subscription entitlements cannot depend on client-only flags. Explicit plan limits for AI text turns, voice minutes, data size and team seats.
- Record and conversation data handling: privacy notices, lawful basis, retention/deletion/export process, access log controls and subprocessors reviewed by appropriate counsel.
- Operational telemetry: only opt-in/minimized event metadata; no raw prompts, personal audio, tokens or unredacted contractor records in analytics/logs.
- Rate limiting, abuse controls, model capacity planning, backups, restore drills, disaster recovery and support escalation.
- Payment provider merchant account verified; terms/refund/ownership/warranty conditions independently reviewed. Never claim automatic legal compliance.

## Pilot economics
For each contractor: time saved per week; accuracy of verified insights; task completion through existing approval receipts; acquisition-to-activation; monthly retention; infra cost by text tokens, voice seconds, storage and support time.
Charge only when demonstrably reliable and useful; mark synthetic proof as engineering, not sales validation.

## Controlled release
Draft PR → exact SHA CI → isolated private staged environment → H03 physical phone/desktop acceptance → security/privacy review → pilot with informed consent → outcome evidence → explicit production approval.
Production deploy, merchant changes, billing activation and marketing outreach are separately authorized changes, NEVER implied by 'ready to sell'.
