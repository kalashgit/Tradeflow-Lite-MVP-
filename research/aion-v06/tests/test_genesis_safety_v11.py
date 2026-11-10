"""Prospective per-family research gates; never reuse the examined v1.0 holdout."""

from copy import deepcopy
from pathlib import Path
import unittest

from aion_genesis.lab.promotion import evaluate_gate
from aion_genesis.lab.observatory import render_observatory
from aion_genesis.lab.protocol import load_config, validate_config
from aion_genesis.lab.runner import run_experiment
from aion_genesis.lab.scorecard import proportion


CONFIG = (Path(__file__).resolve().parents[1] / "aion_genesis" / "lab" /
          "configs" / "genesis_v1_1_safety.json")


class ProspectiveSafetyGates(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = load_config(CONFIG)
        # Small dev-only fixtures: validation and holdout remain untouched.
        for partition in cls.config["partitions"].values():
            partition["episodes"] = 2
        result, ledger = run_experiment(cls.config, ("dev",))
        cls.card = result["partitions"]["dev"]["scorecard"]
        cls.result, cls.ledger_records = result, ledger.records

    def statuses(self, card):
        report = evaluate_gate(card, self.config, run_status="completed",
                               protocol_conflict=False)
        return {c["name"]: c for c in report["checks"]}

    def test_opt_in_gate_requires_all_three_limits(self):
        broken = deepcopy(self.config)
        broken["promotion_gate"].pop("max_family_shifted_harm_increase")
        with self.assertRaises(ValueError):
            validate_config(broken)
        for key in ("max_family_shifted_harm_rate",
                    "max_family_shifted_harm_increase",
                    "max_family_shifted_worst_decile_regression"):
            broken = deepcopy(self.config)
            broken["promotion_gate"][key] = True
            with self.assertRaises(ValueError):
                validate_config(broken)

    def test_old_protocol_preserves_old_check_set(self):
        old = load_config()
        report = evaluate_gate(self.card, old, run_status="completed",
                               protocol_conflict=False)
        self.assertNotIn("family_shifted_harm_ceiling",
                         {check["name"] for check in report["checks"]})

    def test_family_ceiling_catches_bad_resource_allocation_despite_pooling(self):
        card = deepcopy(self.card)
        metrics = card["decision_quality"]["resource_allocation"]["shifted"]["aion_v1_memory"]
        metrics["harmful_choice"] = proportion(90, 100)
        checks = self.statuses(card)
        self.assertEqual(checks["family_shifted_harm_ceiling"]["status"], "FAIL")
        self.assertEqual(checks["family_shifted_harm_ceiling"]["observed"][
            "resource_allocation"]["candidate"], 0.9)

    def test_sequential_world_uses_episode_harm_instead_of_missing_counterfactual(self):
        card = deepcopy(self.card)
        metrics = card["decision_quality"]["operational_dependencies"]["shifted"]
        self.assertEqual(metrics["aion_v1_memory"]["harmful_choice"]["status"],
                         "not_measured")
        metrics["aion_v1_memory"]["episode_worse_than_no_action"] = proportion(9, 10)
        checks = self.statuses(card)
        self.assertEqual(checks["family_shifted_harm_ceiling"]["status"], "FAIL")
        self.assertEqual(checks["family_shifted_harm_ceiling"]["observed"][
            "operational_dependencies"]["source"], "episode_worse_than_no_action")

    def test_family_regression_is_visible_even_if_aggregate_passes(self):
        card = deepcopy(self.card)
        metrics = card["decision_quality"]["electrical_procurement"]["shifted"]
        metrics["v09_strategist"]["harmful_choice"] = proportion(10, 100)
        metrics["aion_v1_memory"]["harmful_choice"] = proportion(25, 100)
        check = self.statuses(card)["family_shifted_harm_nonregression"]
        self.assertEqual(check["status"], "FAIL")
        self.assertEqual(check["observed"]["electrical_procurement"]["delta"], 0.15)

    def test_worst_decile_regression_is_a_separate_failure(self):
        card = deepcopy(self.card)
        metrics = card["decision_quality"]["hidden_causal_rules"]["shifted"]
        metrics["v09_strategist"]["worst_decile_mean_delta_vs_no_action"] = -2
        metrics["aion_v1_memory"]["worst_decile_mean_delta_vs_no_action"] = -8
        check = self.statuses(card)["family_shifted_tail_nonregression"]
        self.assertEqual(check["status"], "FAIL")
        self.assertEqual(check["observed"]["hidden_causal_rules"]["additional_loss"], 6)

    def test_observatory_renders_typed_family_checks_without_crashing(self):
        html = render_observatory(self.result, self.ledger_records, [])
        self.assertIn('data-verdict="INCONCLUSIVE"', html)
        self.assertIn("family shifted harm ceiling", html)
        self.assertIn("episode_worse_than_no_action", html)


if __name__ == "__main__":
    unittest.main()
