"""Exact, inexpensive contract tests for GML v2.1 equal-volume replication."""

import unittest

from aion_genesis.gml.learning_v2_replication import (
    ARMS, CHECK_FAMILIES, SCHEMA, volume_matched_control, execute,
)


class ReplicationProtocolTests(unittest.TestCase):
    def setUp(self):
        self.baseline = [
            {"input": {"tick": i}, "action": "wait",
             "scenario_id": "GML-train-" + str(i),
             "label": {"denied": 0}, "source_ref": "s" + str(i)}
            for i in range(5)]

    def test_volume_control_adds_no_new_causal_evidence(self):
        repeated = volume_matched_control(self.baseline, 17, seed=179)
        self.assertEqual(len(repeated), 17)
        self.assertTrue(all(item in self.baseline for item in repeated))
        self.assertEqual(repeated,
                         volume_matched_control(self.baseline, 17, seed=179))
        self.assertEqual(len(volume_matched_control(self.baseline, 5)), 5)

    def test_volume_control_rejects_invalid_budget(self):
        with self.assertRaises(ValueError):
            volume_matched_control([], 2)
        with self.assertRaises(ValueError):
            volume_matched_control(self.baseline, 2)
        with self.assertRaises(ValueError):
            volume_matched_control(self.baseline, 2.5)

    def test_benchmark_protocol_uses_multiple_training_seeds_and_families(self):
        self.assertEqual(SCHEMA, "GenesisLearningReplication/2.1")
        self.assertEqual(ARMS, ("original", "volume_control",
                                "causal_counterexamples"))
        self.assertEqual(len(CHECK_FAMILIES), 4)
        self.assertIn("working_capital", CHECK_FAMILIES)
        self.assertIn("supplier_shock", CHECK_FAMILIES)

    def test_invalid_training_ranges_fail_before_training(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                execute(root, train_scenarios=0)
            with self.assertRaises(ValueError):
                execute(root, check_scenarios=0)
            with self.assertRaises(ValueError):
                execute(root, seeds=(17, 17))
            with self.assertRaises(ValueError):
                execute(root, epochs=0)


if __name__ == "__main__":
    unittest.main()
