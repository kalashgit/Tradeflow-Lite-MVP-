# TradeFlow — Codex engineering instructions

This repository is an **existing**, offline-first, AI-native contractor operating system. Continue its working architecture; do not scaffold a replacement application.

## Start of every Codex session
1. Inspect the current GitHub PR #16 and remote `feature/cloud-record-discovery` head before changing files. The base is `feature/library-universal-intake`. Do not reset, force-push, or overwrite newer commits.
2. Read `docs/TRADEFLOW_ENGINEERING_TASK_LEDGER.md`, `docs/TRADEFLOW_ENGINEERING_HANDOFF_2026-10-30.md`, `docs/TRADEFLOW_UNIFIED_ARCHITECTURE_BACKLOG.md`, `docs/TRADEFLOW_V1_1_PRODUCT_EVIDENCE.md`, and `docs/H03_PHYSICAL_DEVICE_EVIDENCE_SHEET.md`.
3. Treat the Master Development Roadmap v1.1 (Google Doc ID `1_6HAHgumQ2EKrH4Yw2w-ZZ1CqVTMnfe_AVnrisaCX6o`) as strategic priority, the ledger as execution tracking, and the actual source plus exact-commit CI as authoritative implementation evidence. Historical SHA and test counts are **not** current unless rechecked.
4. Inventory existing implementation/tests before selecting the highest-priority dependency-ready unfinished task. Do not duplicate previously completed TF-P01–P10, TF-P06 labor-review, H03 security/recovery, or cloud identity validation.

## Engineering rules
- Preserve the single shared command, authorization, explicit approval, auditable receipt and uncertainty-reconciliation architecture. No parallel autonomous writer.
- Maintain tenant isolation, offline-first data preservation, role boundaries, deterministic source bindings, safe local queue recovery and authorization rechecks. A lost acknowledgment must not cause a blind replay.
- Prefer small, source-backed, executable changes with focused regression tests. Preserve all prior regression coverage.
- No secrets, real customer records, tokens, PII, unredacted screenshots or credentials in source, issues, commits or CI output.
- Do not merge PR #16, deploy public/production/private Workers, run production D1 migration `0003`, change live roles, provision identities, contact customers, or trigger live payments without separate explicit authorization. Keep PR **draft**.
- H03 physical two-device, server-enforced role revocation and interrupted-ack testing require approved nonproduction identities, independent devices, test environment and operator. `docs/H03_PHYSICAL_DEVICE_EVIDENCE_SHEET.md` is **NOT RUN / NO-GO** until those prerequisites are supplied. Synthetic passes cannot retire real-device or contractor outcome gates.
- R01-02 job-scoped roles and production migration remain founder-approval blocked; do not silently authorize either.

## Local verification (run what the environment supports)
```bash
npm ci
npm test
npm run test:storage
npm run test:contractors
npm run test:browser
```
Additional Chromium scripts and their CI configuration must be inspected and retained; do not assume `test:browser` alone covers everything. Verify both desktop and mobile and the proactive labor journeys using existing CI jobs. If dependencies, browsers, files or runtime access are absent, report that limitation rather than invent a pass. GitHub Actions **exactly at the published SHA** is required for accepted increments. Inspect failures and logs before claiming green.

## Historical handoff checkpoint (reconcile, do not hardcode)
At creation of this file, draft PR #16 head was `3eb70491c1295502c288ce9827eec4e9c4ec1c69`; GitHub Actions run `41233078055` / #502 SUCCESS: focused Node **149/149**, full Node **565/565**, main Chromium **28/28**, proactive labor Chromium **2/2**. Work includes authenticated tenant-scoped response verification; see handoff and ledger for earlier negative CI #494 and its fixture fix. **This AGENTS.md commit changes the SHA and requires fresh exact-head CI.**

## End of each safe increment
- Commit and push to the existing development branch only; check for remote concurrent changes before updating.
- Check exact-commit GitHub Actions, including Node, storage, contractor, browser, synthetic D1 and labor journeys; record accurate counts and failed stages.
- Update ledger/handoff with implemented behavior, evidence SHA, known failures, blockers and next ready task.
- Report the final remote SHA, CI URL/status, changed files, preserved safeguards and remaining real-world acceptance gates.
- Never claim finished or release-ready merely because synthetic tests pass.

## Immediate next work
Reconcile current head, CI and ledger; finish only dependency-ready unblocked engineering. The critical H03 authenticated physical-device acceptance requires separately approved people/devices/environment. Prepare evidence without bypassing that gate. The original research pain-point retirement remains **0/62** until genuine contractor evidence exists.
