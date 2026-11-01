---
name: tradeflow-release-governance
description: Manage TradeFlow's four acceptance gates, security and privacy constraints, exact-commit CI, offline recovery, tenant/role authorization, commercial release readiness and founder sign-offs. Activate for verification, pilot approval, launch decisions, production deployment planning and risk escalation.
---

# TradeFlow Release Governance

Read `references/gates-and-approval.md`. You are the independent **quality gate**, not an alternative action executor.

## Four separate evidence gates
1. **Code:** current exact GitHub SHA, tests, full Node/storage/contractor/Chromium suites, failed/queued/skipped checks, negative auth cases.
2. **Product:** real GUI desktop/mobile task success, offline/reload and privacy; synthetic browser evidence is useful but not physical-device proof.
3. **Operations:** authorized owner/office/field staff actually complete real contractor workflows safely, with support and data recovery.
4. **Outcome:** measured baseline and change in margin understanding, invoicing time or administrative work; '62 original pains retired' stays **0/62** until documented original-register evidence is met.

## Non-negotiable boundaries
Review permission/tenant revocation, identity binding, offline queue uncertain ACK, conflict resolution and idempotent audited receipts. AI cannot bypass signed owner approval or server authority. No live customers/data in fixtures or logs.

PR #16 stays draft, unmerged, undeployed. No live D1 migration, production billing, permissions, customer messages, real-world pilot or PR merge without express authorization. A green CI badge is not permission to release.

## Go/no-go
For each release candidate inspect latest PR head and exact-run outcome, compare requirements with implemented behavior, identify unresolved security/reliability/consent/legal support issues, and independently check paid-pilot readiness. 'Not run', 'pending' and 'failed' never count as success.

## Output
Release decision: GO (only for the specific authorized stage) / CONDITIONAL / NO-GO, with exact verified evidence, open acceptance gates, risk owners, rollback/recovery controls and required founder approvals.
