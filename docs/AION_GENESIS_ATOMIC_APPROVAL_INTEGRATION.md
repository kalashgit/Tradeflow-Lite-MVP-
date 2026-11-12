# Genesis — authenticated approval / atomic synthetic executor acceptance

**Branch:** `research/aion-approval-atomic-execution` (stacked on PR #103); **status:** opt-in research implementation, no production or Cloudflare deployment.

## Scope and exact security claim

This is the next laboratory gate after strict named interrupt resume. A fully simulated invoice payment occurs in *one SQLite transaction* with its own fresh authorization check.

- `gml/strict_approval.py`: previously implemented unique interrupt IDs, checkpoint binding, exact action fingerprint, durable receipt and single-use `resume`.
- `gml/approval_host.py`: new `AtomicApprovalHost`, durable synthetic workflow state, local password-verified reviewer identities and opaque sessions, scoped approval entrypoint, atomic final commit.
- `gml/asil_v26` **does not exist**; the existing `asil_v26.safety.RiskGovernor` is reused, not rewritten.
- `tests/test_genesis_approval_host.py`: automated end-to-end and adversarial regression.

### Trust boundaries

| Input | Authoritative source |
| --- | --- |
| Human reviewer identity | Local simulated password verification + short-lived opaque session, **not** model text or approval ID |
| Workflow checkpoint, revision, tick | Host SQLite authoritative row |
| Invoice amount, scope, company cash | Host SQLite authoritative row |
| Authority state | Host SQLite state, minted as `AuthorityEvidence` inside the executor |
| Model proposed intent | Advisory only; host reconstructs bounded `ActionIntent` from current state |
| Human decision | Explicit named approval ID + session; persisted by existing strict ledger |
| Committed effect | Same `BEGIN IMMEDIATE` SQLite transaction that rechecks grant and receipt |

`request_approval` opens a strictly bound proposed **fictional** invoice payment, and `respond` uses an authenticated session to call strict resume. `commit_approved` does not trust a preflight permit: it opens a write transaction, checks the persisted approval ID and identity, re-reads workflow revision and checkpoint, checks invoice amount and action hash, checks current reviewer role and business authority, re-applies `RiskGovernor`, then updates the invoice and available cash, consumes the approval and writes one idempotency receipt **all in the same SQL transaction**.

No external side effects are possible from this module. A replay returns the previously written synthetic receipt with `replayed=True` and does not pay twice.

### Required no-effect demonstrations

The tests must prove a previously valid approval results in **zero simulated writes** after changing invoice amount, business permission, workflow checkpoint, cash, reviewer authority, regime or world clock. Other tests cover unknown credentials, session revocation, cross-tenant sessions, forged receipt, human rejection, ambiguous commits, duplicate approvals and concurrent payment attempts.

Atomicity applies only to effects stored in this *same SQLite file*. If integrated with real business systems, a real TradeFlow executor must implement its own transaction/permission boundary, durable idempotent command log, authenticated principal, source revisions, and reconciliation of ambiguous downstream results. **Do not use this fixture as a production approval server.**

## Local verification

```bash
cd research/aion-v06
python -m unittest discover -s tests -p test_genesis_approval_host.py -v
python -m unittest discover -s tests -p test_genesis_strict_approval.py -v
python -m unittest discover -s tests -q
```

This laboratory does not require Qwen inference, GPU usage, external network, customer information, or real API credentials.

## Next gated milestone

1. Independent Q01 security review on the draft research PR.
2. A real authenticated TradeFlow role and capability adapter, ideally server-only, with tenant-isolated business records.
3. External command executor with atomic recheck where feasible and an outbox/idempotency protocol for remote effects.
4. Test real service authentication, role revocation, authorization races, restart recovery and ambiguous remote commits.
5. Human approval before merging/deploying.

A green simulation is **not** proof of live production safety or of learned model capability.
