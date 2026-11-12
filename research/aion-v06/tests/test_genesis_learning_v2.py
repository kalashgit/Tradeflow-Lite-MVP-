"""GML v2 research checks: class support, held-out guard, causal probes, ledger."""

from dataclasses import replace
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from aion_genesis.gml import factory, laboratory
from aion_genesis.gml.contracts import leaked_keys
from aion_genesis.gml.learning_v2 import (
    GenerationLedger, collect_training_probes, combine_training_evidence,
    coverage_report, development_probe_report, training_focus,
)


def demo_scenarios(start=100, count=4):
    return laboratory.scenarios(
        "train", count, start=start, families=("working_capital",))


def metrics(success, utility=100, denied=0, compute=100, transfer=0):
    return {"task_success_rate": success, "utility": utility,
            "denied_actions": denied, "compute_units": compute,
            "negative_transfer_rate": transfer}


class CoverageTests(unittest.TestCase):
    def test_one_class_target_is_not_claimed_to_be_learnable(self):
        scenarios = demo_scenarios()
        rows = factory.build_transition_dataset(
            factory.collect_transitions(scenarios))["examples"]
        report = coverage_report(rows, min_per_class=4)
        self.assertEqual(report["schema"], "GenesisLearningCoverage/2")
        self.assertEqual(report["label_heads"]["denied"]["positive"], 0)
        self.assertEqual(report["label_heads"]["denied"]["status"],
                         "ONE_CLASS_OR_UNOBSERVED")
        self.assertFalse(report["protected_holdout_used"])

    def test_explicit_holdout_disallowed_and_censored_not_negative(self):
        rows = [{"scenario_id": "GML-train-1", "partition": "train",
                 "input": {"global_truth": False}, "action": "wait",
                 "family": "working_capital", "label": {"denied": 0}}]
        result = coverage_report(rows, min_per_class=1)
        self.assertEqual(result["label_heads"]["job_paid"]["missing"], 1)
        self.assertEqual(result["label_heads"]["job_paid"]["negative"], 0)
        for bad in ({**rows[0], "partition": "protected_test"},
                    {**rows[0], "scenario_id": "GML-protected_test-1"}):
            with self.assertRaises(PermissionError):
                coverage_report([bad])
        with self.assertRaises(ValueError):
            coverage_report([{**rows[0], "label": {"denied": -1}}])

    def test_hidden_oracle_rejected_from_candidate_features(self):
        row = {"scenario_id": "GML-train-1", "input": {"oracle": True},
               "action": "order_material", "label": {"denied": 1}}
        with self.assertRaisesRegex(ValueError, "Hidden"):
            coverage_report([row])
        with self.assertRaises(ValueError):
            coverage_report([], min_per_class=0)

    def test_research_plan_targets_unsupported_head_without_promoting_it(self):
        rows = [{"scenario_id": "GML-train-1", "partition": "train",
                 "input": {"global_truth": False}, "action": "order_material",
                 "family": "working_capital", "label": {"denied": 0}}]
        plan = training_focus(coverage_report(rows, min_per_class=4),
                              batch_budget=6)
        targets = {p["target"]: p for p in plan}
        self.assertEqual(targets["denied"]["mechanism"],
                         "paired_permission_revocation")
        self.assertEqual(targets["denied"]["missing_positive"], 4)
        self.assertEqual(targets["delivered_within_4"]["mechanism"],
                         "paired_supplier_delivery_delay")
        self.assertIn("no protected", targets["denied"]["protection"])

    def test_same_visible_input_can_represent_different_verified_outcomes(self):
        rows = [
            {"scenario_id": "GML-train-1", "input": {"global_truth": False},
             "action": "order_material", "label": {"denied": 0},
             "source_ref": "committed"},
            {"scenario_id": "GML-train-1", "input": {"global_truth": False},
             "action": "order_material", "label": {"denied": 1},
             "source_ref": "revoked"},
        ]
        combined = combine_training_evidence(rows, rows[:1])
        self.assertEqual(len(combined), 2)
        report = coverage_report(combined, min_per_class=1)
        self.assertEqual(report["same_visible_decision_different_verified_outcomes"],
                         1)
        self.assertEqual(report["label_heads"]["denied"]["positive"], 1)
        self.assertEqual(report["label_heads"]["denied"]["negative"], 1)


