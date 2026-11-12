"""End-to-end synthetic host authority and atomic commitment regression.

Never performs a live TradeFlow action. Passwords are fictional test secrets.
The adversary can change approval IDs, session tokens, action context and state,
but may not mutate host SQLite directly (that is a separate DB-admin boundary).
"""

from dataclasses import replace
from pathlib import Path
import tempfile
import threading
import unittest

from aion_genesis.gml.approval_host import AtomicApprovalHost
from aion_genesis.gml.strict_approval import (
    ApprovalReceipt, StaleApprovalError, ResumeContext, guard_resumed_action,
)


class AuthenticatedAtomicApprovalTests(unittest.TestCase):
    PASSWORD = "synthetic-secret-for-integration-2026"

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.file = Path(temp.name) / "host.sqlite3"
        self.host = AtomicApprovalHost(self.file)
        self.host.setup_synthetic_workflow(
            scope="tenantA", workflow_id="wf1", checkpoint_id="cp1",
            subject="JOB1", invoice_id="INV1", amount=25, cash=100,
            tick=2, revision=7, route="fast")
        self.host.register_fixture_reviewer(
            scope="tenantA", reviewer_id="owner", password=self.PASSWORD)
        self.session = self.host.login(
            scope="tenantA", reviewer_id="owner", password=self.PASSWORD)

    def snapshot(self):
        return self.host.snapshot("tenantA", "wf1")

    def request(self, key="review1"):
        return self.host.request_approval(
            scope="tenantA", workflow_id="wf1", interrupt_key=key)

    def approve(self, ticket=None, *, session=None, decision="approve"):
        ticket = ticket or self.request()
        return self.host.respond(
            approval_id=ticket.approval_id, decision=decision,
            session_token=self.session if session is None else session)

    def assert_unchanged(self):
        state = self.snapshot()
        self.assertEqual(state["invoice_paid"], 0)
        self.assertEqual(state["paid_count"], 0)

    def test_true_authenticated_review_and_atomic_single_invoice_payment(self):
        ticket = self.request()
        receipt = self.approve(ticket)
        self.assertTrue(receipt.approved)
        result = self.host.commit_approved(receipt)
        self.assertFalse(result.replayed)
        self.assertEqual((result.amount, result.cash_after, result.revision_after),
                         (25, 75, 8))
        self.assertEqual(result.invoice_id, "INV1")
        state = self.snapshot()
        self.assertEqual((state["cash"], state["invoice_paid"],
                          state["paid_count"], state["revision"]), (75, 1, 1, 8))
        self.assertFalse(self.host.ledger.verify_receipt(receipt))  # consumed

    def test_wrong_password_and_unknown_reviewer_deny_session_creation(self):
        for who, secret in (("owner", "bad password"), ("model", self.PASSWORD)):
            with self.assertRaises(PermissionError):
                self.host.login(scope="tenantA", reviewer_id=who, password=secret)
        self.assert_unchanged()

    def test_untrusted_model_text_cannot_impersonate_human(self):
        ticket = self.request()
        for token in ("approve", "owner", ticket.approval_id, "", "Bearer owner"):
            with self.assertRaises(PermissionError):
                self.approve(ticket, session=token)
        self.assertEqual(self.host.ledger.pending_ids(
            scope="tenantA", workflow_id="wf1"), (ticket.approval_id,))
        self.approve(ticket)  # Failed impersonations did not consume approval.

    def test_revoked_session_blocks_review_and_keeps_interrupt_pending(self):
        ticket = self.request()
        self.host.revoke_session(self.session)
        with self.assertRaises(PermissionError):
            self.approve(ticket)
        self.assert_unchanged()
        session = self.host.login(
            scope="tenantA", reviewer_id="owner", password=self.PASSWORD)
        self.assertTrue(self.approve(ticket, session=session).approved)

    def test_nonapprover_role_cannot_authenticate_for_approval(self):
        self.host.register_fixture_reviewer(
            scope="tenantA", reviewer_id="observer", password=self.PASSWORD,
            can_approve=False)
        with self.assertRaises(PermissionError):
            self.host.login(scope="tenantA", reviewer_id="observer",
                            password=self.PASSWORD)

    def test_changed_amount_after_human_approval_prevents_payment(self):
        receipt = self.approve()
        self.host.change_invoice_amount("tenantA", "wf1", 99)
        with self.assertRaises(StaleApprovalError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()
        self.assertEqual(self.snapshot()["cash"], 100)
        self.assertEqual(self.snapshot()["amount"], 99)

    def test_revoked_authority_after_approval_prevents_payment(self):
        receipt = self.approve()
        self.host.change_authority("tenantA", "wf1", "denied")
        with self.assertRaises(StaleApprovalError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()

    def test_checkpoint_change_after_approval_prevents_payment(self):
        receipt = self.approve()
        self.host.change_checkpoint("tenantA", "wf1", "cp2")
        with self.assertRaises(StaleApprovalError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()

    def test_moved_world_clock_invalidates_old_approval(self):
        receipt = self.approve()
        self.host.advance_tick("tenantA", "wf1", 5)
        with self.assertRaises(StaleApprovalError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()

    def test_cash_change_after_approval_prevents_payment(self):
        receipt = self.approve()
        self.host.change_cash("tenantA", "wf1", 20)
        with self.assertRaises(StaleApprovalError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()
        self.assertEqual(self.snapshot()["cash"], 20)

    def test_reviewer_revoked_after_approval_prevents_payment(self):
        receipt = self.approve()
        self.host.set_reviewer_active("tenantA", "owner", False)
        with self.assertRaises(PermissionError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()

    def test_unreconciled_commit_prevents_side_effect(self):
        receipt = self.approve()
        self.host.mark_commit_uncertain("tenantA", "wf1")
        with self.assertRaises(StaleApprovalError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()

    def test_regime_shift_after_approval_fails_closed_on_fast_path(self):
        receipt = self.approve()
        self.host.change_regime("tenantA", "wf1", "shift")
        with self.assertRaises(StaleApprovalError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()

    def test_explicit_rejection_is_not_an_executable_approval(self):
        receipt = self.approve(decision="reject")
        with self.assertRaises(PermissionError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()

    def test_forged_or_changed_receipt_cannot_commit(self):
        receipt = self.approve()
        for forged in (
            replace(receipt, approval_id="falsified"),
            replace(receipt, reviewer_id="model"),
            replace(receipt, action_sha="0" * 64),
            replace(receipt, approved=False),
            replace(receipt, checkpoint_id="other"),
        ):
            with self.assertRaises(PermissionError):
                self.host.commit_approved(forged)
        self.assert_unchanged()
        self.host.commit_approved(receipt)
        self.assertEqual(self.snapshot()["paid_count"], 1)

    def test_second_commit_is_idempotent_without_second_business_effect(self):
        receipt = self.approve()
        first = self.host.commit_approved(receipt)
        second = self.host.commit_approved(receipt)
        self.assertTrue(second.replayed)
        self.assertEqual(first.commit_id, second.commit_id)
        self.assertEqual(self.snapshot()["paid_count"], 1)
        self.assertEqual(self.snapshot()["cash"], 75)

    def test_idempotent_receipt_lookup_rejects_forged_metadata(self):
        receipt = self.approve()
        self.host.commit_approved(receipt)
        for forged in (
            replace(receipt, checkpoint_id="wrong-checkpoint"),
            replace(receipt, revision=receipt.revision + 1),
            replace(receipt, answered_tick=receipt.answered_tick + 1),
        ):
            with self.assertRaisesRegex(PermissionError, "replayed_receipt_mismatch"):
                self.host.commit_approved(forged)
        self.assertEqual(self.snapshot()["paid_count"], 1)

    def test_session_token_length_is_bounded(self):
        ticket = self.request()
        with self.assertRaises(PermissionError):
            self.approve(ticket, session="A" * 10_000)
        self.assert_unchanged()

    def test_two_parallel_approvals_for_same_invoice_one_commit_only(self):
        t1, t2 = self.request("q1"), self.request("q2")
        r1, r2 = self.approve(t1), self.approve(t2)
        self.host.commit_approved(r1)
        with self.assertRaises(StaleApprovalError):
            self.host.commit_approved(r2)
        self.assertEqual(self.snapshot()["paid_count"], 1)

    def test_concurrent_double_commit_one_real_one_idempotent(self):
        receipt = self.approve()
        results, errors = [], []
        def worker():
            try:
                isolated = AtomicApprovalHost(self.file)
                results.append(isolated.commit_approved(receipt))
            except Exception as error:
                errors.append(error)

        a, b = threading.Thread(target=worker), threading.Thread(target=worker)
        a.start()
        b.start()
        a.join()
        b.join()
        self.assertEqual(errors, [])
        self.assertEqual(len(results), 2)
        self.assertEqual(sum(not x.replayed for x in results), 1)
        self.assertEqual(self.snapshot()["paid_count"], 1)

    def test_cross_tenant_session_cannot_approve_or_commit(self):
        self.host.setup_synthetic_workflow(
            scope="tenantB", workflow_id="wf1", checkpoint_id="cp1")
        self.host.register_fixture_reviewer(
            scope="tenantB", reviewer_id="owner", password=self.PASSWORD)
        other_session = self.host.login(
            scope="tenantB", reviewer_id="owner", password=self.PASSWORD)
        ticket = self.request()
        with self.assertRaises(PermissionError):
            self.approve(ticket, session=other_session)
        self.assert_unchanged()
        receipt = self.approve(ticket)
        self.assertEqual(receipt.scope, "tenantA")
        self.host.commit_approved(receipt)
        self.assertEqual(self.host.snapshot("tenantB", "wf1")["invoice_paid"], 0)

    def test_recheck_is_not_just_a_precommit_guard(self):
        # The original preflight is valid; an asynchronous revocation *after*
        # that preflight must still fail at the transactional executor boundary.
        ticket = self.request()
        receipt = self.approve(ticket)
        from aion_genesis.asil_v26.safety import (
            ActionIntent, AuthorityEvidence, RegimeAssessment,
        )
        intent = ActionIntent(
            "tenantA", "project_manager", "JOB1", "pay_invoice",
            2, 7, 100, 25, 2, 0, "fast")
        context = ResumeContext("tenantA", "wf1", "cp1", 7, 2, "owner")
        authority = AuthorityEvidence(
            "tenantA", "project_manager", "JOB1", "pay_invoice",
            7, 2, "granted", "host:grant:7")
        prelim = guard_resumed_action(
            self.host.ledger, receipt, intent,
            {"invoice_id": "INV1", "amount": 25, "currency": "EUR"},
            authority, RegimeAssessment("normal", (), ()),
            current_context=context)
        self.assertTrue(prelim.admissible)
        self.host.change_authority("tenantA", "wf1", "denied")
        with self.assertRaises(StaleApprovalError):
            self.host.commit_approved(receipt)
        self.assert_unchanged()

    def test_authentication_failure_does_not_change_host_state(self):
        before = self.snapshot()
        ticket = self.request()
        with self.assertRaises(PermissionError):
            self.host.respond(approval_id=ticket.approval_id,
                              decision="approve", session_token="invalid")
        self.assertEqual(before, self.snapshot())


if __name__ == "__main__":
    unittest.main()
