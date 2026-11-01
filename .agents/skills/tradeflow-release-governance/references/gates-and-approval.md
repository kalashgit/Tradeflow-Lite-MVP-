# Release Gates, Risk and Approval Matrix
## Stage 0: internal research and local skill docs
Allowed with user instruction; no customer data, live code execution or deployment. Verify saved artifact, current PR and any new commit CI.
## Stage 1: engineering code acceptance
Exact current SHA, static/regression tests and browser fixtures, identity/role tests, offline/reload, duplicate execution, approved command flows, no unacknowledged writes declared successful. Report failures and fixture limits.
## Stage 2: product acceptance
Human desktop/mobile tests and physical iPhone Safari/PWA, offline field entry, visibility of incomplete data, workflow completion with no coaching. Synthetic Chromium is NOT physical test.
## Stage 3: operational pilot
Customer permission, scoped test tenant or separately approved real data, DPA/privacy, role controls, backup/restore, support process, clear limits. Actual contractor success/failure logged.
## Stage 4: outcome/commerce
Baseline and measured delta, actual paid demand, sustainable cost to onboard/support/serve, ability to cancel/export, revenue/collection claims verified.
## Rules
No forced PR merge, production deployment, live billing/refund, merchant authorization, production D1 schema changes, tenant provisioning, unapproved customer communications or secret exposure. R01-02 job-scoped roles and production migration remain explicit founder decision boundaries.
## Gate report
Stage, exact evidence and dates, approved-by, risks and rollback, blocked items, next lawful action. Status: NOT RUN, FAILED, PASSED SYNTHETIC, PASSED PHYSICAL, VERIFIED OPERATIONAL or VERIFIED OUTCOME. **Never combine gates into one green status.**
## Stop triggers
Cross-tenant leak; approval bypass; unverified financial claim; duplicated irreversible write; data loss; no required customer permission; unknown compatibility. Stop advancement, preserve evidence, escalate owner/engineer.
## Original pain register
No pain point retired merely because synthetic detector or scenario is green; existing count 0/62 until original end-to-end outcome evidence qualifies.
