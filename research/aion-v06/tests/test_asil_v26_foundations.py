"""ASIL v2.6 safety contracts, independent of the frozen v2.5 evaluator."""

from dataclasses import replace
import unittest

from aion_genesis.asil_v26.forensics import trace_known_v25_denials
from aion_genesis.asil_v26 import (
    ActionIntent, AuthorityEvidence, OutcomeAttributionLedger, RegimeEvent,
    RegimeShiftDetector, RiskGovernor,
)


class RegimeSignals(unittest.TestCase):
    def test_no_signal_is_not_permission(self):
        detector = RegimeShiftDetector("SYN-A")
        self.assertEqual(detector.assess(10).state, "normal")
        self.assertEqual(detector.assess(10).source_refs, ())

    def test_recent_denial_vetoes_fast_path(self):
        detector = RegimeShiftDetector("SYN-A")
        detector.observe(RegimeEvent("SYN-A", "denied_action", 7, 7, "receipt-7"))
        self.assertEqual(detector.assess(9).state, "shift")
        self.assertEqual(detector.assess(13).state, "normal")

    def test_lag_and_independent_weak_signals(self):
        detector = RegimeShiftDetector("SYN-A")
        detector.observe(RegimeEvent("SYN-A", "surprise", 2, 2, "event-a"))
        self.assertEqual(detector.assess(3).state, "normal")
        detector.observe(RegimeEvent("SYN-A", "vendor_anomaly", 3, 4, "event-b"))
        self.assertEqual(detector.assess(4).state, "suspected")
        detector.observe(RegimeEvent("SYN-A", "approval_delay", 1, 6, "event-c"))
        self.assertIn("late_evidence", detector.assess(6).reasons)

    def test_future_observation_ignored_and_cross_scope_rejected(self):
        detector = RegimeShiftDetector("SYN-A")
        event = RegimeEvent("SYN-A", "contradiction", 4, 8, "event-a")
        detector.observe(event)
        self.assertEqual(detector.assess(7).state, "normal")
        with self.assertRaises(PermissionError):
            detector.observe(replace(event, scope="SYN-B", source_ref="event-b"))
        with self.assertRaises(ValueError):
            detector.observe(event)

    def test_reject_invalid_or_unverifiable_event(self):
        with self.assertRaises(ValueError):
            RegimeEvent("SYN-A", "predicted_secret_shock", 1, 1, "a")
        with self.assertRaises(ValueError):
            RegimeEvent("SYN-A", "surprise", 8, 7, "a")


class AuthorizationGuards(unittest.TestCase):
    def setUp(self):
        self.intent = ActionIntent("SYN-A", "owner", "job1", "assign_crew",
                                   7, 3, 500, 200, 1, 1, "fast")
        self.grant = AuthorityEvidence("SYN-A", "owner", "job1", "assign_crew",
                                       3, 7, "granted", "authority-7")
        self.governor = RiskGovernor()

    def test_requires_current_authoritative_scope_and_revision(self):
        for authority, expected in (
            (None, "authoritative_grant_missing"),
            (replace(self.grant, state="unknown"), "authority_not_granted"),
            (replace(self.grant, state="denied"), "authority_not_granted"),
            (replace(self.grant, checked_tick=6), "authority_stale_or_changed"),
            (replace(self.grant, revision=2), "authority_stale_or_changed"),
            (replace(self.grant, scope="SYN-B"), "authority_scope_mismatch"),
            (replace(self.grant, subject="job2"), "authority_scope_mismatch"),
            (replace(self.grant, actor="other"), "authority_scope_mismatch"),
            (replace(self.grant, capability="order_material"), "authority_scope_mismatch"),
        ):
            with self.subTest(reason=expected, authority=authority):
                decision = self.governor.assess(self.intent, authority, None)
                self.assertFalse(decision.admissible)
                self.assertEqual(decision.reason, expected)

    def test_cash_crew_and_uncertain_receipt_fail_closed(self):
        self.assertEqual(self.governor.assess(replace(self.intent, cash_available=100),
                             self.grant, None).reason, "insufficient_cash")
        self.assertEqual(self.governor.assess(replace(self.intent, crew_available=0),
                             self.grant, None).reason, "insufficient_crew_capacity")
        self.assertEqual(self.governor.assess(self.intent, self.grant, None,
                             commit_state="indeterminate").reason,
                         "prior_commit_requires_receipt_reconciliation")

    def test_shift_blocks_fast_but_cannot_override_hard_denial(self):
        detector = RegimeShiftDetector("SYN-A")
        detector.observe(RegimeEvent("SYN-A", "denied_action", 7, 7, "denied-7"))
        regime = detector.assess(7)
        self.assertEqual(self.governor.assess(self.intent, self.grant, regime).reason,
                         "shift_requires_deep_review")
        deep = replace(self.intent, route="deep")
        self.assertTrue(self.governor.assess(deep, self.grant, regime).admissible)
        self.assertFalse(self.governor.assess(deep, None, regime).admissible)

    def test_granted_recheck_remains_required(self):
        decision = self.governor.assess(self.intent, self.grant, None)
        self.assertTrue(decision.admissible)
        self.assertTrue(decision.requires_atomic_recheck)


