"""No real inference or network calls during this test suite."""

import json
import unittest
from unittest.mock import patch, MagicMock

from aion_genesis.live_ablation import run_bounded_ablation
from aion_genesis.model_lab import FixtureChatModel
from aion_genesis.ollama import LocalOllamaAdapter, DECISION_SCHEMA


class TestLocalOllama(unittest.TestCase):
    def test_refuses_external_hosts(self):
        with self.assertRaises(ValueError):
            LocalOllamaAdapter("qwen3:0.6b", "https://example.com")
        with self.assertRaises(ValueError):
            LocalOllamaAdapter("qwen3:0.6b", "http://localhost:11434/x")

    @patch("aion_genesis.ollama.request.urlopen")
    def test_disables_thinking_and_constrains_json(self, mocked):
        body = json.dumps({"message": {"content": '{"supplier":"economy"}'}})
        stream = MagicMock()
        stream.__enter__.return_value.read.return_value = body.encode()
        mocked.return_value = stream
        adapter = LocalOllamaAdapter("qwen3:0.6b")
        adapter.complete([{"role": "system", "content": "Make a decision"}])
        req = mocked.call_args.args[0]
        posted = json.loads(req.data)
        self.assertEqual(posted["format"], DECISION_SCHEMA)
        self.assertIs(posted["think"], False)
        self.assertFalse(posted["stream"])


class TestLiveAbalation(unittest.TestCase):
    def test_paired_fixture_control_not_labeled_live(self):
        report = run_bounded_ablation(FixtureChatModel(), model_name="test_fixture",
                                     jobs=5, shift_at=2, max_total_calls=21)
        self.assertEqual(report["status"], "FIXTURE_ONLY")
        self.assertFalse(report["real_inference_verified"])
        self.assertEqual(report["inference_attempted_calls"], 21)
        self.assertIn("holdout_memory_delta_cents", report)
        self.assertEqual(report["research_admission"], "BLOCKED")

    def test_budget_validation_before_any_inference(self):
        model = MagicMock()
        with self.assertRaises(ValueError):
            run_bounded_ablation(model, model_name="test", jobs=8,
                                max_total_calls=20)
        model.complete.assert_not_called()

    def test_failed_preflight_cannot_be_claimed_as_verified(self):
        model = MagicMock()
        model.complete.return_value = "not AION_OK"
        report = run_bounded_ablation(model, model_name="test", jobs=5,
                                     max_total_calls=21, live_transport=True)
        self.assertEqual(report["status"], "INCOMPLETE")
        self.assertEqual(report["failure_stage"], "preflight")
        self.assertFalse(report["real_inference_verified"])
        self.assertEqual(report["inference_attempted_calls"], 1)


if __name__ == "__main__":
    unittest.main()
