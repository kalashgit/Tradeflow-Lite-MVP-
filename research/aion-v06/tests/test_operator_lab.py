import os
import tempfile
import unittest

from aion_genesis.operator_lab import (
    DEMO_EVENTS, OperatorLedger, Signal, detect_findings,
)


class OperatorLabTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = os.path.join(self.temp.name, "operator.sqlite3")
        self.ledger = OperatorLedger(self.database)

    def tearDown(self):
        self.ledger.close()
        self.temp.cleanup()

    def test_combines_relevant_signals_without_alert_spam(self):
        findings, suppressed = detect_findings(list(DEMO_EVENTS))
        self.assertEqual(len(findings), 3)
        self.assertEqual(suppressed, 0)
        combined = next(f for f in findings if f.action == "review_dependency_plan")
        self.assertEqual(set(combined.evidence_ids), {"SYN-E1", "SYN-E2"})
        self.assertEqual(combined.priority, "critical")
        self.assertFalse(any(f.action == "contact_supplier" for f in findings))

    def test_persists_recommendations_across_phone_off_restart(self):
        for event in DEMO_EVENTS:
            self.assertTrue(self.ledger.ingest(event))
        self.assertEqual(self.ledger.watch()["new_proposals"], 3)
        self.ledger.close()
        self.ledger = OperatorLedger(self.database)
        self.assertEqual(self.ledger.watch()["new_proposals"], 0)
        self.assertEqual(len(self.ledger.inbox()), 3)

    def test_approval_required_and_execution_is_simulated_only(self):
        for event in DEMO_EVENTS:
            self.ledger.ingest(event)
        self.ledger.watch()
        identifier = self.ledger.inbox()[0]["recommendation_id"]
        self.assertFalse(self.ledger.execute_simulated(identifier))
        with self.assertRaises(ValueError):
            self.ledger.decide(identifier, True, " ")
        self.assertTrue(self.ledger.decide(identifier, True, "synthetic-owner"))
        self.assertFalse(self.ledger.decide(identifier, False, "other-owner"))
        self.assertTrue(self.ledger.execute_simulated(identifier))
        self.assertFalse(self.ledger.execute_simulated(identifier))
        self.assertEqual(len(self.ledger.inbox("executed_simulated")), 1)
        self.assertEqual(self.ledger.db.execute(
            "SELECT result FROM simulated_executions WHERE recommendation_id = ?",
            (identifier,),
        ).fetchone()[0], "SIMULATION_ONLY_NO_EXTERNAL_SIDE_EFFECT")

    def test_new_observation_supersedes_pending_and_approved_stale_cards(self):
        self.ledger.ingest(Signal("old-permit", 1, "SYN-X", "permit_days_left", 1))
        self.ledger.watch()
        identifier = self.ledger.inbox()[0]["recommendation_id"]
        self.assertTrue(self.ledger.decide(identifier, True, "owner"))
        self.ledger.ingest(Signal("fixed-permit", 2, "SYN-X", "permit_days_left", 60))
        # Even without a separate background watch tick, execution rechecks.
        self.assertFalse(self.ledger.execute_simulated(identifier))
        self.assertEqual(self.ledger.watch()["attention_cards"], 0)
        self.assertEqual(self.ledger.inbox("superseded")[0]["recommendation_id"], identifier)

    def test_hidden_attention_overflow_preserves_all_pending_work(self):
        for i in range(8):
            self.ledger.ingest(Signal(f"event-{i}", i, f"SYN-{i}",
                                      "permit_days_left", 1))
        snapshot = self.ledger.watch(max_cards=3)
        self.assertEqual(snapshot["attention_cards"], 3)
        self.assertEqual(snapshot["additional_findings_not_presented"], 5)
        self.assertEqual(snapshot["new_proposals"], 8)
        self.assertEqual(len(self.ledger.inbox()), 8)

    def test_duplicate_event_is_idempotent_and_conflicts_fail(self):
        self.assertTrue(self.ledger.ingest(DEMO_EVENTS[0]))
        self.assertFalse(self.ledger.ingest(DEMO_EVENTS[0]))
        with self.assertRaises(ValueError):
            self.ledger.ingest(Signal("SYN-E1", 0, "SYN-PROJECT-1", "material_slip_days", 9))


if __name__ == "__main__":
    unittest.main()
