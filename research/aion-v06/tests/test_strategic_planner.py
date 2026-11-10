import unittest

from aion_genesis.domains.electrical_strategy import (
    DEMO_CASE, ElectricalStrategyPack, ProcurementDecisionCase,
    STRATEGY_DEMO_OBSERVATIONS, case_from_situation, plan_for_electrical_situation,
)
from aion_genesis.situation_engine import Observation, SituationStore
from aion_genesis.strategic_evaluator import evaluate_strategy, hidden_actual_effects
from aion_genesis.strategic_planner import Axis, Choice, Goals, StrategicPlanner


def goals(**changes):
    weights = {"schedule": 5, "margin": 3, "crew_productivity": 2,
               "customer_trust": 1}
    weights.update(changes)
    return Goals(weights=weights, max_spend=500, uncertainty_aversion=0.5)


class UntrustworthyPack:
    name = "unsafe"
    axes = (Axis("action", ("bad",)),)
    baseline_decisions = (("action", "bad"),)

    def assess(self, facts, decisions):
        return Choice(
            identifier="bad", decisions=decisions,
            expected_effects={"schedule": 900}, uncertainty={"schedule": 0},
            estimated_spend=0, evidence_ids=("MADE-UP-EVIDENCE",),
            explanation="Claim", uncertainty_note="Unknown",
            requires_human_approval=False,
        )


