"""Genesis v1.2.3: prove relevant recall influences estimates from verified receipts.

Scientific claim boundary: correct retrieval ≠ correct action. The full lab
independently checks downstream harm and regret on new matched seeds.
"""

from copy import deepcopy
from pathlib import Path
import unittest

from aion_genesis.domains.equipment_maintenance import EquipmentMaintenanceAdapter
from aion_genesis.lab.hidden import make_world
from aion_genesis.lab.policies import build_policy
from aion_genesis.lab.protocol import load_config
from aion_genesis.lab.runner import run_experiment
from aion_genesis.runtime import (
    AionRuntime, DecisionRequestV1, RelevantEffectModel,
    OutcomeRecordV1, RuntimeStore, replay,
)
from aion_genesis.runtime.relevant_memory import relevant_features, similarity


SCHEMA = EquipmentMaintenanceAdapter.memory_relevance_schema
CONFIG = Path(__file__).resolve().parents[1] / (
    "aion_genesis/lab/configs/genesis_v123_relevance_eval.json")
KEYS = ("first=unit_a", "second=none", "depth=inspect")
OTHER_UNIT = ("first=unit_b", "second=none", "depth=inspect")
CONTEXT = (
    ("CREW:technician_hours", 4), ("CREW:spare_kits", 1),
    ("unit_a:wear_index", 82), ("unit_a:criticality", 3),
    ("unit_b:wear_index", 79), ("unit_b:criticality", 3),
    ("unit_c:wear_index", 25), ("unit_c:criticality", 1),
)


class RelevanceModelTests(unittest.TestCase):
    def setUp(self):
        self.model = RelevantEffectModel.from_json(None, SCHEMA)

    def trained(self):
        model = self.model.updated(KEYS, {"uptime": -8.0}, CONTEXT, 101, "RECEIPT-1")
        return model.updated(KEYS, {"uptime": -8.0}, CONTEXT, 111, "RECEIPT-2")

    def test_real_verified_receipt_corrections_reach_different_target_unit(self):
        trained = self.trained()
        report = trained.evidence(OTHER_UNIT, "uptime", CONTEXT, 120)
        self.assertEqual(report["reason"], "verified_relevant_recall")
        self.assertEqual(report["matched_receipts"], 2)
        self.assertEqual(set(report["receipt_refs"]), {"RECEIPT-1", "RECEIPT-2"})
        self.assertNotEqual(report["correction"], report["general"])
        self.assertGreater(abs(report["local_delta"]), 0.2)
        self.assertLessEqual(abs(report["local_delta"]), 1.5)
        self.assertIn("target_1:wear_index", report["context_keys"])
        self.assertNotIn("unit_c:wear_index", report["context_keys"])

    def test_volatile_irrelevant_observation_cannot_block_recall(self):
        model = self.trained()
        unrelated = tuple((k, 90 if k == "unit_c:wear_index" else v)
                          for k, v in CONTEXT)
        self.assertEqual(model.correction(OTHER_UNIT, "uptime", CONTEXT, 120),
                         model.correction(OTHER_UNIT, "uptime", unrelated, 120))
        projected = relevant_features(OTHER_UNIT, unrelated, model.schema)
        original = relevant_features(OTHER_UNIT, CONTEXT, model.schema)
        self.assertEqual(projected, original)
        self.assertEqual(similarity(projected, original), 1.0)

    def test_major_resource_change_and_stale_experience_block_local_transfer(self):
        model = self.trained()
        changed = tuple((k, 90 if k == "CREW:technician_hours" else v)
                        for k, v in CONTEXT)
        for context, as_of in ((changed, 120), (CONTEXT, 150)):
            report = model.evidence(OTHER_UNIT, "uptime", context, as_of)
            self.assertEqual(report["local_delta"], 0.0)
            self.assertEqual(report["reason"], "insufficient_support")
            self.assertEqual(report["correction"], report["general"])

    def test_contradictory_experience_does_not_yield_local_correction(self):
        model = self.trained().updated(
            KEYS, {"uptime": 16.0}, CONTEXT, 112, "RECEIPT-CONTRADICTORY")
        report = model.evidence(OTHER_UNIT, "uptime", CONTEXT, 120)
        self.assertEqual(report["reason"], "conflicting_or_tiny_evidence")
        self.assertEqual(report["local_delta"], 0.0)

    def test_future_receipts_and_corrupt_payload_fail_closed(self):
        model = self.trained()
        with self.assertRaisesRegex(ValueError, "Backdated"):
            model.correction(KEYS, "uptime", CONTEXT, 100)
        with self.assertRaisesRegex(ValueError, "chronology"):
            model.updated(KEYS, {"uptime": 2}, CONTEXT, 50, "BACKDATE")
        with self.assertRaises(ValueError):
            model.updated(KEYS, {"uptime": float("nan")}, CONTEXT, 121, "BAD")
        bad = model.to_json()
        bad["records"][0]["innovations"]["uptime"] = float("nan")
        with self.assertRaises(ValueError):
            RelevantEffectModel.from_json(bad, SCHEMA)
        with self.assertRaises(ValueError):
            RelevantEffectModel.from_json({"kind": "other"}, SCHEMA)

    def test_serialized_model_has_receipt_provenance_and_no_extra_features(self):
        original = self.trained()
        restored = RelevantEffectModel.from_json(original.to_json(), SCHEMA)
        self.assertEqual(restored.to_json(), original.to_json())
        self.assertEqual(restored.evidence(OTHER_UNIT, "uptime", CONTEXT, 120),
                         original.evidence(OTHER_UNIT, "uptime", CONTEXT, 120))
        unsupported = RelevantEffectModel.from_json(original.to_json(), None)
        report = unsupported.evidence(KEYS, "uptime", CONTEXT, 120)
        self.assertEqual(report["local_delta"], 0.0)
        self.assertEqual(report["reason"], "no_declared_relevance")


