"""Research-only tests for evidence claims and corrected replay eligibility."""
from dataclasses import replace
import unittest

from aion_genesis.learning_v3 import (
    EvidenceFact, EvidenceGate, Episode, PairedCorrectionGate,
    ConditionalLessonStore,
)


class EvidenceBoundary(unittest.TestCase):
    def setUp(self):
        self.gate = EvidenceGate("synthetic-tenant-a")
        self.fact = EvidenceFact("synthetic-tenant-a", "supplier-stock", "in_stock",
                                 "receipt-1", 1, 3, 8, "host_verified")

    def test_supported_requires_attested_latest_evidence(self):
        self.assertEqual(self.gate.assess("supplier-stock", 3).state, "unknown")
        self.gate.observe(replace(self.fact, trust="reported"))
        self.assertEqual(self.gate.assess("supplier-stock", 4).state, "unverified")

    def test_authoritatively_verified_support_has_freshness_bounds(self):
        self.gate.observe(self.fact)
        self.assertEqual(self.gate.assess("supplier-stock", 4).value, "in_stock")
        self.assertEqual(self.gate.assess("supplier-stock", 9).state, "stale")
        self.assertEqual(self.gate.assess("supplier-stock", 5,
                         authoritative_revision=2).state, "stale")
        self.assertEqual(self.gate.assess("supplier-stock", 2).state, "unknown")

    def test_same_revision_contradictions_are_never_silenced(self):
        self.gate.observe(self.fact)
        self.gate.observe(replace(self.fact, source_ref="receipt-2",
                                 value="out_of_stock"))
        self.assertEqual(self.gate.assess("supplier-stock", 5).state, "conflicted")
        self.assertIsNone(self.gate.assess("supplier-stock", 5).value)

    def test_revision_supersedes_old_conflict(self):
        self.gate.observe(self.fact)
        self.gate.observe(replace(self.fact, source_ref="receipt-2",
                                 value="out_of_stock", revision=2,
                                 observed_tick=4, expires_tick=10))
        newer = self.gate.assess("supplier-stock", 5)
        self.assertEqual((newer.state, newer.value), ("supported", "out_of_stock"))

    def test_scope_and_duplicate_protection(self):
        self.gate.observe(self.fact)
        with self.assertRaises(PermissionError):
            self.gate.observe(replace(self.fact, scope="synthetic-tenant-b",
                                     source_ref="b"))
        with self.assertRaises(ValueError):
            self.gate.observe(self.fact)


class PairedFeedback(unittest.TestCase):
    def setUp(self):
        self.before = Episode("synthetic-tenant-a", "world-v1", "scene-1", "state-1",
                              42, "dev", "trust_supplier_message",
                              "verified_failure", -20, "independent-round-1")
        self.after = replace(self.before, strategy_id="verify_then_reschedule",
                             outcome="verified_success", utility=10,
                             receipt_ref="independent-round-2")

    def test_verified_positive_corrective_replay(self):
        result = PairedCorrectionGate.compare(self.before, self.after)
        self.assertTrue(result.recovered)
        self.assertEqual(result.utility_delta, 30)
        self.assertTrue(result.eligible_for_causal_review)

    def test_scenario_seed_and_scope_are_frozen(self):
        for changes in ({"seed": 43}, {"scope": "synthetic-tenant-b"},
                        {"initial_state_digest": "different"},
                        {"scenario_digest": "different"},
                        {"world_version": "world-v2"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                PairedCorrectionGate.compare(self.before, replace(self.after, **changes))

    def test_unverified_pending_cannot_teach(self):
        result = PairedCorrectionGate.compare(
            self.before, replace(self.after, outcome="censored_pending"))
        self.assertFalse(result.comparable)
        self.assertFalse(result.eligible_for_causal_review)

    def test_denied_or_unauthorized_actions_are_visible(self):
        denied = PairedCorrectionGate.compare(
            self.before, replace(self.after, denied_attempts=1))
        self.assertFalse(denied.safe)
        self.assertEqual(denied.reason, "safety_regression")
        unauthorized = PairedCorrectionGate.compare(
            self.before, replace(self.after, unauthorized_writes=1))
        self.assertFalse(unauthorized.safe)

    def test_no_false_correction_without_strategy_change(self):
        result = PairedCorrectionGate.compare(
            self.before, replace(self.after, strategy_id=self.before.strategy_id))
        self.assertFalse(result.eligible_for_causal_review)
        self.assertEqual(result.reason, "no_strategy_change")

    def test_validation_holdout_may_evaluate_but_never_train(self):
        result = PairedCorrectionGate.compare(
            replace(self.before, split="holdout"),
            replace(self.after, split="holdout"))
        self.assertTrue(result.recovered)
        self.assertFalse(result.eligible_for_causal_review)

    def test_causal_boundaries_and_regime_shift_block_memory(self):
        result = PairedCorrectionGate.compare(self.before, self.after)
        memory = ConditionalLessonStore("synthetic-tenant-a")
        with self.assertRaises(ValueError):
            memory.admit(result, causal_evidence_ref="same",
                         source_receipt_ref="same",
                         required_context=(("supplier", "unreliable"),))
        lesson = memory.admit(
            result, causal_evidence_ref="independent-intervention-3",
            source_receipt_ref=self.after.receipt_ref,
            required_context=(("supplier", "unreliable"),))
        self.assertEqual(memory.retrieve(
            scope="synthetic-tenant-a", world_version="world-v1",
            verified_context={"supplier": "unreliable"}), (lesson,))
        self.assertEqual(memory.retrieve(
            scope="synthetic-tenant-a", world_version="world-v1",
            verified_context={"supplier": "reliable"}), ())
        self.assertEqual(memory.retrieve(
            scope="synthetic-tenant-a", world_version="world-v1",
            verified_context={"supplier": "unreliable"}, regime_shift=True), ())
        with self.assertRaises(PermissionError):
            memory.retrieve(scope="synthetic-tenant-b", world_version="world-v1",
                            verified_context={"supplier": "unreliable"})


if __name__ == "__main__":
    unittest.main()
