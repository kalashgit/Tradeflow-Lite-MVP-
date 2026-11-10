"""Prospective lab v1.2: candidate is independently visible, not promoted."""

from copy import deepcopy
from pathlib import Path
import unittest

from aion_genesis.lab.policies import POLICY_VERSIONS, build_policy
from aion_genesis.lab.protocol import LAB_VERSION, POLICIES, load_config
from aion_genesis.lab.runner import run_experiment
from aion_genesis.runtime.contracts import RESEARCH_MODE


_CONFIG = Path(__file__).resolve().parents[1] / (
    "aion_genesis/lab/configs/genesis_v12_contextual_eval.json")


class ProspectiveCandidateTests(unittest.TestCase):
    def test_registered_policy_is_opt_in_and_old_baselines_stay_present(self):
        self.assertEqual(LAB_VERSION, "genesis-lab-1.2.3")
        self.assertIn("aion_v12_contextual", POLICIES)
        self.assertIn("aion_v12_contextual", POLICY_VERSIONS)
        budgets = {"time_budget_ms": 5000, "compute_budget": 64}
        context = build_policy("aion_v12_contextual", budgets)
        legacy = build_policy("aion_v1_memory", budgets)
        off = build_policy("v09_strategist", budgets)
        self.assertEqual(context.capabilities,
                         ("bounded_search", "contextual_outcome_memory"))
        self.assertEqual(legacy.capabilities, ("bounded_search", "outcome_memory"))
        self.assertEqual(off.capabilities, ("bounded_search",))
        self.assertEqual(RESEARCH_MODE, "synthetic_research")

    def test_matched_experiment_scores_candidate_but_never_runs_holdout(self):
        original = load_config(_CONFIG)
        self.assertEqual(original["baseline"], "aion_v1_memory")
        self.assertEqual(original["memory_off_control"], "v09_strategist")
        self.assertEqual(original["candidate"], "aion_v12_contextual")
        self.assertLess(original["partitions"]["validation"]["start_seed"],
                        original["partitions"]["holdout"]["start_seed"])
        config = deepcopy(original)
        config["partitions"]["dev"]["episodes"] = 2
        result, ledger = run_experiment(config, ("dev",))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(set(result["partitions"]), {"dev"})
        self.assertEqual(result["verdict"], "INCONCLUSIVE")
        self.assertEqual(result["labels"]["model_inference_calls"], 0)
        self.assertEqual(result["labels"]["external_actions"], 0)
        decision_rows = [r["event"] for r in ledger.records if r["event"]["type"] == "decision"]
        observed = set(row["policy"] for row in decision_rows)
        self.assertEqual(observed, set(config["policies"]))
        for family in config["families"]:
            candidate = result["partitions"]["dev"]["scorecard"]["decision_quality"][family]
            for variant in config["variants"]:
                self.assertIn("aion_v12_contextual", candidate[variant])
                self.assertIn("aion_v1_memory", candidate[variant])
                self.assertIn("v09_strategist", candidate[variant])


if __name__ == "__main__":
    unittest.main()
