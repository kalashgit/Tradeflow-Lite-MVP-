import unittest

from aion_genesis.dashboard import render_tradeflow_world_dashboard
from aion_genesis.tradeflow_lab import (
    AdaptiveRiskLearner, CostFirst, DriftAwareRiskLearner, StaticRiskRule,
    benchmark_tradeflow_world, run_company,
)
from aion_genesis.worlds.tradeflow import Decision, TradeFlowWorld


class TradeFlowWorldTests(unittest.TestCase):
    def test_synthetic_world_reproducible(self):
        first, second = TradeFlowWorld(9), TradeFlowWorld(9)
        self.assertEqual(first.jobs(), second.jobs())
        for job in first.jobs():
            action = Decision("economy", False)
            self.assertEqual(first.execute(job, action), second.execute(job, action))
        self.assertFalse(first.public_description()["real_business_data"])
        self.assertFalse(first.public_description()["external_side_effects"])

    def test_common_shocks_preserve_intervention_order(self):
        world = TradeFlowWorld(11)
        for job in world.jobs():
            cheap = world.execute(job, Decision("economy", False))
            priority = world.execute(job, Decision("priority", False))
            self.assertFalse(priority.material_delayed and not cheap.material_delayed)
            reserve = world.execute(job, Decision("economy", True))
            self.assertFalse(reserve.crew_delayed and not cheap.crew_delayed)
            self.assertEqual(cheap.net_contribution, cheap.gross_margin - cheap.delay_cost)

    def test_reject_unsupported_real_world_action(self):
        with self.assertRaises(ValueError):
            Decision("send_invoice", False)
        with self.assertRaises(ValueError):
            Decision("priority", "true")

    def test_company_comparison_is_deterministic(self):
        self.assertEqual(run_company(33, AdaptiveRiskLearner()),
                         run_company(33, AdaptiveRiskLearner()))
        results = [run_company(33, factory()) for factory in
                   (CostFirst, StaticRiskRule, DriftAwareRiskLearner)]
        self.assertEqual({r.policy for r in results},
                         {"cost_first", "static_risk_rule", "drift_aware_risk"})

    def test_hidden_shift_detected_without_mass_false_alarms(self):
        report = benchmark_tradeflow_world(start_seed=200, companies=30)
        self.assertGreaterEqual(report["shift_detection"]["drift_detection_rate_after_change"], 0.9)
        self.assertLessEqual(report["shift_detection"]["false_alarms_in_unchanged_worlds"], 3)
        self.assertGreater(report["results"]["drift_aware_risk"]["mean_net_contribution"],
                           report["results"]["cost_first"]["mean_net_contribution"])
        self.assertTrue(report["controls"]["same_underlying_shocks_for_policies"])
        self.assertFalse(report["controls"]["qwen_inference_used"])

    def test_business_dashboard_is_standalone_and_explicitly_synthetic(self):
        html = render_tradeflow_world_dashboard(
            benchmark_tradeflow_world(start_seed=100, companies=4)
        )
        self.assertIn("<html", html)
        self.assertIn("A business that can change", html)
        self.assertIn("No TradeFlow production connection", html)


if __name__ == "__main__":
    unittest.main()
