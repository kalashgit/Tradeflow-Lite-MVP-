"""Genesis v1.2.4: preserve v1 learning across scopes, isolate local receipts."""

from copy import deepcopy
from pathlib import Path
import unittest

from aion_genesis.domains.equipment_maintenance import EquipmentMaintenanceAdapter
from aion_genesis.lab.hidden import make_world
from aion_genesis.lab.policies import RuntimePolicy, build_policy
from aion_genesis.lab.protocol import load_config
from aion_genesis.lab.referee import hindsight_oracle, run_episode
from aion_genesis.lab.runner import run_experiment
from aion_genesis.runtime import (
    AionRuntime, DecisionRequestV1, DomainGeneralRelevantEffectModel,
    OutcomeRecordV1, RuntimeStore, replay,
)


CONFIG = Path(__file__).resolve().parents[1] / (
    "aion_genesis/lab/configs/genesis_v124_domain_general_eval.json")
BUDGETS = {"time_budget_ms": 5000, "compute_budget": 64}
SCHEMA = EquipmentMaintenanceAdapter.memory_relevance_schema
KEYS = ("first=unit_a", "second=none", "depth=inspect")
CONTEXT = (
    ("CREW:technician_hours", 4), ("CREW:spare_kits", 1),
    ("unit_a:wear_index", 82), ("unit_a:criticality", 3),
    ("unit_b:wear_index", 79), ("unit_b:criticality", 3),
)


class SharedLearningTests(unittest.TestCase):
    def test_additive_general_fallback_survives_scope_change(self):
        model = DomainGeneralRelevantEffectModel.from_json(None, schema=None)
        model = model.updated(KEYS, {"uptime": -8}, CONTEXT, 101, "REC-A", "SCOPE-A")
        report = model.evidence(KEYS, "uptime", CONTEXT, 110, "SCOPE-B")
        self.assertNotEqual(report["general"], 0.0)
        self.assertEqual(report["correction"], report["general"])
        self.assertEqual(report["local_delta"], 0.0)
        self.assertEqual(report["reason"], "no_declared_relevance")
        self.assertEqual(report["general_scope"], "tenant_and_domain")
        self.assertEqual(report["memory_scope"], "SCOPE-B")
        self.assertIn("SCOPE-A", model.scopes)
        self.assertNotIn("SCOPE-B", model.scopes)

    def test_local_receipts_cannot_cross_scope_even_with_same_conditions(self):
        model = DomainGeneralRelevantEffectModel.from_json(None, schema=SCHEMA)
        model = model.updated(KEYS, {"uptime": -8}, CONTEXT, 101, "REC-A", "FLEET-A")
        model = model.updated(KEYS, {"uptime": -8}, CONTEXT, 111, "REC-B", "FLEET-A")
        valid = model.evidence(KEYS, "uptime", CONTEXT, 120, "FLEET-A")
        other = model.evidence(KEYS, "uptime", CONTEXT, 120, "FLEET-B")
        self.assertEqual(valid["reason"], "verified_relevant_recall")
        self.assertNotEqual(valid["local_delta"], 0.0)
        self.assertEqual(set(valid["receipt_refs"]), {"REC-A", "REC-B"})
        self.assertEqual(other["local_delta"], 0.0)
        self.assertEqual(other["correction"], other["general"])
        self.assertEqual(other["matched_receipts"], 0)
        again = DomainGeneralRelevantEffectModel.from_json(model.to_json(), SCHEMA)
        self.assertEqual(again.to_json(), model.to_json())
        self.assertEqual(again.evidence(KEYS, "uptime", CONTEXT, 120, "FLEET-A"),
                         valid)

    def test_future_history_corruption_and_nonmonotonic_outcomes_fail_closed(self):
        model = DomainGeneralRelevantEffectModel.from_json(None, schema=SCHEMA)
        model = model.updated(KEYS, {"uptime": -8}, CONTEXT, 101, "REC-A", "FLEET")
        with self.assertRaisesRegex(ValueError, "Backdated"):
            model.correction(KEYS, "uptime", CONTEXT, 100, "OTHER")
        with self.assertRaises(ValueError):
            model.updated(KEYS, {"uptime": -8}, CONTEXT, 99, "REC-OLD", "OTHER")
        bad = model.to_json()
        bad["scopes"]["FLEET"][0]["innovations"]["uptime"] = float("nan")
        with self.assertRaises(ValueError):
            DomainGeneralRelevantEffectModel.from_json(bad, SCHEMA)


