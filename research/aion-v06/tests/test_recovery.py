import unittest

from aion_genesis.dashboard import render_recovery_dashboard
from aion_genesis.recovery import run_recovery, run_sweep


class RecoveryTests(unittest.TestCase):
    def test_recovers_from_all_four_hidden_triples(self):
        for seed in (0, 1, 2, 3):
            report = run_recovery(seed)
            self.assertTrue(report.correct_rule)
            self.assertIsNotNone(report.detection_delay)
            self.assertIsNotNone(report.recovery_steps)
            self.assertLess(report.adaptive_final_mae, 0.25)
            self.assertGreater(report.baseline_final_mae, 0.5)
            self.assertEqual(report.promotion_step - report.detection_step, 31)

    def test_stable_environment_does_not_cause_false_alarm(self):
        report = run_recovery(seed=42, shift_step=None)
        self.assertFalse(report.false_alarm)
        self.assertIsNone(report.detection_step)
        self.assertIsNone(report.promotion_step)
        self.assertIsNone(report.learned_rule)

    def test_cohort_is_repeatable(self):
        result = run_sweep(start_seed=7, worlds=8)
        self.assertEqual(result, run_sweep(start_seed=7, worlds=8))
        self.assertEqual(result["worlds_shifted"], 8)
        self.assertEqual(result["worlds_stable_controls"], 8)
        self.assertEqual(result["recovery_rate"], 1.0)

    def test_report_contains_standalone_svg_visualization(self):
        page = render_recovery_dashboard(run_recovery(seed=42))
        self.assertIn("<svg", page)
        self.assertIn("Adaptive causal learner", page)
        self.assertIn("RULE SHIFT", page)
        self.assertIn("not a continuously running live feed", page)


if __name__ == "__main__":
    unittest.main()
