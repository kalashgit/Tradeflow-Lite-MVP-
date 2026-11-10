"""Genesis v1.2 opt-in contextual memory: pure-model and runtime boundaries."""

import os
import tempfile
import unittest

from aion_genesis.domains.electrical_runtime import ElectricalProcurementAdapter
from aion_genesis.domains.electrical_strategy import STRATEGY_DEMO_OBSERVATIONS
from aion_genesis.runtime import (
    AionRuntime, ContextualEffectModel, DecisionRequestV1, GoalProfileV1,
    ObservationV1, OutcomeRecordV1, RuntimeStore, replay,
)
from aion_genesis.runtime.contextual_memory import MAX_RECORDS, public_context


class Sample:
    def __init__(self, subject, metric, value):
        self.subject_id = subject
        self.metric = metric
        self.value = value


class ContextualModelTests(unittest.TestCase):
    def test_context_dependence_aging_and_action_scope(self):
        action = ("crew=reassign", "supplier=expedite")
        observed = (("crew:capacity", 1), ("project:deadline", 2))
        changed = (("crew:capacity", 80), ("project:deadline", 2))
        model = ContextualEffectModel().updated(action, {"margin": -9}, observed, 10)
        self.assertEqual(model.correction(action, "margin", observed, 10), -3.0)
        self.assertEqual(model.correction(action, "margin", changed, 10), 0.0)
        self.assertEqual(model.correction(("crew=hold",), "margin", observed, 10), 0.0)
        self.assertEqual(model.correction(action, "margin", observed, 9), 0.0)
        self.assertEqual(model.correction(action, "margin", observed, 43), 0.0)
        self.assertLess(abs(model.correction(action, "margin", observed, 20)), 3.0)

    def test_persistence_bounds_disagreement_and_malformed_payload(self):
        action, context = ("a=b",), (("x:y", 4),)
        model = ContextualEffectModel().updated(action, {"profit": 8}, context, 3)
        model = model.updated(action, {"profit": -8}, context, 4)
        self.assertLess(abs(model.correction(action, "profit", context, 4)), 1)
        self.assertEqual(ContextualEffectModel.from_json(model.to_json()).to_json(),
                         model.to_json())
        for i in range(MAX_RECORDS + 10):
            model = model.updated(action, {"profit": 0}, context, 10 + i)
        self.assertEqual(len(model.records), MAX_RECORDS)
        for bad in (float("nan"), float("inf"), True):
            with self.assertRaises(ValueError):
                model.updated(action, {"profit": bad}, context, 1)
        with self.assertRaises(ValueError):
            ContextualEffectModel.from_json({"kind": "other", "records": []})
        with self.assertRaises(ValueError):
            ContextualEffectModel.from_json({
                "kind": "contextual_residual_v12", "records": [{"bogus": 1}]})
        self.assertEqual(public_context([
            Sample("crew", "capacity", 3), Sample("fleet", "wear", None)]),
            (("crew:capacity", 3.0),))


class ContextualRuntimeTests(unittest.TestCase):
    TENANT = "OWNER-CONTEXT"
    DOMAIN = "tradeflow_electrical_procurement"
    SCOPE = "MATERIAL-BATCH-7"
    CAPS = ("bounded_search", "contextual_outcome_memory")

    def setUp(self):
        self.store = RuntimeStore(":memory:")
        self.runtime = AionRuntime(self.store, [ElectricalProcurementAdapter()])
        for legacy in STRATEGY_DEMO_OBSERVATIONS:
            adapted = ObservationV1.from_legacy(legacy, self.DOMAIN)
            self.runtime.observe(ObservationV1.from_json({
                **adapted.to_json(), "tenant_id": self.TENANT}))
        self.runtime.set_goal_profile(GoalProfileV1(
            tenant_id=self.TENANT, domain_id=self.DOMAIN,
            goal_weights={"schedule": 5, "margin": 3,
                          "crew_productivity": 2, "customer_trust": 1},
            hard_constraints={"max_spend": 500},
            risk_tolerance=0.75, decision_deadline=None,
            owner_preference_version=1))

    def tearDown(self):
        self.store.close()

    def decide(self, request_id, as_of=5, capabilities=None):
        return self.runtime.investigate(DecisionRequestV1(
            request_id=request_id, case_id=request_id,
            tenant_id=self.TENANT, domain_id=self.DOMAIN,
            scope_id=self.SCOPE, as_of=as_of,
            available_capabilities=capabilities or self.CAPS))

    def test_verified_receipt_is_contextual_and_does_not_change_legacy(self):
        first = self.decide("CONTEXT-1")
        self.assertEqual(first.memory["mode"], "contextual")
        self.assertIsNone(first.memory["effect_model_version"])
        self.assertTrue(first.memory["context"])
        receipt = OutcomeRecordV1(
            outcome_id="OUT-CONTEXT-1", proposal_id=first.proposal_id,
            tenant_id=self.TENANT, domain_id=self.DOMAIN,
            chosen_action_ref=first.selected_option["identifier"],
            observed_effects={"schedule": 0.0, "margin": -6.0,
                              "crew_productivity": 1.0, "customer_trust": 3.0},
            receipt_ref="RECEIPT-CONTEXT-1", evidence_ref="SIM-CONTEXT-1",
            observation_time=6, verified=True)
        self.assertEqual(self.runtime.record_outcome(receipt)["status"],
                         "learned_provisional")
        self.assertEqual(self.runtime.record_outcome(receipt)["status"], "duplicate")
        second = self.decide("CONTEXT-2", as_of=7)
        self.assertEqual(second.memory["effect_model_version"], 1)
        self.assertIsNone(self.store.active_effect_model(self.TENANT, self.DOMAIN))
        self.assertIsNone(self.store.active_effect_model("OTHER-TENANT",
            self.DOMAIN + "::contextual_v12::" + self.SCOPE))
        off = self.decide("CONTEXT-OFF", as_of=7, capabilities=("bounded_search",))
        self.assertEqual(off.memory["mode"], "off")
        self.assertEqual(replay(self.store.trace(self.TENANT),
                                [ElectricalProcurementAdapter()])["matches"], True)

    def test_conflicting_memory_modes_fail_closed(self):
        result = self.decide("CONTEXT-CONFLICT", capabilities=(
            "bounded_search", "outcome_memory", "contextual_outcome_memory"))
        self.assertEqual(result.abstention_reason, "conflicting_memory_modes")
        self.assertIsNone(result.selected_option)


if __name__ == "__main__":
    unittest.main()
