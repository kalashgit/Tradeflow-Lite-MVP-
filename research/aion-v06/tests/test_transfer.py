from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from aion_genesis.dashboard import render_transfer_dashboard
from aion_genesis.transfer import (
    NovelRuleWorld, PrincipleMemory, learn_source_principle, probe, run_transfer,
)


class TransferTests(unittest.TestCase):
    def test_unseen_four_way_rule_recovered_after_source_learning(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / "causal_memory.sqlite3"
            report = run_transfer(path, source_worlds=8, target_worlds=8,
                                  negative_control_worlds=4)
            self.assertEqual(report["learned_principle"]["policy"], "toggle_contrast")
            self.assertEqual(report["memory_guided"]["success_rate"], 1.0)
            self.assertEqual(report["cold_general_search"]["success_rate"], 1.0)
            self.assertLess(report["memory_guided"]["median_interventions"],
                            report["cold_general_search"]["median_interventions"])
            self.assertEqual(report["negative_control"]["correct_abstention_rate"], 1.0)
            self.assertTrue(path.exists())
            # Re-running identical research does not silently replace evidence.
            second = run_transfer(path, source_worlds=8, target_worlds=8,
                                  negative_control_worlds=4)
            self.assertEqual(report, second)

    def test_xor_counterexamples_block_false_promotion(self):
        for seed in (201, 202, 203):
            trial = probe(NovelRuleWorld(seed, mechanism="xor"),
                          "toggle_contrast", seed, 3)
            self.assertFalse(trial.promoted)

    def test_memory_requires_validation_and_rejects_conflicts(self):
        with TemporaryDirectory() as folder:
            memory = PrincipleMemory(Path(folder) / "memory.sqlite3")
            try:
                with self.assertRaises(ValueError):
                    memory.save_validated("example", "toggle_contrast", {"gate_passed": False})
                memory.save_validated("example", "toggle_contrast", {"gate_passed": True})
                self.assertEqual(memory.retrieve("example")["policy"], "toggle_contrast")
                with self.assertRaises(ValueError):
                    memory.save_validated("example", "full_factorial", {"gate_passed": True})
            finally:
                memory.close()

    def test_mobile_summary_contains_protocol_and_limits(self):
        with TemporaryDirectory() as folder:
            report = run_transfer(Path(folder) / "memory.sqlite3", source_worlds=4,
                                  target_worlds=4, negative_control_worlds=4)
            html = render_transfer_dashboard(report)
            self.assertIn("META-LEARNING EXPERIMENT", html)
            self.assertIn("Negative-control research gate", html)
            self.assertIn("not an LLM-trained skill", html)


if __name__ == "__main__":
    unittest.main()
