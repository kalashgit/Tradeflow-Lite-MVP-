"""First model-guided corrective research experiment: mock mechanics only in CI."""
import json
import unittest

from aion_genesis.eval_v2.causal_world import World, generate
from aion_genesis.learning_v3.model_corrective import (
    LocalOllamaStrategy, MockStrategy, _public_observation,
    run_experiment, run_strategy, STRATEGIES,
)


class FakeTransport:
    def __init__(self):
        self.calls = []
    def __call__(self, payload):
        self.calls.append(payload)
        query = json.loads(payload["messages"][-1]["content"])
        strategy = "risk_averse" if (
            query["previous_attempt_feedback"] is None and
            query["provisional_experience"] is None) else "deadline_first"
        return {"done": True, "done_reason": "stop",
                "message": {"content": json.dumps({
                    "strategy": strategy, "hypothesis": "Need to verify evidence",
                    "uncertainty": "Unknown effects"})},
                "prompt_eval_count": 54, "eval_count": 12}


class ModelBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.case = generate("dev", 0, family="supplier_shock")
        self.view = World(self.case).public_view("project_manager",
                      tenant="SYN-TENANT-" + str(self.case.seed))

    def test_only_role_scoped_snapshot_is_accepted(self):
        projection = _public_observation(self.view)
        self.assertIn("jobs", projection)
        self.assertNotIn("shocks", projection)
        self.assertNotIn("global_truth", projection)
        with self.assertRaises(PermissionError):
            _public_observation({**self.view, "global_truth": True})
        with self.assertRaises(PermissionError):
            _public_observation({**self.view, "role": "owner"})
        with self.assertRaises(PermissionError):
            _public_observation({**self.view, "shocks": []})

    def test_model_transport_is_loopback_and_output_is_strict(self):
        for endpoint in ("https://example.com", "http://example.com:11434",
                         "http://127.0.0.1:11434/evil",
                         "http://user:pass@127.0.0.1:11434"):
            with self.subTest(endpoint=endpoint), self.assertRaises(ValueError):
                LocalOllamaStrategy(endpoint=endpoint)
        transport = FakeTransport()
        model = LocalOllamaStrategy(transport=transport)
        selected = model.choose(observation=self.view)
        self.assertIn(selected["strategy"], STRATEGIES)
        self.assertEqual(model.calls, 1)
        self.assertEqual(model.prompt_tokens, 54)
        self.assertEqual(model.completion_tokens, 12)
        query = transport.calls[0]["messages"][-1]["content"]
        self.assertNotIn("future_shocks", query)
        self.assertNotIn("source_truth", query)
        self.assertNotIn("supplier_delay", query)
        self.assertIsNone(json.loads(query)["previous_attempt_feedback"])

    def test_bad_model_strategy_is_rejected_not_replaced(self):
        def malicious(_payload):
            return {"done": True, "message": {"content": json.dumps({
                "strategy": "write_production",
                "hypothesis": "x", "uncertainty": "none"})}}
        model = LocalOllamaStrategy(transport=malicious)
        with self.assertRaises(ValueError):
            model.choose(observation=self.view)

    def test_censored_or_incomplete_model_output_not_accepted(self):
        model = LocalOllamaStrategy(transport=lambda payload: {
            "done": False, "message": {"content": "{}"}})
        with self.assertRaises(ValueError):
            model.choose(observation=self.view)

    def test_network_messages_derive_from_actual_causal_world(self):
        row = run_strategy(self.case, "deadline_first")
        self.assertIn("synthetic_value_proxy", row["score"])
        self.assertGreaterEqual(row["network"]["pm_known_count"], 0)
        self.assertGreaterEqual(row["network"]["supplier_known_count"], 0)
        self.assertNotIn("source_truth", json.dumps(row))
        self.assertIn("last_role_messages", row["feedback"])
        self.assertEqual(row["strategy"], "deadline_first")

    def test_mock_cycle_measures_without_claiming_model_learning(self):
        result = run_experiment(proposer=MockStrategy(), dev_indices=(0,),
                                transfer_index=17)
        self.assertFalse(result["real_model_inference"])
        self.assertFalse(result["candidate_promoted"])
        self.assertFalse(result["independent_protected_holdout"])
        self.assertEqual(result["metrics"]["model_calls"], 4)
        self.assertEqual(result["dev"][0]["initial_model_choice"]["strategy"],
                         "risk_averse")
        self.assertEqual(result["dev"][0]["revised_model_choice"]["strategy"],
                         "deadline_first")
        self.assertEqual(result["dev"][0]["initial"]["score"]["case_id"],
                         result["dev"][0]["replay"]["score"]["case_id"])
        self.assertFalse(result["dev"][0]["causal_lesson_independently_certified"])
        self.assertFalse(result["new_model_weights_trained"])

    def test_fake_model_cycle_uses_real_model_contract_but_is_not_real_inference(self):
        # Adapter is genuine, but injected transport is a FAKE; never claim
        # actual model inference from this test. Runner label is only a mode.
        transport = FakeTransport()
        result = run_experiment(
            proposer=LocalOllamaStrategy(model="fake-qwen", transport=transport),
            dev_indices=(0,), transfer_index=18)
        self.assertEqual(len(transport.calls), 4)
        self.assertEqual(result["metrics"]["model_calls"], 4)
        self.assertFalse(result["real_model_inference"])
        self.assertEqual(result["metrics"]["prompt_tokens"], 216)
        self.assertEqual(result["transfer"]["case_id"].split("-")[2], "VALIDATION")
        self.assertFalse(result["candidate_promoted"])


if __name__ == "__main__":
    unittest.main()