class StrategicPlanningTests(unittest.TestCase):
    def setUp(self):
        self.planner = StrategicPlanner()
        self.pack = ElectricalStrategyPack()

    def test_bounded_exhaustive_search_and_approval_gates(self):
        result = self.planner.enumerate_and_rank(self.pack, DEMO_CASE,
                                                  DEMO_CASE.evidence(), goals())
        self.assertEqual(result["declared_combinations"], 12)
        self.assertEqual(result["feasible_options"], 12)
        self.assertEqual(result["enumeration_coverage_within_declared_space"], 1)
        self.assertFalse(result["all_real_world_options_known"])
        self.assertEqual(result["selected"]["approval_state"], "pending_human_review")
        self.assertFalse(result["learned_policy_verified"])
        self.assertEqual(result["automatic_decisions_executed"], 0)

    def test_budget_excludes_expensive_options(self):
        restricted = Goals(weights=goals().weights, max_spend=0,
                           uncertainty_aversion=0.5)
        result = self.planner.enumerate_and_rank(self.pack, DEMO_CASE,
                                                  DEMO_CASE.evidence(), restricted)
        self.assertEqual(result["feasible_options"], 1)
        self.assertEqual(result["selected"]["identifier"], "wait|hold|quiet")

    def test_owner_priorities_actually_change_strategy(self):
        schedule = self.planner.enumerate_and_rank(
            self.pack, DEMO_CASE, DEMO_CASE.evidence(),
            Goals({"schedule": 5, "margin": 0, "crew_productivity": 0,
                   "customer_trust": 0}, 500, 0),
        )
        margin = self.planner.enumerate_and_rank(
            self.pack, DEMO_CASE, DEMO_CASE.evidence(),
            Goals({"schedule": 0, "margin": 5, "crew_productivity": 0,
                   "customer_trust": 0}, 500, 0),
        )
        self.assertNotEqual(schedule["selected"]["identifier"], margin["selected"]["identifier"])

    def test_unavailable_substitute_cannot_be_proposed(self):
        different = ProcurementDecisionCase(**{
            **DEMO_CASE.__dict__, "qualified_substitute": False,
        })
        result = self.planner.enumerate_and_rank(self.pack, different,
                                                  different.evidence(), goals())
        self.assertEqual(result["feasible_options"], 8)
        self.assertNotIn("qualified_substitute", result["selected"]["identifier"])

    def test_malicious_domain_option_is_rejected(self):
        with self.assertRaises(ValueError):
            self.planner.enumerate_and_rank(UntrustworthyPack(), {}, {"OTHER"},
                                            Goals({"schedule": 5}, 10))

    def test_separate_hidden_evaluator_and_nonnegative_regret(self):
        plan = self.planner.enumerate_and_rank(self.pack, DEMO_CASE,
                                                DEMO_CASE.evidence(), goals())
        self.assertNotIn("oracle_hindsight_value", plan)
        result = evaluate_strategy(start_seed=8000, worlds=20)
        self.assertEqual(result["model_inference_calls"], 0)
        self.assertEqual(result["worlds"], 20)
        self.assertGreaterEqual(result["mean_planner_regret_to_hindsight_oracle"], 0)
        self.assertFalse(result["autonomous_learning_proven"])
        self.assertEqual(len(result["sample_rows"]), 10)

    def test_actual_outcome_is_counterfactual_and_seeded(self):
        decisions = self.pack.baseline_decisions
        a = hidden_actual_effects(7, DEMO_CASE, decisions)
        b = hidden_actual_effects(7, DEMO_CASE, decisions)
        self.assertEqual(a, b)
        self.assertEqual(a["schedule"], 0)

    def test_out_of_distribution_stress_does_not_hide_failed_transfer(self):
        shifted = evaluate_strategy(start_seed=8000, worlds=20,
                                    regime="unexpected_failure")
        self.assertEqual(shifted["hidden_regime"], "unexpected_failure")
        self.assertGreaterEqual(shifted["fraction_planner_worse_than_baseline"], 0)
        self.assertLessEqual(shifted["fraction_planner_worse_than_baseline"], 1)
        self.assertFalse(shifted["real_world_improvement_proven"])

    def _store(self):
        store = SituationStore(":memory:")
        for observation in STRATEGY_DEMO_OBSERVATIONS:
            store.observe(observation)
        for objective, weight in goals().weights.items():
            store.set_goal("OWNER-1", objective, weight)
        return store

    def test_evolving_situation_drives_evidence_linked_strategy(self):
        store = self._store()
        try:
            report = plan_for_electrical_situation(
                store, "OWNER-1", "MATERIAL-BATCH-7", 500,
            )
            self.assertEqual(report["case_source"], "v0.8_current_situation_observations")
            self.assertEqual(report["evidence_records_in_scope"], 8)
            self.assertEqual(report["declared_combinations"], 12)
            self.assertEqual(report["feasible_options"], 12)
            self.assertIn("SUB-1", report["selected"]["evidence_ids"])
            self.assertEqual(report["automatic_decisions_executed"], 0)
        finally:
            store.close()

    def test_new_evidence_removes_unavailable_strategies(self):
        store = self._store()
        try:
            before = plan_for_electrical_situation(
                store, "OWNER-1", "MATERIAL-BATCH-7", 500,
            )
            store.observe(Observation(
                "OWNER-1", "SUB-CORRECTION", 2, "MATERIAL-BATCH-7", "SUPPLIER-2",
                "procurement", "qualified_substitute_available", 0,
            ))
            after = plan_for_electrical_situation(
                store, "OWNER-1", "MATERIAL-BATCH-7", 500,
            )
            self.assertEqual(before["feasible_options"], 12)
            self.assertEqual(after["feasible_options"], 8)
            self.assertNotIn("qualified_substitute", after["selected"]["identifier"])
            self.assertNotIn("SUB-1", after["selected"]["evidence_ids"])
        finally:
            store.close()

    def test_no_guessed_missing_business_evidence(self):
        current = [e for e in STRATEGY_DEMO_OBSERVATIONS
                   if e.metric != "ready_work_hours"]
        with self.assertRaisesRegex(ValueError, "ready_work_hours"):
            case_from_situation(current, "OWNER-1", "MATERIAL-BATCH-7")

    def test_strict_tenant_isolation_in_strategy_adapter(self):
        injected = Observation(
            "OWNER-OTHER", "OTHER-SUPPLY", 1, "MATERIAL-BATCH-7", "SUPPLIER-1",
            "procurement", "supplier_eta_slip_days", 1,
        )
        with self.assertRaisesRegex(ValueError, "Mixed-tenant"):
            case_from_situation([*STRATEGY_DEMO_OBSERVATIONS, injected],
                                "OWNER-1", "MATERIAL-BATCH-7")

    def test_owner_priorities_must_be_explicit_not_inferred(self):
        store = SituationStore(":memory:")
        try:
            for observation in STRATEGY_DEMO_OBSERVATIONS:
                store.observe(observation)
            store.set_goal("OWNER-1", "schedule", 5)
            with self.assertRaisesRegex(ValueError, "explicit owner priorities"):
                plan_for_electrical_situation(store, "OWNER-1", "MATERIAL-BATCH-7", 500)
        finally:
            store.close()


if __name__ == "__main__":
    unittest.main()
