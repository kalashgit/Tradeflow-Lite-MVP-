"""Genesis hybrid memory: conservative fallback and new prospective policy."""

from copy import deepcopy
from pathlib import Path
import unittest

from aion_genesis.domains.electrical_runtime import ElectricalProcurementAdapter
from aion_genesis.domains.electrical_strategy import STRATEGY_DEMO_OBSERVATIONS
from aion_genesis.lab.policies import build_policy
from aion_genesis.lab.protocol import load_config
from aion_genesis.lab.runner import run_experiment
from aion_genesis.runtime import (
    AionRuntime, DecisionRequestV1, GoalProfileV1, HybridEffectModel,
    ObservationV1, OutcomeRecordV1, RuntimeStore, replay,
)


_CONFIG = Path(__file__).resolve().parents[1] / (
    "aion_genesis/lab/configs/genesis_v121_hybrid_eval.json")


class HybridMemoryUnitTests(unittest.TestCase):
    def test_general_fallback_is_preserved_without_two_contextual_receipts(self):
        keys = ("crew=reassign", "supplier=expedite")
        context = (("crew:capacity", 4), ("project:deadline", 3))
        changed = (("crew:capacity", 100), ("project:deadline", 3))
        model = HybridEffectModel().updated(keys, {"margin": -4.0}, context, 10)
        base = model.general.correction(keys, "margin")
        self.assertEqual(model.correction(keys, "margin", context, 10), round(base, 6))
        model = model.updated(keys, {"margin": -4.0}, context, 11)
        base = model.general.correction(keys, "margin")
        adjusted = model.correction(keys, "margin", context, 11)
        self.assertNotEqual(adjusted, round(base, 6))
        self.assertLess(abs(adjusted - base), 1.0)
        self.assertEqual(model.correction(keys, "margin", changed, 11), round(base, 6))
        self.assertEqual(model.correction(keys, "margin", context, 60), round(base, 6))
        self.assertEqual(model.correction(keys, "margin", context, 9), round(base, 6))

    def test_serialization_validation(self):
        model = HybridEffectModel().updated(
            ("crew=hold",), {"schedule": 4}, (("crew:capacity", 4),), 10)
        self.assertEqual(HybridEffectModel.from_json(model.to_json()).to_json(),
                         model.to_json())
        with self.assertRaises(ValueError):
            HybridEffectModel.from_json({"kind": "wrong", "general": {},
                                         "contextual": {}})
        with self.assertRaises(ValueError):
            model.updated(("crew=hold",), {"schedule": float("nan")},
                          (("crew:capacity", 4),), 11)


class HybridMemoryIntegrationTests(unittest.TestCase):
    TENANT = "OWNER-HYBRID"
    DOMAIN = "tradeflow_electrical_procurement"
    SCOPE = "MATERIAL-BATCH-7"

    def test_live_runtime_proposal_outcome_scope_and_replay(self):
        store = RuntimeStore(":memory:")
        self.addCleanup(store.close)
        runtime = AionRuntime(store, [ElectricalProcurementAdapter()])
        for legacy in STRATEGY_DEMO_OBSERVATIONS:
            item = ObservationV1.from_legacy(legacy, self.DOMAIN)
            runtime.observe(ObservationV1.from_json({
                **item.to_json(), "tenant_id": self.TENANT}))
        runtime.set_goal_profile(GoalProfileV1(
            tenant_id=self.TENANT, domain_id=self.DOMAIN,
            goal_weights={"schedule": 5, "margin": 3, "crew_productivity": 2,
                          "customer_trust": 1}, hard_constraints={"max_spend": 500},
            risk_tolerance=0.75, decision_deadline=None,
            owner_preference_version=1))
        def ask(label, caps=("bounded_search", "hybrid_outcome_memory")):
            return runtime.investigate(DecisionRequestV1(
                request_id=label, case_id=label, tenant_id=self.TENANT,
                domain_id=self.DOMAIN, scope_id=self.SCOPE, as_of=5 if label == "ASK-1" else 7,
                available_capabilities=caps))
        first = ask("ASK-1")
        self.assertEqual(first.memory["mode"], "hybrid")
        receipt = OutcomeRecordV1(
            outcome_id="OUT-HYBRID", proposal_id=first.proposal_id,
            tenant_id=self.TENANT, domain_id=self.DOMAIN,
            chosen_action_ref=first.selected_option["identifier"],
            observed_effects={"schedule": 0.0, "margin": -6.0,
                              "crew_productivity": 1.0, "customer_trust": 3.0},
            receipt_ref="RECEIPT-HYBRID", evidence_ref="SYNTHETIC-HYBRID",
            observation_time=6, verified=True)
        self.assertEqual(runtime.record_outcome(receipt)["status"], "learned_provisional")
        second = ask("ASK-2")
        self.assertEqual(second.memory["effect_model_version"], 1)
        self.assertEqual(second.memory["mode"], "hybrid")
        self.assertIsNone(store.active_effect_model(self.TENANT, self.DOMAIN))
        self.assertIsNone(store.active_effect_model("OTHER", self.DOMAIN +
            "::hybrid_v12::" + self.SCOPE))
        old = ask("ASK-3", ("bounded_search",))
        self.assertEqual(old.memory["mode"], "off")
        conflicting = ask("ASK-4", ("bounded_search", "hybrid_outcome_memory",
                                    "contextual_outcome_memory"))
        self.assertEqual(conflicting.abstention_reason, "conflicting_memory_modes")
        self.assertTrue(replay(store.trace(self.TENANT),
                               [ElectricalProcurementAdapter()])["matches"])

    def test_prospective_cohort_is_distinct_from_contextual_cohort(self):
        config = load_config(_CONFIG)
        self.assertEqual(config["candidate"], "aion_v12_hybrid")
        self.assertEqual(config["baseline"], "aion_v1_memory")
        self.assertEqual(config["memory_off_control"], "v09_strategist")
        self.assertIn("hybrid_outcome_memory",
                      build_policy("aion_v12_hybrid", config["budgets"]).capabilities)
        self.assertEqual(config["partitions"]["dev"]["start_seed"], 240000)
        self.assertEqual(config["partitions"]["validation"]["start_seed"], 250000)
        self.assertEqual(config["partitions"]["holdout"]["start_seed"], 260000)
        small = deepcopy(config)
        small["partitions"]["dev"]["episodes"] = 2
        result, ledger = run_experiment(small, ("dev",))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["verdict"], "INCONCLUSIVE")
        self.assertEqual(set(result["partitions"]), {"dev"})
        self.assertEqual(result["labels"]["model_inference_calls"], 0)
        self.assertEqual(result["labels"]["external_actions"], 0)
        self.assertTrue(any(
            e["event"].get("policy") == "aion_v12_hybrid" for e in ledger.records))


if __name__ == "__main__":
    unittest.main()