class RelevanceIntegrationTests(unittest.TestCase):
    def test_runtime_only_learns_verified_applied_actions_and_replays(self):
        world = make_world("resource_allocation", 330002, "nominal")
        store = RuntimeStore(":memory:")
        self.addCleanup(store.close)
        runtime = AionRuntime(store, [EquipmentMaintenanceAdapter()])
        runtime.set_goal_profile(world.goal_profile())
        first = None
        for step_index in range(3):
            step = world.public_step(None, step_index)
            for obs in step.observations:
                runtime.observe(obs)
            proposal = runtime.investigate(DecisionRequestV1(
                request_id="V123-" + step.case_id, case_id=step.case_id,
                tenant_id=world.tenant_id, domain_id=world.domain_id,
                scope_id=step.scope_id, as_of=step.as_of,
                available_capabilities=("bounded_search", "relevant_outcome_memory")))
            self.assertEqual(proposal.memory["mode"], "relevant")
            self.assertIn("decision_evidence", proposal.memory)
            self.assertIsNotNone(proposal.selected_option)
            if step_index == 0:
                first = proposal
                self.assertIsNone(proposal.memory["effect_model_version"])
            else:
                self.assertIsNotNone(proposal.memory["effect_model_version"])
            decisions = tuple(tuple(item) for item in proposal.selected_option["decisions"])
            effects, _ = world.transition(None, step_index, decisions)
            receipt = OutcomeRecordV1(
                outcome_id="OUT-" + step.case_id, proposal_id=proposal.proposal_id,
                tenant_id=world.tenant_id, domain_id=world.domain_id,
                chosen_action_ref=proposal.selected_option["identifier"],
                observed_effects=effects, receipt_ref="SIM-REC-" + step.case_id,
                evidence_ref="SIM-EV-" + step.case_id,
                observation_time=step.as_of + 1, verified=True)
            self.assertEqual(runtime.record_outcome(receipt)["status"], "learned_provisional")
            self.assertEqual(runtime.record_outcome(receipt)["status"], "duplicate")
        self.assertIsNone(store.active_effect_model(world.tenant_id, world.domain_id))
        self.assertIsNotNone(store.active_effect_model(
            world.tenant_id, world.domain_id + "::relevant_v123::FLEET"))
        self.assertIsNone(store.active_effect_model(
            "OTHER-TENANT", world.domain_id + "::relevant_v123::FLEET"))
        self.assertTrue(replay(store.trace(world.tenant_id),
                               [EquipmentMaintenanceAdapter()])["matches"])

    def test_conflicting_modes_abstain_and_policy_not_legacy(self):
        profile = make_world("resource_allocation", 330002, "nominal").goal_profile()
        store = RuntimeStore(":memory:")
        self.addCleanup(store.close)
        runtime = AionRuntime(store, [EquipmentMaintenanceAdapter()])
        runtime.set_goal_profile(profile)
        world = make_world("resource_allocation", 330002, "nominal")
        step = world.public_step(None, 0)
        for obs in step.observations:
            runtime.observe(obs)
        p = runtime.investigate(DecisionRequestV1(
            request_id="MODE-CONFLICT", case_id=step.case_id,
            tenant_id=world.tenant_id, domain_id=world.domain_id,
            scope_id=step.scope_id, as_of=step.as_of,
            available_capabilities=("bounded_search", "relevant_outcome_memory",
                                    "hybrid_outcome_memory")))
        self.assertEqual(p.abstention_reason, "conflicting_memory_modes")
        self.assertIsNone(p.selected_option)

    def test_prospective_cohorts_are_new_and_score_preserved(self):
        config = load_config(CONFIG)
        self.assertEqual(config["candidate"], "aion_v123_relevant")
        self.assertEqual(config["baseline"], "aion_v1_memory")
        self.assertEqual(config["partitions"]["dev"]["start_seed"], 330000)
        self.assertEqual(config["partitions"]["validation"]["start_seed"], 340000)
        self.assertEqual(config["partitions"]["holdout"]["start_seed"], 350000)
        self.assertIn("relevant_outcome_memory",
                      build_policy("aion_v123_relevant", config["budgets"]).capabilities)
        small = deepcopy(config)
        small["partitions"]["dev"]["episodes"] = 2
        result, ledger = run_experiment(small, ("dev",))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(set(result["partitions"]), {"dev"})
        self.assertEqual(result["verdict"], "INCONCLUSIVE")
        self.assertEqual(result["labels"]["model_inference_calls"], 0)
        self.assertEqual(result["labels"]["external_actions"], 0)
        self.assertTrue(any(e["event"].get("policy") == "aion_v123_relevant"
                            for e in ledger.records))


if __name__ == "__main__":
    unittest.main()
