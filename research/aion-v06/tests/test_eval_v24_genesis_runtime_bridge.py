"""AionRuntime causal-world adapter contracts; no paid model calls."""

import json
from dataclasses import replace
import unittest

from aion_genesis.eval_v2.causal_world import generate, World
from aion_genesis.eval_v2.genesis_policy import (
    DOMAIN, GenesisCausalPolicy, bind_local_inference,
    run_genesis_episode,
)
from aion_genesis.provider import InferenceConfig
from aion_genesis.runtime import ModelBinding, PENDING_HUMAN_REVIEW


class FakeModel:
    def __init__(self, invalid=False):
        self.calls = 0
        self.invalid = invalid

    def complete(self, messages):
        self.calls += 1
        if self.invalid:
            return '{"selected":"forged_or_unauthorized","rationale":"unsafe"}'
        # Only use the prevalidated, public option ID supplied by Genesis.
        body = json.loads(messages[-1]["content"])
        options = body["options"]
        return json.dumps({"selected": options[0]["id"],
                           "rationale": "Bounded synthetic scenario ranking"})


class ActualGenesisRuntimeTests(unittest.TestCase):
    def test_real_runtime_produces_only_reviewable_synthetic_proposals(self):
        case = generate("dev", 0)
        policy = GenesisCausalPolicy(case)
        world = World(case)
        try:
            view = world.public_view("project_manager",
                                     tenant="SYN-TENANT-" + str(case.seed))
            action = policy.choose(view)
            self.assertGreater(len(policy.proposals), 0)
            proposal = policy.proposals[-1]
            self.assertEqual(proposal.domain_id, DOMAIN)
            self.assertEqual(proposal.approval_state, PENDING_HUMAN_REVIEW)
            self.assertEqual(proposal.external_actions, 0)
            self.assertIn(action["tool"], ("wait", "order_material",
                          "assign_crew", "escalate_blocker",
                          "request_change_approval", "request_invoice",
                          "resolve_invoice_dispute"))
            self.assertTrue(policy.runtime is not None)
            self.assertEqual(policy.actual_model_calls, 0)
            self.assertEqual(policy.learning_receipts, 0)
            self.assertNotIn("future_shocks", view)
        finally:
            policy.close()

    def test_confirmed_mock_receipt_only_then_provisional_memory(self):
        case = generate("dev", 2)
        world = World(case)
        policy = GenesisCausalPolicy(case)
        try:
            view = world.public_view()
            act = policy.choose(view)
            self.assertNotEqual(act["tool"], "verify_operation")
            result = world.step(act)
            policy.observe(act, result["result"])
            if act["tool"] == "wait":
                self.skipTest("Planner legitimately abstained in this synthetic seed")
            self.assertEqual(policy.learning_receipts, 0)
            verify = policy.choose(world.public_view())
            self.assertEqual(verify["tool"], "verify_operation")
            verified = world.step(verify)
            policy.observe(verify, verified["result"])
            if result["result"]["status"] == "committed":
                self.assertEqual(verified["result"]["status"], "committed")
                self.assertEqual(policy.learning_receipts, 1)
                self.assertEqual(policy.receipts[-1]["verified"], True)
            else:
                self.assertEqual(policy.learning_receipts, 0)
        finally:
            policy.close()

    def test_non_synthetic_and_foreign_role_observations_rejected(self):
        case = generate("dev", 1)
        world = World(case)
        policy = GenesisCausalPolicy(case)
        try:
            with self.assertRaises(PermissionError):
                policy.choose({"fictional": False, "role": "project_manager",
                               "jobs": [], "cash_budget": 0, "tick": 0,
                               "global_truth": False})
            with self.assertRaises(PermissionError):
                policy.choose(world.public_view("supplier"))
            with self.assertRaises(PermissionError):
                world.public_view("project_manager", tenant="SYN-FOREIGN")
        finally:
            policy.close()

    def test_model_advice_must_be_explicitly_bound_and_bounded(self):
        case = generate("dev", 0)
        with self.assertRaises(ValueError):
            GenesisCausalPolicy(case, model_call_budget=1)
        fake = FakeModel()
        policy = GenesisCausalPolicy(case, model_binding=ModelBinding(
            fake, "synthetic-test-model", True), model_call_budget=1)
        try:
            result = policy.choose(World(case).public_view())
            self.assertTrue(fake.calls <= 1)
            self.assertEqual(fake.calls, policy.actual_model_calls)
            self.assertTrue(result["tool"] in (
                "wait", "order_material", "assign_crew",
                "escalate_blocker", "request_change_approval",
                "request_invoice", "resolve_invoice_dispute"))
            self.assertEqual(policy.proposals[-1].model["is_mock"], True)
        finally:
            policy.close()

    def test_invalid_model_output_never_invents_action(self):
        case = generate("dev", 0)
        fake = FakeModel(invalid=True)
        policy = GenesisCausalPolicy(case, model_binding=ModelBinding(
            fake, "bad-synthetic-advisor", True), model_call_budget=1)
        try:
            action = policy.choose(World(case).public_view())
            self.assertNotEqual(action["tool"], "forged_or_unauthorized")
            self.assertTrue(all(p.external_actions == 0 for p in policy.proposals))
        finally:
            policy.close()

    def test_local_inference_disabled_by_default_and_remote_host_rejected(self):
        local = InferenceConfig(base_url="http://localhost:11434/v1",
                                model="offline-demo", max_completion_tokens=64)
        with self.assertRaises(PermissionError):
            bind_local_inference(local)
        remote = InferenceConfig(base_url="https://example.com/v1",
                                 model="example", max_completion_tokens=64)
        with self.assertRaises(PermissionError):
            bind_local_inference(remote, explicit_authorization=True)
        bound = bind_local_inference(local, explicit_authorization=True)
        self.assertFalse(bound.is_mock)
        self.assertEqual(bound.identity, "offline-demo")

    def test_real_genesis_runtime_episode_reproducible_without_model(self):
        case = generate("dev", 1)
        a = run_genesis_episode(case)
        b = run_genesis_episode(case)
        self.assertEqual(a, b)
        self.assertEqual(a["runtime"], "AionRuntime")
        self.assertFalse(a["model_advice_enabled"])
        self.assertEqual(a["model_calls"], 0)
        self.assertEqual(a["external_business_actions"], 0)
        self.assertFalse(a["protected_holdout_evaluated"])
        self.assertTrue(a["synthetic_mock_operations_only"])
        self.assertGreater(len(a["trace"]), 20)

    def test_memory_disabled_can_run_and_no_cross_tenant_transfer(self):
        first = generate("dev", 3)
        second = generate("dev", 4)
        a = run_genesis_episode(first, enable_outcome_memory=False)
        b = run_genesis_episode(second, enable_outcome_memory=False)
        self.assertEqual(a["learning_receipts"], 0)
        self.assertEqual(b["learning_receipts"], 0)
        self.assertEqual(a["memory_mode"], "off")
        self.assertNotEqual(a["case_id"], b["case_id"])


if __name__ == "__main__":
    unittest.main()
