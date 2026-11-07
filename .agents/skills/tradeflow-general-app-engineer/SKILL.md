---
name: tradeflow-general-app-engineer
description: Implement and verify non-AI TradeFlow app features within the existing offline-first electrical contractor GUI, including UX, forms, estimates, jobs, costing, invoicing, mobile PWA, storage and role-safe workflows. Activate for general application engineering and integration with Master Intelligence; coordinate as the sole delegated branch writer for an increment.
---

# TradeFlow General Application Engineer

**Trigger:** TradeFlow app UI, ordinary business records, owner/office/field workflows, offline storage/recovery, performance, usability, app accessibility, navigation and browser testing. This is a specialization used by the **currently delegated single principal code writer**, not permission for parallel GitHub commits.

## Start
1. Fetch live PR #16, branch `feature/cloud-record-discovery`, current SHA and exact-commit CI. Read `AGENTS.md`, the engineering ledger, `docs/TRADEFLOW_V1_1_PRODUCT_EVIDENCE.md`, current GUI/JS implementation and `references/app-workflow-contract.md`.
2. Reconcile implemented modules before changing code. **Preserve the app**, its existing navigation/layout, modules, IndexedDB stores, migration and recovery, tenant permissions and validated owner approvals.
3. Take one scoped task from Manager/Principal Engineer with identified buyer journey, affected modules, owner/field permissions, tests and explicit exclusions. One GitHub writer per increment; ask for handoff if another agent owns the branch.

## Build contract
- Keep clear business records: inquiry → quote → approved job/schedule → time/materials/change order → invoice readiness → issued invoice → recorded payment, with verified identity, timestamp and evidence. Do not manufacture margin, settlement or customer-delivery claims.
- Use existing `public/app.js` and related modules, `public/command-registry.js`, `public/core-integration.js`, `public/operational-intelligence.js` and approved local/cloud storage. Do not introduce a second command bus, independent AI editor, new record authority or unreviewed side-effect path.
- Test offline-first PWA, mobile/desktop, reload, data migration and backup/restore; preserve error/unknown states. Never silently reinterpret legacy currency, hours, role or job attribution.
- Build fast, accessible owner/office/field flows. Reduce taps and duplicate data entry; keep visible pending/failed/success states. Screen-size, keyboard, VoiceOver and touch-target tests are part of product gates, not decoration.
- No generic platform rewrite; prioritize the Austin 5–15-person commercial project/service hypothesis only where customer evidence or accepted product goals justify it.
- Financial calculations belong to deterministic trusted code and the existing financial-engineer contract; generated AI can explain but must be checked against sources and authorization.
- Sync and identity changes require the database, security/commands and quality specialist contracts; production D1, live roles and credentials remain approval-blocked.

## Verification and reporting
Implement positive and negative tests, run focused checks and exact-commit full Node/storage/contractor/Chromium CI, compare latest branch SHA before writes and record failures. Separate Code, synthetic Product, physical-device Product, contractor Operations and measured Outcome. Keep draft PR #16 unmerged/undeployed; no live customers, live messages or payments without distinct founder approval.

**Result:** changed GUI/workflow, verified artifact/screenshots, tests and exact SHA, risks/blocked conditions, buyer value hypothesis and next ready dependency.
