"""Unit contracts for the self-directed Genesis Academy research controller.

Everything here is standard-library only; the separately triggered CI job
runs genuine CPU PyTorch training after these offline safety checks pass.
"""

from dataclasses import replace
import tempfile
import unittest

from aion_genesis.gml.autonomous_academy import (
    AcademyBudget, _decision, _failure_profile, _training_cases,
    SCHEMA, RESEARCH_ONLY, FAMILIES,
)


def fake_scores(*, balanced=0.25, raw=0.22, overrides=None):
    overrides = overrides or {}
    score = {}
    for family in ("all", *FAMILIES):
        score[family] = {}
        for head in ("job_paid", "denied", "delivered_within_4"):
            b, r = overrides.get((family, head), (balanced, raw))
            score[family][head] = {
                "n": 10, "positive": 5, "negative": 5,
                "brier": r, "balanced_brier": b,
            }
    return score


def fake_coverage():
    return {"label_heads": {
        head: {"deficit_positive": 0, "deficit_negative": 0}
        for head in ("job_paid", "denied", "delivered_within_4")}}


class AcademyBudgetTests(unittest.TestCase):
    def test_default_budget_is_finite_and_self_consistent(self):
        b = AcademyBudget()
        self.assertLessEqual(b.seed_cases + b.rounds * b.batch_cases,
                             b.max_total_scenarios)
        self.assertLessEqual(b.rounds, 5)
        self.assertLessEqual(b.max_wall_seconds, 1800)
        self.assertTrue(SCHEMA.startswith("GenesisAutonomousAcademy/"))

    def test_overspending_rejected(self):
        for field, val in (("rounds", 10), ("rounds", 0),
                           ("batch_cases", 100), ("max_wall_seconds", 10000),
                           ("max_training_steps", 9000),
                           ("seed_cases", -1), ("seed", -1),
                           ("min_brier_gain", float("nan")),
                           ("max_head_regression", -1)):
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    AcademyBudget(**{**AcademyBudget().__dict__, field: val})

    def test_integer_budget_cannot_be_boolean(self):
        with self.assertRaises(ValueError):
            AcademyBudget(rounds=True)

    def test_insufficient_total_scenario_budget_refused(self):
        with self.assertRaises(ValueError):
            AcademyBudget(rounds=3, batch_cases=16, seed_cases=16,
                          max_total_scenarios=48)

    def test_training_cases_require_dev_partition(self):
        cases = _training_cases(2, start=1800, family="working_capital")
        self.assertEqual(len(cases), 2)
        for case in cases:
            self.assertEqual(case.partition, "train")
            self.assertEqual(case.case.split, "dev")


class AcademyDecisionTests(unittest.TestCase):
    def test_clear_development_improvement_can_be_selected_but_not_promoted(self):
        original = fake_scores()
        new = fake_scores(balanced=0.20, raw=0.18)
        result = _decision(original, new, AcademyBudget())
        self.assertTrue(result["keep"])
        self.assertTrue(result["research_only"])
        self.assertFalse(result["independent_evaluation"])
        self.assertGreater(result["mean_balanced_brier_gain"], 0)

    def test_small_gain_is_inconclusive_and_does_not_replace_best(self):
        original, new = fake_scores(), fake_scores(balanced=0.2495, raw=0.2195)
        result = _decision(original, new, AcademyBudget())
        self.assertFalse(result["keep"])
        self.assertIn("insufficient", result["reason"])

    def test_any_large_head_regression_vetoes_gain(self):
        original = fake_scores()
        new = fake_scores(balanced=0.1, raw=0.1,
                          overrides={("all", "denied"): (0.30, 0.11)})
        result = _decision(original, new, AcademyBudget())
        self.assertFalse(result["keep"])
        self.assertGreater(result["head_deltas"]["denied"], 0.02)

    def test_family_regression_vetoes_apparent_global_gain(self):
        original = fake_scores()
        new = fake_scores(balanced=0.18, raw=0.18,
                          overrides={("supplier_shock", "job_paid"): (0.3, 0.40),
                                     ("supplier_shock", "denied"): (0.3, 0.40),
                                     ("supplier_shock", "delivered_within_4"):
                                     (0.3, 0.40)})
        result = _decision(original, new, AcademyBudget())
        self.assertFalse(result["keep"])
        self.assertGreater(result["family_mean_brier_deltas"]["supplier_shock"], .03)

    def test_missing_positive_or_negative_class_blocks_selection(self):
        original = fake_scores()
        new = fake_scores(balanced=0.1, raw=0.1,
                          overrides={("all", "denied"): (None, .1)})
        result = _decision(original, new, AcademyBudget())
        self.assertFalse(result["keep"])
        self.assertEqual(result["reason"], "missing_class_support")

    def test_new_rejected_model_does_not_change_champion_implicitly(self):
        original = fake_scores()
        new = fake_scores(balanced=0.7, raw=0.65)
        result = _decision(original, new, AcademyBudget())
        self.assertFalse(result["keep"])


class AcademyResearchDirectionTests(unittest.TestCase):
    def test_failure_profile_prioritizes_high_error_head(self):
        score = fake_scores(
            overrides={("all", "delivered_within_4"): (0.65, 0.22)})
        profile = _failure_profile(score, fake_coverage())
        self.assertEqual(profile["target_head"], "delivered_within_4")
        self.assertEqual(set(profile["family_losses"]), set(FAMILIES))
        self.assertGreater(profile["head_losses"]["delivered_within_4"]["priority"],
                           profile["head_losses"]["job_paid"]["priority"])

    def test_label_coverage_deficit_triggers_training_interest(self):
        coverage = fake_coverage()
        coverage["label_heads"]["denied"]["deficit_positive"] = 8
        profile = _failure_profile(fake_scores(), coverage)
        self.assertEqual(profile["target_head"], "denied")

    def test_empty_family_data_creates_exploration_not_false_success(self):
        score = fake_scores()
        for head in score["supplier_shock"]:
            score["supplier_shock"][head] = {
                "n": 0, "positive": 0, "negative": 0,
                "brier": None, "balanced_brier": None}
        profile = _failure_profile(score, fake_coverage())
        self.assertEqual(profile["family_losses"]["supplier_shock"], 1.0)

    def test_no_production_authority_is_granted(self):
        self.assertIn("not_authorized_for_production", RESEARCH_ONLY)


if __name__ == "__main__":
    unittest.main()