class CounterfactualProbeTests(unittest.TestCase):
    def test_probes_use_real_world_step_receipts_and_keep_labels_hidden(self):
        cases = demo_scenarios(count=2)
        rows = collect_training_probes(cases)
        self.assertEqual(len(rows), 8)
        deny = [r for r in rows if "permission_" in r["verification"]["mechanism"]]
        delivery = [r for r in rows if "delivery_" in r["verification"]["mechanism"]]
        self.assertEqual(sum(r["label"]["denied"] for r in deny), 2)
        self.assertEqual(sum(r["label"]["denied"] for r in delivery), 0)
        self.assertEqual(
            {r["verification"]["status"] for r in deny},
            {"committed", "authority_revoked"})
        self.assertEqual(
            {r["label"]["delivered_within_4"] for r in delivery}, {0, 1})
        for row in rows:
            self.assertEqual(leaked_keys(row["input"]), [])
            self.assertEqual(row["partition"], "train")
            self.assertTrue(row["scenario_id"].startswith("GML-train-"))
            self.assertEqual(row["action"], "order_material")
            self.assertEqual(len(row["source_ref"]), 24)

    def test_paired_delivery_probes_share_legal_observation(self):
        rows = collect_training_probes(demo_scenarios(count=1))
        control, late = [r for r in rows
                         if "delivery_" in r["verification"]["mechanism"]]
        self.assertEqual(control["input"], late["input"])
        self.assertEqual(control["action"], late["action"])
        self.assertNotEqual(control["label"]["delivered_within_4"],
                            late["label"]["delivered_within_4"])
        combined = combine_training_evidence([], rows)
        self.assertEqual(len(combined), 4)
        report = coverage_report(combined, min_per_class=1)
        self.assertGreaterEqual(
            report["same_visible_decision_different_verified_outcomes"], 1)

    def test_actual_stale_permission_is_rejected_in_simulation(self):
        controls = collect_training_probes(demo_scenarios(count=1))
        states = {r["verification"]["mechanism"]: r["label"]["denied"]
                  for r in controls}
        self.assertEqual(states["permission_control"], 0)
        self.assertEqual(states["permission_revoked"], 1)

    def test_protected_or_validation_world_cannot_enter_training(self):
        case = demo_scenarios(count=1)[0]
        with self.assertRaises(PermissionError):
            collect_training_probes([replace(case, partition="protected_test")])
        with self.assertRaises(PermissionError):
            collect_training_probes([replace(case, partition="public_validation")])
        with self.assertRaises(ValueError):
            collect_training_probes([case], max_cases=0)

    def test_diagnostics_shows_new_supported_denial_and_delivery_labels(self):
        scenarios = demo_scenarios(count=4)
        original = factory.build_transition_dataset(
            factory.collect_transitions(scenarios))["examples"]
        report = development_probe_report(
            scenarios, original, max_cases=4, min_per_class=2)
        self.assertEqual(report["probes"], 16)
        self.assertEqual(report["before"]["label_heads"]["denied"]["positive"], 0)
        self.assertGreaterEqual(report["after"]["label_heads"]["denied"]["positive"], 4)
        self.assertGreaterEqual(report["after"]["label_heads"]
                                ["delivered_within_4"]["positive"], 4)
        self.assertGreaterEqual(report["after"]["label_heads"]
                                ["delivered_within_4"]["negative"], 4)
        self.assertIn("not predictive accuracy", report["warning"])


class GenerationLedgerTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / "ledger.sqlite3"
        self.ledger = GenerationLedger(self.path)

    def make_generation(self, parent=None, suffix="A"):
        return self.ledger.register_generation(
            parent=parent, source_sha="source123456789" + suffix,
            model_sha="model123456789" + suffix,
            dataset_sha="dataset123456789" + suffix,
            memory_sha="memory123456789" + suffix,
            curriculum_sha="curriculum123456789" + suffix,
            architecture_sha="architecture123456789" + suffix)

    def test_lineage_immutable_and_reconstructable_after_restart(self):
        parent = self.make_generation()
        child = self.make_generation(parent, "B")
        with self.assertRaises(ValueError):
            self.make_generation()
        self.assertTrue(self.ledger.verify()["valid"])
        self.assertEqual(self.ledger.verify()["events"], 2)
        self.assertEqual(GenerationLedger(self.path).verify()["events"], 2)
        self.assertNotEqual(parent, child)
        with self.assertRaises(ValueError):
            self.ledger.register_generation(
                parent="nonexistent", source_sha="0123456789ab",
                model_sha="0123456789ab", dataset_sha="0123456789ab",
                memory_sha="0123456789ab", curriculum_sha="0123456789ab",
                architecture_sha="0123456789ab")

    def test_matched_generation_comparison_preserves_separate_metrics(self):
        parent = self.make_generation()
        child = self.make_generation(parent, "B")
        self.ledger.record_evaluation(
            generation_id=parent, cohort_sha="cohort:1", evaluator_sha="eval:v1",
            split="development", metrics=metrics(.50, utility=10, compute=100))
        self.ledger.record_evaluation(
            generation_id=child, cohort_sha="cohort:1", evaluator_sha="eval:v1",
            split="development", metrics=metrics(.70, utility=20, compute=80,
                                                denied=0, transfer=.10))
        comparison = self.ledger.compare(
            parent, child, cohort_sha="cohort:1", evaluator_sha="eval:v1")
        self.assertEqual(comparison["delta_success"], 0.2)
        self.assertEqual(comparison["delta_utility"], 10)
        self.assertEqual(comparison["delta_compute"], -20)
        self.assertEqual(comparison["delta_negative_transfer"], 0.1)
        self.assertFalse(comparison["automatic_promotion"])

    def test_cross_cohort_or_different_evaluator_cannot_fake_progress(self):
        parent = self.make_generation()
        child = self.make_generation(parent, "B")
        for generation, cohort in ((parent, "cohort:a"), (child, "cohort:b")):
            self.ledger.record_evaluation(
                generation_id=generation, cohort_sha=cohort,
                evaluator_sha="fixed:1", split="development",
                metrics=metrics(0.7))
        with self.assertRaisesRegex(ValueError, "Matched"):
            self.ledger.compare(parent, child, cohort_sha="cohort:a",
                                evaluator_sha="fixed:1")
        with self.assertRaisesRegex(ValueError, "Matched"):
            self.ledger.compare(parent, child, cohort_sha="cohort:a",
                                evaluator_sha="wrong:evaluator")

    def test_tampered_history_is_detected(self):
        self.make_generation()
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE generation_events SET payload='{}' WHERE seq=1")
        with self.assertRaisesRegex(ValueError, "corrupted"):
            self.ledger.verify()

    def test_broken_evaluation_metrics_and_missing_generation_rejected(self):
        with self.assertRaises(ValueError):
            self.ledger.record_evaluation(
                generation_id="unknown", cohort_sha="cohort",
                evaluator_sha="eval", split="development", metrics=metrics(0.1))
        parent = self.make_generation()
        for values in (
            metrics(1.1), metrics(0.2, denied=-1),
            {"task_success_rate": 0.2},
        ):
            with self.assertRaises(ValueError):
                self.ledger.record_evaluation(
                    generation_id=parent, cohort_sha="cohort",
                    evaluator_sha="eval", split="development", metrics=values)
        self.assertTrue(self.ledger.verify()["valid"])


if __name__ == "__main__":
    unittest.main()