class RuntimeAndLabTests(unittest.TestCase):
    def test_rotating_procurement_scopes_equal_frozen_v1_choices_and_effects(self):
        """The defect in v1.2.3 is now protected by a real multi-step test."""
        for seed in (390000, 390001, 390002):
            for variant in ("nominal", "shifted"):
                world = make_world("electrical_procurement", seed, variant)
                oracle = hindsight_oracle(world)
                v1, _ = run_episode(world, RuntimePolicy("aion_v1_memory", BUDGETS),
                                    "dev", oracle)
                v124, _ = run_episode(
                    world, RuntimePolicy("aion_v124_domain_relevant", BUDGETS),
                    "dev", oracle)
                self.assertEqual(len(v1), len(v124))
                for old, new in zip(v1, v124):
                    for field in ("applied", "selected", "realized_value",
                                  "prediction_abs_error", "failure_classes",
                                  "harmful", "regret"):
                        self.assertEqual(old[field], new[field],
                                         f"{seed}/{variant}/{old['step']}:{field}")

    def test_domain_general_state_tenant_isolation_and_review_only(self):
        world = make_world("resource_allocation", 330002, "nominal")
        store = RuntimeStore(":memory:")
        self.addCleanup(store.close)
        runtime = AionRuntime(store, [EquipmentMaintenanceAdapter()])
        runtime.set_goal_profile(world.goal_profile())
        for step_index in range(3):
            step = world.public_step(None, step_index)
            for observation in step.observations:
                runtime.observe(observation)
            proposal = runtime.investigate(DecisionRequestV1(
                request_id="V124-" + step.case_id, case_id=step.case_id,
                tenant_id=world.tenant_id, domain_id=world.domain_id,
                scope_id=step.scope_id, as_of=step.as_of,
                available_capabilities=("bounded_search", "domain_relevant_memory")))
            self.assertEqual(proposal.memory["mode"], "domain_relevant")
            self.assertIn("decision_evidence", proposal.memory)
            self.assertEqual(proposal.approval_state, "pending_human_review")
            decisions = tuple(tuple(pair) for pair in proposal.selected_option["decisions"])
            effects, _ = world.transition(None, step_index, decisions)
            receipt = OutcomeRecordV1(
                outcome_id="OUT-" + step.case_id, proposal_id=proposal.proposal_id,
                tenant_id=world.tenant_id, domain_id=world.domain_id,
                chosen_action_ref=proposal.selected_option["identifier"],
                observed_effects=effects, receipt_ref="SIM-REC-" + step.case_id,
                evidence_ref="SIM-EV-" + step.case_id,
                observation_time=step.as_of + 1, verified=True)
            self.assertEqual(runtime.record_outcome(receipt)["status"],
                             "learned_provisional")
        key = world.domain_id + "::relevant_v124::domain"
        self.assertIsNotNone(store.active_effect_model(world.tenant_id, key))
        self.assertIsNone(store.active_effect_model("OTHER-TENANT", key))
        self.assertIsNone(store.active_effect_model(world.tenant_id, world.domain_id))
        self.assertTrue(replay(store.trace(world.tenant_id),
                               [EquipmentMaintenanceAdapter()])["matches"])

    def test_fresh_matched_cohorts_not_old_validation(self):
        c = load_config(CONFIG)
        self.assertEqual(c["candidate"], "aion_v124_domain_relevant")
        self.assertEqual(c["baseline"], "aion_v1_memory")
        self.assertEqual(c["memory_off_control"], "v09_strategist")
        self.assertEqual(c["partitions"]["dev"]["start_seed"], 390000)
        self.assertEqual(c["partitions"]["validation"]["start_seed"], 400000)
        self.assertEqual(c["partitions"]["holdout"]["start_seed"], 410000)
        self.assertIn("domain_relevant_memory",
                      build_policy("aion_v124_domain_relevant", BUDGETS).capabilities)
        tiny = deepcopy(c)
        tiny["partitions"]["dev"]["episodes"] = 2
        result, ledger = run_experiment(tiny, ("dev",))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(set(result["partitions"]), {"dev"})
        self.assertEqual(result["verdict"], "INCONCLUSIVE")
        self.assertEqual(result["labels"]["model_inference_calls"], 0)
        self.assertTrue(any(row["event"].get("policy") == "aion_v124_domain_relevant"
                            for row in ledger.records))


if __name__ == "__main__":
    unittest.main()