class CausalOutcomeLabels(unittest.TestCase):
    def setUp(self):
        self.ledger = OutcomeAttributionLedger("SYN-A")
        self.ledger.expect(scope="SYN-A", decision_id="decision1", subject="job1",
                           action="order_material", intervention_ref="committed-1", tick=2)

    def test_payment_alone_never_trains_memory(self):
        with self.assertRaises(ValueError):
            self.ledger.settle("decision1", scope="SYN-A", state="verified_success",
                               evidence_ref="payment-1", goal_payment=True)
        self.assertEqual(self.ledger.trusted_records(), [])
        self.ledger.settle("decision1", scope="SYN-A", state="censored_pending",
                           evidence_ref="episode-cutoff", goal_payment=False)
        self.assertEqual(self.ledger.trusted_records(), [])
        self.assertEqual(self.ledger.pending_records()[0]["state"], "censored_pending")

    def test_direct_effect_with_separate_evidence_can_be_trusted(self):
        with self.assertRaises(ValueError):
            self.ledger.settle("decision1", scope="SYN-A", state="verified_success",
                               evidence_ref="committed-1", independently_verified=True)
        self.ledger.settle("decision1", scope="SYN-A", state="verified_success",
                           evidence_ref="delivery-3", independently_verified=True,
                           goal_payment=False)
        self.assertEqual(self.ledger.trusted_records()[0]["action_effect_ref"],
                         "delivery-3")
        self.assertFalse(self.ledger.trusted_records()[0]["goal_payment"])

    def test_trusted_failure_requires_action_specific_evidence(self):
        self.ledger.settle("decision1", scope="SYN-A", state="verified_failure",
                           evidence_ref="independent-nonarrival", independently_verified=True)
        self.assertEqual(self.ledger.trusted_records()[0]["state"], "verified_failure")

    def test_no_duplicate_interventions_or_relabelling(self):
        with self.assertRaises(ValueError):
            self.ledger.expect(scope="SYN-A", decision_id="decision1", subject="job1",
                               action="order_material", intervention_ref="committed-1", tick=2)
        self.ledger.settle("decision1", scope="SYN-A", state="unknown",
                           evidence_ref="not-observed")
        with self.assertRaises(ValueError):
            self.ledger.settle("decision1", scope="SYN-A", state="verified_failure",
                               evidence_ref="later-proof", independently_verified=True)

    def test_hash_chain_detects_tampering(self):
        snapshot = self.ledger.snapshot()
        self.assertTrue(OutcomeAttributionLedger.verify(snapshot))
        snapshot["events"][0]["subject"] = "other-job"
        self.assertFalse(OutcomeAttributionLedger.verify(snapshot))

    def test_cross_scope_actions_and_outcomes_rejected(self):
        with self.assertRaises(PermissionError):
            self.ledger.expect(scope="SYN-B", decision_id="decision2", subject="job2",
                               action="assign_crew", intervention_ref="receipt-2", tick=3)
        with self.assertRaises(PermissionError):
            self.ledger.settle("decision1", scope="SYN-B", state="unknown",
                               evidence_ref="no-observation")
        self.assertEqual(len(self.ledger.events), 1)


class InspectedReferenceForensics(unittest.TestCase):
    def test_reproduce_denials_without_calling_hidden_world_truth(self):
        evidence = trace_known_v25_denials()
        self.assertEqual(evidence["cohort_size"], 30)
        self.assertEqual(len(evidence["denied"]), 13)
        self.assertEqual(evidence["route_denials"], {"deep": 8, "fast": 5})
        self.assertEqual({d["status"] for d in evidence["denied"]},
                         {"authority_revoked"})
        self.assertEqual({d["tick"] for d in evidence["denied"]}, {7})
        self.assertEqual({d["public_authority_status"] for d in evidence["denied"]},
                         {"unknown"})
        self.assertFalse(evidence["promotion_authorized"])


if __name__ == "__main__":
    unittest.main()
