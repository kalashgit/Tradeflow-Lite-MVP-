"""Regression and independence checks for judge-side memory-effect diagnostics."""

from pathlib import Path
from types import SimpleNamespace
import unittest

from aion_genesis.lab.hidden import make_world
from aion_genesis.lab.memory_effects import (
    BUDGETS, COHORTS, POLICIES, SCHEMA, TracedRuntimePolicy,
    build_report, proposal_effect_snapshot,
)
from aion_genesis.lab.policies import RuntimePolicy
from aion_genesis.lab.referee import hindsight_oracle, run_episode


class MemorySnapshotTests(unittest.TestCase):
    def test_public_scoring_distinguishes_any_correction_from_ranking_flip(self):
        profile = SimpleNamespace(
            goal_weights={"uptime": 5}, max_spend=100, uncertainty_aversion=0.0)
        def option(identifier, raw, corrected):
            return {"identifier": identifier, "decisions": [["slot", identifier]],
                    "expected_effects": {"uptime": corrected},
                    "raw_expected_effects": {"uptime": raw},
                    "uncertainty": {"uptime": 0.0}, "estimated_spend": 10,
                    "evidence_ids": ["EV-1"]}
        proposal = SimpleNamespace(
            memory={"mode": "on", "effect_model_version": 2}, abstained=False,
            candidate_options=[option("alpha", 10, 10),
                               option("beta", 5, 20)],
            selected_option={"identifier": "beta"}, known_unknowns=())
        trace = proposal_effect_snapshot(proposal, profile, [
            {"subject_id": "unit_a", "metric": "wear_index", "value": 83},
            {"subject_id": "CREW", "metric": "spare_kits", "value": 0},
            {"subject_id": "CREW", "metric": "technician_hours", "value": 4}])
        self.assertEqual(trace["raw_score_leader"], "alpha")
        self.assertEqual(trace["corrected_score_leader"], "beta")
        self.assertTrue(trace["ranking_flip"])
        self.assertTrue(trace["memory_applied"])
        self.assertTrue(trace["memory_available"])
        self.assertEqual(trace["adjusted_options"], 1)
        self.assertEqual(trace["public_context"]["max_wear_index"], 83)
        self.assertEqual(trace["public_context"]["spare_kits"], 0)
        self.assertEqual(trace["public_context"]["technician_hours"], 4)

    def test_missing_proposals_are_explicitly_non_instrumented(self):
        empty = proposal_effect_snapshot(None, None, ())
        self.assertFalse(empty["has_proposal"])
        self.assertFalse(empty["memory_available"])
        self.assertFalse(empty["ranking_flip"])


class MemoryDiagnosisTests(unittest.TestCase):
    def test_observing_runtime_does_not_change_decisions_or_referee_values(self):
        world = make_world("resource_allocation", 270012, "shifted")
        oracle = hindsight_oracle(world)
        plain, _ = run_episode(world, RuntimePolicy("aion_v1_memory", BUDGETS),
                               "dev", oracle)
        observer = TracedRuntimePolicy("aion_v1_memory", BUDGETS)
        traced, _ = run_episode(world, observer, "dev", oracle)
        self.assertEqual(len(plain), len(traced))
        self.assertEqual(len(traced), len(observer.snapshots))
        for before, after, snapshot in zip(plain, traced, observer.snapshots):
            for key in ("case_id", "selected", "applied", "harmful", "regret",
                        "realized_value", "prediction_abs_error",
                        "memory_version", "failure_classes"):
                self.assertEqual(before[key], after[key], key)
            self.assertTrue(snapshot["has_proposal"])
            self.assertEqual(snapshot["case_id"], after["case_id"])

    def test_diagnostics_only_accept_predeclared_non_holdout_cohorts(self):
        for args in (("holdout", 290000, 60), ("dev", 270000, 9),
                     ("validation", 220000, 20), ("dev", 8000, 8)):
            with self.assertRaises(ValueError):
                build_report(*args)
        self.assertEqual(COHORTS["dev"], (270000, 8))
        self.assertEqual(COHORTS["validation"], (280000, 16))
        self.assertIn("aion_v12_hybrid", POLICIES)

    def test_dev_report_matches_referee_and_instrumentation_denominators(self):
        report = build_report("dev", *COHORTS["dev"])
        self.assertEqual(report["schema"], SCHEMA)
        self.assertTrue(report["research_only"])
        self.assertFalse(report["protected_holdout_evaluated"])
        self.assertFalse(report["policy_actions_modified_by_instrumentation"])
        self.assertFalse(report["hidden_truth_exposed_to_policy"])
        self.assertEqual(len(report["cases"]), 2 * 8 * 6 * len(POLICIES))
        for variant in ("nominal", "shifted"):
            control = report["comparisons"][f"{variant}/v09_strategist"]
            self.assertEqual(control["decisions"], 48)
            for policy in POLICIES:
                stats = report["comparisons"][f"{variant}/{policy}"]
                self.assertEqual(stats["decisions"], 48)
                self.assertEqual(stats["judged_decisions"], 48)
                self.assertEqual(stats["memory_changed_any_estimate"]["denominator"], 48)
                self.assertEqual(stats["different_actions_than_memory_off"]["denominator"],
                                 48)
                harmful = stats["harmful_choice"]
                self.assertLessEqual(harmful["numerator"], harmful["denominator"])
                self.assertLessEqual(stats["memory_changed_score_leader"]["numerator"],
                                     stats["memory_changed_score_leader"]["denominator"])
                if policy != "v09_strategist":
                    self.assertIn("active_maintenance",
                                  stats["public_condition_harm"])


if __name__ == "__main__":
    unittest.main()
