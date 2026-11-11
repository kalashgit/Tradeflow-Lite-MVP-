"""Adversarial research tests for strictly bound Genesis approval resumes."""

from dataclasses import replace
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

from aion_genesis.asil_v26.safety import (
    ActionIntent, AuthorityEvidence, RegimeAssessment,
)
from aion_genesis.gml.strict_approval import (
    ApprovalReceipt, ResumeContext, StaleApprovalError,
    StrictApprovalLedger, guard_resumed_action, action_fingerprint,
)


class StrictApprovalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "genesis-approval.sqlite3"
        self.ledger = StrictApprovalLedger(
            self.path, reviewer_authorizer=lambda who, ticket:
            who == "owner" and ticket.scope == "tenantA")
        self.intent = ActionIntent(
            "tenantA", "project_manager", "JOB1", "pay_invoice",
            2, 7, 100, 25, 2, 0, "fast")
        self.args = {"invoice_id": "INV-1", "amount": 25}
        self.ctx = ResumeContext("tenantA", "wf1", "cp-2", 7, 2, "owner")
        self.authority = AuthorityEvidence(
            "tenantA", "project_manager", "JOB1", "pay_invoice",
            7, 2, "granted", "auth:7")

    def issue(self, *, key="interrupt-1", **kwargs):
        return self.ledger.issue(
            self.intent, self.args,
            workflow_id=kwargs.get("workflow_id", "wf1"),
            interrupt_key=key,
            checkpoint_id=kwargs.get("checkpoint_id", "cp-2"),
            issued_tick=2, expires_tick=4)

    def resume(self, ticket, *, answer="approve", ctx=None, intent=None, args=None):
        return self.ledger.resume(
            {ticket.approval_id: answer}, ctx or self.ctx,
            intent or self.intent, args if args is not None else self.args)

    def test_valid_resume_persists_then_requires_executor_recheck(self):
        ticket = self.issue()
        receipt = self.resume(ticket)
        self.assertTrue(receipt.approved)
        self.assertTrue(receipt.requires_atomic_executor_recheck)
        self.assertTrue(self.ledger.verify_receipt(receipt))
        decision = guard_resumed_action(
            self.ledger, receipt, self.intent, self.args,
            self.authority, RegimeAssessment("normal", (), ()))
        self.assertTrue(decision.admissible)
        self.assertTrue(decision.requires_atomic_recheck)
        self.assertIn("atomic_authorization", decision.reason)
        self.assertEqual(self.ledger.pending_ids(scope="tenantA", workflow_id="wf1"), ())

    def test_duplicate_and_replayed_approval_fail_before_write(self):
        ticket = self.issue()
        self.assertEqual(ticket.approval_id, self.issue().approval_id)
        self.resume(ticket)
        with self.assertRaisesRegex(StaleApprovalError, "not_pending"):
            self.resume(ticket)
        with self.assertRaisesRegex(StaleApprovalError, "already_used"):
            self.issue()
        self.assertEqual(self.ledger.pending_ids(scope="tenantA", workflow_id="wf1"), ())

    def test_wrong_id_and_empty_ambiguous_or_bare_resume_are_refused(self):
        ticket = self.issue()
        for answers in ({}, "approve", {ticket.approval_id: "approve", "other": "reject"}):
            with self.assertRaises(StaleApprovalError):
                self.ledger.resume(answers, self.ctx, self.intent, self.args)
        with self.assertRaises(StaleApprovalError):
            self.ledger.resume({"00000000000000000000000000000000": "approve"},
                               self.ctx, self.intent, self.args)
        self.assertEqual(self.ledger.pending_ids(scope="tenantA", workflow_id="wf1"),
                         (ticket.approval_id,))

    def test_two_parallel_interrupts_have_distinct_ids(self):
        first = self.issue(key="q1")
        second = self.issue(key="q2")
        self.assertNotEqual(first.approval_id, second.approval_id)
        self.resume(second)
        self.assertEqual(self.ledger.pending_ids(scope="tenantA", workflow_id="wf1"),
                         (first.approval_id,))
        self.resume(first)
        self.assertEqual(self.ledger.pending_ids(scope="tenantA", workflow_id="wf1"), ())

    def test_checkpoint_branch_change_refused(self):
        ticket = self.issue()
        with self.assertRaisesRegex(StaleApprovalError, "checkpoint_scope"):
            self.resume(ticket, ctx=replace(self.ctx, checkpoint_id="cp-3"))
        self.assertEqual(self.ledger.pending_ids(scope="tenantA", workflow_id="wf1"),
                         (ticket.approval_id,))

    def test_changed_action_parameters_cannot_use_old_approval(self):
        ticket = self.issue()
        changed_args = {"invoice_id": "INV-1", "amount": 99}
        with self.assertRaisesRegex(StaleApprovalError, "action_changed"):
            self.resume(ticket, args=changed_args)
        self.assertNotEqual(action_fingerprint(self.intent, self.args),
                            action_fingerprint(self.intent, changed_args))
        self.resume(ticket)

    def test_revision_change_refused_and_requires_new_interrupt(self):
        ticket = self.issue()
        ctx = replace(self.ctx, current_revision=8)
        with self.assertRaises(StaleApprovalError):
            self.resume(ticket, ctx=ctx)
        revised = replace(self.intent, revision=8)
        with self.assertRaises(StaleApprovalError):
            self.resume(ticket, intent=revised)
        self.assertEqual(ticket.approval_id, self.issue().approval_id)

    def test_expired_future_or_reordered_time_refused(self):
        ticket = self.issue()
        for tick in (0, 5):
            with self.assertRaisesRegex(StaleApprovalError, "expired_or_future"):
                self.resume(ticket, ctx=replace(self.ctx, current_tick=tick))
        self.resume(ticket)   # failed attempts did not consume it

    def test_cross_scope_cross_workflow_and_reviewer_impersonation_refused(self):
        ticket = self.issue()
        for ctx in (replace(self.ctx, scope="tenantB"),
                    replace(self.ctx, workflow_id="wf2")):
            with self.assertRaises(StaleApprovalError):
                self.resume(ticket, ctx=ctx)
        with self.assertRaises(PermissionError):
            self.resume(ticket, ctx=replace(self.ctx, reviewer_id="model"))
        self.assertEqual(self.ledger.pending_ids(scope="tenantA", workflow_id="wf1"),
                         (ticket.approval_id,))

    def test_rejection_is_durable_and_not_permission(self):
        ticket = self.issue()
        receipt = self.resume(ticket, answer="reject")
        self.assertFalse(receipt.approved)
        self.assertFalse(self.ledger.verify_receipt(receipt))
        decision = guard_resumed_action(
            self.ledger, receipt, self.intent, self.args, self.authority, None)
        self.assertFalse(decision.admissible)
        with self.assertRaises(StaleApprovalError):
            self.resume(ticket)

    def test_forged_receipt_does_not_bypass_ledger(self):
        ticket = self.issue()
        fake = ApprovalReceipt(ticket.approval_id, ticket.scope, ticket.workflow_id,
                               ticket.checkpoint_id, ticket.revision, 2,
                               ticket.action_sha, "owner", True)
        self.assertFalse(guard_resumed_action(
            self.ledger, fake, self.intent, self.args, self.authority, None).admissible)
        good = self.resume(ticket)
        forged = replace(good, reviewer_id="model")
        self.assertFalse(guard_resumed_action(
            self.ledger, forged, self.intent, self.args, self.authority, None).admissible)

    def test_human_approval_is_not_authority_and_cannot_override_governor(self):
        receipt = self.resume(self.issue())
        denied = replace(self.authority, state="denied")
        stale = replace(self.authority, checked_tick=1)
        for authority in (None, denied, stale):
            self.assertFalse(guard_resumed_action(
                self.ledger, receipt, self.intent, self.args, authority, None).admissible)
        self.assertFalse(guard_resumed_action(
            self.ledger, receipt, self.intent, self.args, self.authority,
            RegimeAssessment("shift", ("denied_action",), ())).admissible)
        self.assertFalse(guard_resumed_action(
            self.ledger, receipt, self.intent, self.args, self.authority, None,
            commit_state="ambiguous").admissible)
        self.assertFalse(guard_resumed_action(
            self.ledger, receipt, replace(self.intent, cash_needed=200),
            self.args, self.authority, None).admissible)

    def test_execution_context_cannot_drift_after_approval(self):
        receipt = self.resume(self.issue())
        advanced = replace(self.intent, tick=3)
        self.assertFalse(guard_resumed_action(
            self.ledger, receipt, advanced, self.args,
            replace(self.authority, checked_tick=3), None).admissible)
        self.assertFalse(guard_resumed_action(
            self.ledger, receipt, self.intent, {"invoice_id": "INV-1", "amount": 100},
            self.authority, None).admissible)

    def test_persists_across_restart(self):
        ticket = self.issue()
        reopened = StrictApprovalLedger(
            self.path, reviewer_authorizer=lambda who, _: who == "owner")
        receipt = reopened.resume(
            {ticket.approval_id: "approve"}, self.ctx, self.intent, self.args)
        self.assertTrue(self.ledger.verify_receipt(receipt))
        with self.assertRaises(StaleApprovalError):
            self.resume(ticket)

    def test_concurrent_replay_one_winner(self):
        ticket = self.issue()
        errors, receipts = [], []

        def attempt():
            led = StrictApprovalLedger(self.path,
                reviewer_authorizer=lambda who, _: who == "owner")
            try:
                receipts.append(led.resume(
                    {ticket.approval_id: "approve"}, self.ctx, self.intent, self.args))
            except StaleApprovalError as exc:
                errors.append(str(exc))

        threads = [threading.Thread(target=attempt) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(len(receipts), 1)
        self.assertEqual(len(errors), 1)

    def test_malformed_payload_and_ids_rejected(self):
        with self.assertRaises(ValueError):
            self.ledger.issue(self.intent, {"nan": float("nan")}, workflow_id="wf1",
                              interrupt_key="i", checkpoint_id="cp-2",
                              issued_tick=2, expires_tick=4)
        with self.assertRaises(ValueError):
            self.ledger.issue(self.intent, self.args, workflow_id="wf1",
                              interrupt_key="../bad", checkpoint_id="cp-2",
                              issued_tick=2, expires_tick=4)
        with self.assertRaises(ValueError):
            self.ledger.issue(self.intent, self.args, workflow_id="wf1",
                              interrupt_key="i", checkpoint_id="cp-2",
                              issued_tick=3, expires_tick=4)


if __name__ == "__main__":
    unittest.main()
