"""Review fabric regressions: never misrepresent scorecards as real progress."""

from copy import deepcopy
from pathlib import Path
import unittest

from aion_genesis.lab.ledger import logical_digest
from aion_genesis.lab.protocol import load_config
from aion_genesis.lab.review_fabric import (
    SCHEMA, UNMEASURED_CAPABILITIES, build_review, render_markdown,
)
from aion_genesis.lab.runner import run_experiment


CONFIG = (Path(__file__).resolve().parents[1] /
          "aion_genesis/lab/configs/genesis_v124_domain_general_eval.json")


class EvaluationReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cfg = deepcopy(load_config(CONFIG))
        # A tiny, disjoint complete run: no holdout and no changes to grader.
        cfg["partitions"]["dev"]["episodes"] = 1
        cfg["partitions"]["validation"]["episodes"] = 1
        cls.result, cls.ledger = run_experiment(cfg, ("dev", "validation"))
        cls.validation = {"valid": True, "reproduced": True}

    def test_report_matches_independent_scorecard_and_never_claims_promotion(self):
        report = build_review(self.result, self.ledger.records, self.validation)
        self.assertEqual(report["schema"], SCHEMA)
        self.assertEqual(report["promotion"], "never_auto_promote")
        self.assertEqual(report["partitions_checked"], ["dev", "validation"])
        self.assertTrue(report["protected_holdout_not_examined"])
        self.assertFalse(report["coverage"]["real_world_quality_claim"])
        self.assertEqual(report["result_digest"], logical_digest(self.ledger.records))
        self.assertIn("live_tool_selection", UNMEASURED_CAPABILITIES)
        for part in ("dev", "validation"):
            for family in self.result["config"]["families"]:
                for variant in self.result["config"]["variants"]:
                    summary = report["matrix"][part][family][variant]
                    independent = self.result["partitions"][part]["scorecard"][
                        "decision_quality"][family][variant]
                    for role in ("candidate", "baseline", "memory_off"):
                        policy = {"candidate": self.result["config"]["candidate"],
                                  "baseline": self.result["config"]["baseline"],
                                  "memory_off": self.result["config"][
                                      "memory_off_control"]}[role]
                        expected = independent[policy]["harmful_choice"]
                        observed = summary[role]["harmful_vs_no_action"]
                        if expected.get("status") == "not_measured":
                            self.assertEqual(observed["denominator"], 0)
                            self.assertIsNone(summary[
                                "harm_rate_change_candidate_minus_baseline"])
                        else:
                            self.assertEqual(observed["numerator"], expected["numerator"])
                            self.assertEqual(observed["denominator"], expected["denominator"])
                    self.assertEqual(summary["paired_episodes"], 1)
                    self.assertEqual(summary["action_divergence_vs_baseline"][
                        "denominator"], summary["paired_decisions"])
        doc = render_markdown(report)
        self.assertIn("Capabilities not measured", doc)
        self.assertIn("Protected holdout", doc)

    def test_fails_closed_on_invalid_replay(self):
        for validation in ({"valid": True, "reproduced": False},
                           {"valid": False, "reproduced": True}, {}):
            with self.assertRaisesRegex(ValueError, "validated"):
                build_review(self.result, self.ledger.records, validation)

    def test_fails_closed_if_any_holdout_result_is_present(self):
        changed = deepcopy(self.result)
        changed["partitions"]["holdout"] = changed["partitions"]["validation"]
        with self.assertRaisesRegex(ValueError, "holdout"):
            build_review(changed, self.ledger.records, self.validation)

    def test_fails_closed_if_result_and_ledger_differ(self):
        changed = deepcopy(self.result)
        changed["logical_digest"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "agree"):
            build_review(changed, self.ledger.records, self.validation)

    def test_fails_closed_if_matched_group_is_not_complete(self):
        changed = deepcopy(self.ledger.records)
        # Missing even one policy decision invalidates pairing before review.
        changed = [r for r in changed if not (
            r["event"].get("type") == "decision"
            and r["event"].get("policy") == self.result["config"]["candidate"]
            and r["event"].get("partition") == "dev"
            and r["event"].get("family") == "resource_allocation"
            and r["event"].get("step") == 1)]
        with self.assertRaises(ValueError):
            build_review(self.result, changed, self.validation)


if __name__ == "__main__":
    unittest.main()
