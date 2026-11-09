# T01 P0 correction — issues #54 and #66

## Verified scope

`evaluate.cjs` is a deterministic, memory-only oracle over PR #49's original three synthetic contractors. Its date parser now validates literal `YYYY-MM-DD` Gregorian dates, leap years and exact month lengths before any state transition. Failed events preserve all state and trace data.

`app-payroll-fixture.cjs` creates a disposable 12-employee synthetic contractor evidence overlay with business namespace `sim_TF_SIM_12`, USD currency, 2026-11-09 clock, $9,000 unverified opening cash, two $7,250 dated payroll entries, $10,000 outstanding uncollected receivables and a $4,800 supplier commitment due 2026-11-17. The underlying PR #49 fixture is not mutated and no records enter IndexedDB, D1, or a real tenant.

## Commands

```sh
node --test tests/t01-simulator-evaluation.test.cjs tests/t01-application-fixture.test.cjs tests/contractor-simulation-fixtures.test.cjs
node automation/simulator/evaluate.cjs
T01_APP_PAYROLL_MODULE=/absolute/path/to/frozen-integration/public/intelligence-payroll-risk.js node automation/simulator/app-payroll-fixture.cjs
```

If `T01_APP_PAYROLL_MODULE` is absent, application metrics stay null and the application-specific test skips. The module must be from an explicitly identified TradeFlow checkout, not a model-generated substitute. Artifacts are written under ignored `artifacts/t01` and `artifacts/t01-app`.

## Observed application result (X01 frozen integration `e74f5655`)

- Module: `public/intelligence-payroll-risk.js`, pure `analyzePayrollRisk` application function; no remote model provider.
- Actual result: two-week payroll $14,500, cash after payroll **−$5,500**, source `synthetic_fixture`, execution authority false.
- Oracle: cash after payroll **and committed supplier** **−$10,300**, shortfall $10,300.
- Difference: **$4,800**. The application function is explicitly a payroll-only calculator. It does not include the known supplier commitment or rank projects. This is a documented missing capability, **not** an incorrectly calculated payroll result.
- Application module and fixture results are captured in `artifacts/t01-app/payroll-journey.json` (actual response text, references, calculated difference, provenance, provider mode and read-only trace).

This is an **actual application module invocation**, not a browser, Worker HTTP endpoint, model inference, tenant authorization test or physical iPhone acceptance. Do not claim UI journey success from it. Only the payroll calculator is observed; all unexecuted product metrics remain null.

## Coordination / integration gates

- **I01:** agree the typed, versioned, authenticated financial evidence contract for payroll schedules, available cash, receivables, supplier commitments and source revisions. Do not turn a synthetic owner scenario into authenticated saved records.
- **D01/X01:** own an isolated application-browser fixture interface with a separate origin/storage partition; no T01 code writes application stores. Integrate only after confirming base ancestry against frozen PR #65.
- **Q01:** independently retest invalid calendar dates, exact hash preservation, financial coverage gap, provenance and unauthorized-action count at the new SHA. Physical browser and Worker authorization acceptance remain open.

No merge, deployment, production database migration, external communication or actual financial action is part of this change.


## T01 follow-up: existing owner-question route and source-pinned application observation

The added owner-journey-evaluation.cjs exercises TradeFlow's actual
analyzeOwnerPayrollQuestion function and the existing analyzePayrollRisk function.
The application module must match Git blob c0e60de3a812b066f94f5d7ed82dbe9a963f8866
from the frozen X01 e74f5655dc5ab36400b353723c5e0f90021ad330 source.
Changed or unexpected source is rejected before invocation. No runtime, database
or UI code was modified.

Reproduction from a checkout with the frozen application source available:

    node --test tests/contractor-simulation-fixtures.test.cjs tests/t01-simulator-evaluation.test.cjs tests/t01-application-fixture.test.cjs tests/t01-owner-journey-evaluation.test.cjs
    T01_APP_PAYROLL_MODULE=/absolute/frozen/public/intelligence-payroll-risk.js node --test tests/t01-owner-journey-evaluation.test.cjs
    T01_APP_PAYROLL_MODULE=/absolute/frozen/public/intelligence-payroll-risk.js node automation/simulator/owner-journey-evaluation.cjs

Output: artifacts/t01-app/owner-journey.json (ignored test evidence).
No module path means APP_NOT_RUN, application scores null and command exit code 2.

Observed from executing the fetched frozen application question function in an
isolated V8 source harness (NOT native exact-commit Node or browser CI):

- Owner question without figures: null; missing authenticated record binding.
- Explicit $9,000 cash / $10,000 receivables / $7,250 weekly payroll:
  conditional_calculation, -$5,500 after payroll; source=user_scenario.
- Conflicting cash balances: needs_clarification, no computed cash.
- Unverified $4,800 materials: needs_clarification, no completed action.
- Missing payroll: missing_data, cash coverage not computed.

Synthetic scenario cash is unverified: opening $9,000, two payrolls $14,500,
dated supplier obligation $4,800, uncollected receivables $10,000.
Full conditional oracle = -$10,300; application payroll-only answer = -$5,500;
coverage difference = $4,800. These are NOT verified company results.

The executable scorecard records two explicit product failures:
MISSING_OWNER_QUESTION_EVIDENCE_BINDING and SUPPLIER_COMMITMENTS_NOT_INCLUDED.
It also captures response text, provenance source, no model provider, hashes,
no execution authority, and null browser/LLM/authenticated-tenant scores.

I01: agree the authorized versioned financial evidence projection (cash,
dated payroll, verified collections, supplier commitments and unknown fields).
X01/D01: bind the existing thread to this projection in a disposable isolated
application origin; T01 cannot write actual IndexedDB, D1 or app.js.
Q01: independently re-run both invalid date replay guards and the entire
owner question to authorized proposal/receipt/persistence journey on the
new integration SHA. Previous Q01 signoff at 8944a1c does not cover this increment.
No merge, deploy or actual customer data is authorized.
