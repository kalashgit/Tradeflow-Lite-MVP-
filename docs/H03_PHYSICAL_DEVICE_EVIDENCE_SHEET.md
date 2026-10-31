# TradeFlow H03 — Physical Two-Device Acceptance Evidence Sheet

**Status: UNEXECUTED / NO-GO until separately authorized.** This is a blank, reusable evidence sheet accompanying the source-controlled H03 acceptance plan in `docs/TRADEFLOW_ENGINEERING_TASK_LEDGER.md`. A filled sheet is **not** an authorization mechanism. Do not enter credentials, tokens, personally identifying account details, real customer data, actual tenant IDs, signed URLs, or unredacted screen captures into GitHub.

## Control record (operator completes before touching an isolated environment)

| Required item | Value / evidence reference |
|---|---|
| Change ticket / founder's explicit approval | NOT PROVIDED |
| Independent reviewer / operator authorization | NOT PROVIDED |
| Tested PR SHA and CI run | NOT RECORDED |
| Isolated non-production deployment revision | NOT PROVISIONED |
| Non-production environment and synthetic tenant alias | NOT PROVIDED |
| Access/application and server role matrix approved | NOT PROVIDED |
| Test identity aliases: owner/admin and limited member | NOT PROVIDED |
| Controlled revocation operator and rollback owner | NOT PROVIDED |
| Device A (model, OS, browser), Device B (model, OS, browser) | NOT PROVIDED |
| UTC start/end; evidence file digests; data cleanup plan | NOT PROVIDED |

**Go/no-go decision:** NO-GO unless each required item above is independently checked and approval is explicit. Never substitute a local test fixture or a screenshot of a login page for live server authorization.

## Expected vs observed acceptance matrix

All rows begin **NOT RUN**, not pass. For each scenario record a redacted UTC timestamp, request/receipt correlation IDs (never tokens), server-side revision and audit evidence, device screenshot/video reference, reviewer signature/alias and whether the scenario is independently verified. Any rejected write must have **zero** new remote effects/audit entries.

| ID | Scenario | Expected non-production behavior | Status | Evidence references |
|---|---|---|---|---|
| H03-01 | Two physical device sessions with distinct approved identities | Server attests tenant, principal and role on every authorized read/write | NOT RUN | — |
| H03-02 | Wrong-tenant / wrong-role request | Denied; no cross-tenant disclosure, write or audit mutation | NOT RUN | — |
| H03-03 | Offline A revision N, competing device B revision N+1 | A retains draft and conflict; never overwrites B automatically | NOT RUN | — |
| H03-04 | Changed content at same remote revision during conflict review | Review aborts; reread required; no stale commit | NOT RUN | — |
| H03-05 | Lower-role financial/crew approval and owner role downgrade | Owner-only action denied; no write despite stale client role | NOT RUN | — |
| H03-06 | Member or Access revocation during queued offline write | New server read/write denied; no silent replay or success | NOT RUN | — |
| H03-07 | Interrupted acknowledgment after verified server CAS | Authorized receipt readback shows one remote effect, one audit and no duplicate PUT | NOT RUN | — |
| H03-08 | Reload, background/foreground, disconnect/reconnect | Drafts and receipts persist without tenant or principal leakage | NOT RUN | — |
| H03-09 | Cleanup and reviewer sign-off | Disposable records and grants cleaned up; no production side effect | NOT RUN | — |

## Evidence to capture for EACH case

- Tested code commit and isolated deployment revision, signed reviewer approval/authority and UTC event timestamp.
- Identity/role **aliases**, tested authorization scope and tenant **alias** only; include the authoritative server-side decision, not browser-local role assertions.
- Redacted before/after server revisions, record counts and audit counts; distinguish attempted requests from committed effects.
- Client state before and after reload, offline conflict and receipt; preserve the original draft on rejection.
- Capture network failure type (offline, Access redirect, authorized revocation, lost response) and server request correlation ID without cookies, JWTs or secrets.
- Screenshots or videos must be redacted before entering the repository; store evidence in an approved location and reference immutable digests.
- Mark each scenario **PASS / FAIL / BLOCKED** only after independent review; partial results must not become a release claim.

## Stop conditions and recovery protocol

On unauthorized read/write, stale overwrite, duplicate effect or audit entry, cross-role escalation, unverified success, loss of queued draft, or disagreement between deployed SHA and tested SHA: STOP all mutations, preserve redacted evidence, lock out further testing, and obtain a fresh change decision. Do not retry an uncertain write. Reconcile against the authoritative server receipt and revision before any subsequent authorized action. Revert only within the approved isolated test environment under the named operator.

## Acceptance boundaries

A synthetic Node/Chromium pass does not satisfy this sheet. Even all H03 rows passing does not authorize a production migration, public deployment, unapproved role grants, live provider, money movement, customer contact or a claim that the original 62 research pain points are retired. Production `0003` migration stays PREPARED ONLY; PR #16 remains draft and unmerged. No real devices, accounts, permissions or remote databases are provisioned by this document.
