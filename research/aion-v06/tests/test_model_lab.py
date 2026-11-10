import contextlib
from io import StringIO
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from aion_genesis.cli import main
from aion_genesis.model_compare import compare_model_reports
from aion_genesis.dashboard import render_model_dashboard
from aion_genesis.model_lab import (
    FixtureChatModel, InvalidModelResponse, ModelDecisionAgent,
    benchmark_model, parse_decision, run_model_episode,
)
from aion_genesis.provider import CompatibleChatAdapter, InferenceConfig
from aion_genesis.worlds.tradeflow import TradeFlowWorld


class RecordingFixture:
    def __init__(self):
        self.prompts = []

    def complete(self, messages):
        self.prompts.append(messages)
        return FixtureChatModel().complete(messages)


class InvalidFixture:
    def complete(self, messages):
        return '{"supplier": "send_invoice", "reserve_crew": true}'


class FakeHTTPResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, max_bytes):
        return json.dumps(self.payload).encode()


class ModelLabTests(unittest.TestCase):
    def test_parser_accepts_strict_json_and_optional_qwen_thought(self):
        response = '<think>reasoning omitted</think>\n```json\n' + json.dumps({
            "supplier": "economy", "reserve_crew": False,
            "predicted_material_delay": 0.2, "predicted_crew_delay": 0.1,
            "hypothesis": "Need more evidence",
        }) + '\n```'
        decision, p_mat, p_crew, hypothesis = parse_decision(response)
        self.assertEqual(decision.supplier, "economy")
        self.assertFalse(decision.reserve_crew)
        self.assertEqual((p_mat, p_crew), (0.2, 0.1))
        self.assertEqual(hypothesis, "Need more evidence")

    def test_parser_fails_closed_on_broken_or_unsupported_actions(self):
        invalid = [
            'Sure! {"supplier":"economy"}',
            '{"supplier":"send_invoice","reserve_crew":true}',
            '{"supplier":"priority","reserve_crew":"true",'
            '"predicted_material_delay":0.1,"predicted_crew_delay":0.1,"hypothesis":"x"}',
            '{"supplier":"priority","reserve_crew":true,'
            '"predicted_material_delay":NaN,"predicted_crew_delay":0.1,"hypothesis":"x"}',
            '{"supplier":"priority","reserve_crew":true,'
            '"predicted_material_delay":1.1,"predicted_crew_delay":0.1,"hypothesis":"x"}',
        ]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(InvalidModelResponse):
                parse_decision(value)

    def test_agent_gets_only_own_observed_memory(self):
        recording = RecordingFixture()
        agent = ModelDecisionAgent(recording, recent_window=3)
        episode = run_model_episode(315, agent, jobs=12, shift_at=5)
        self.assertEqual(episode.calls, 12)
        initial = json.loads(recording.prompts[0][1]["content"])
        final = json.loads(recording.prompts[-1][1]["content"])
        self.assertEqual(initial["recent_outcomes"], [])
        self.assertEqual(len(final["recent_outcomes"]), 3)
        self.assertEqual(sum(x[0] for x in final["long_term_observation_counts"][
            "material_by_supplier"].values()), 11)
        self.assertNotIn("shift_at", recording.prompts[-1][1]["content"])
        self.assertNotIn("_economy_after", recording.prompts[-1][1]["content"])
        self.assertNotIn("seed", recording.prompts[-1][1]["content"])
        self.assertEqual(len(episode.trace), 12)

    def test_fixture_matches_static_rule_on_identical_random_worlds(self):
        report = benchmark_model(FixtureChatModel(), "fixture", companies=3,
                                 jobs=20, shift_at=8, max_calls=60, fixture=True)
        self.assertEqual(report["cohort"]["inference_calls"], 60)
        self.assertEqual(report["model_policy"]["mean_net_contribution_cents"],
                         report["baselines"]["static_risk_rule"]["mean_net_contribution_cents"])
        self.assertEqual(report["model_policy"]["mean_ontime_rate"],
                         report["baselines"]["static_risk_rule"]["mean_ontime_rate"])
        self.assertFalse(report["controls"]["model_weights_modified"])
        self.assertTrue(report["inference_kind"].startswith("DETERMINISTIC_FIXTURE"))

    def test_invalid_model_action_stops_before_environment_execution(self):
        agent = ModelDecisionAgent(InvalidFixture())
        with patch.object(TradeFlowWorld, "execute", side_effect=AssertionError(
            "environment must not execute")):
            with self.assertRaises(InvalidModelResponse):
                run_model_episode(300, agent)

    def test_explicit_call_budget_must_cover_full_cohort(self):
        with self.assertRaises(ValueError):
            benchmark_model(FixtureChatModel(), "fixture", companies=2,
                            jobs=30, max_calls=40, fixture=True)

    def test_memory_ablation_has_identical_fixture_scores(self):
        fixture = RecordingFixture()
        report = benchmark_model(fixture, "fixture", companies=2, jobs=10,
                                 shift_at=4, max_calls=40, fixture=True,
                                 ablate_memory=True)
        self.assertEqual(report["cohort"]["inference_calls"], 40)
        self.assertEqual(report["no_memory_control"]["paired_contribution_deltas_cents"], [0, 0])
        no_memory_prompt = json.loads(fixture.prompts[20][1]["content"])
        self.assertIsNone(no_memory_prompt["long_term_observation_counts"])
        self.assertEqual(no_memory_prompt["recent_outcomes"], [])
        with self.assertRaises(ValueError):
            benchmark_model(FixtureChatModel(), "fixture", companies=2,
                            jobs=10, max_calls=39, ablate_memory=True, fixture=True)

    def test_provider_sends_bounded_openai_compatible_request(self):
        adapter = CompatibleChatAdapter(InferenceConfig(
            "http://localhost:11434/v1", "qwen-test", max_completion_tokens=256))
        mocked = FakeHTTPResponse({"choices": [{"message": {"content": "AION_OK"}}]})
        with patch("aion_genesis.provider.request.urlopen", return_value=mocked) as call:
            response = adapter.complete([{"role": "user", "content": "Test"}])
        self.assertEqual(response, "AION_OK")
        request = call.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload["max_tokens"], 256)
        self.assertEqual(payload["model"], "qwen-test")
        self.assertTrue(request.full_url.endswith("/chat/completions"))

    def test_cross_model_comparison_rejects_fixture_and_mismatched_cohorts(self):
        a = benchmark_model(FixtureChatModel(), "fixture_a", jobs=10,
                            shift_at=4, max_calls=10, fixture=True)
        b = deepcopy(a)
        b["model"] = "fixture_b"
        with self.assertRaises(ValueError):
            compare_model_reports([a, b])
        comparison = compare_model_reports([a, b], allow_fixture=True)
        self.assertFalse(comparison["automatic_model_promotion"])
        self.assertFalse(comparison["all_candidates_are_real_endpoints"])
        self.assertEqual(comparison["candidates"][1][
            "difference_from_first_model_per_company_cents"], [0])
        b["cohort"]["start_seed"] = 999
        with self.assertRaises(ValueError):
            compare_model_reports([a, b], allow_fixture=True)

    def test_dashboard_escapes_model_statement(self):
        report = benchmark_model(FixtureChatModel(), "fixture", jobs=5,
                                 shift_at=2, max_calls=5, fixture=True)
        report["first_episode_trace"][0]["hypothesis"] = "<script>alert(1)</script>"
        html = render_model_dashboard(report)
        self.assertIn("&lt;script&gt;", html)
        self.assertNotIn("<script>alert", html)
        self.assertIn("NO model inference", html)

    def test_cli_fixture_generates_json_and_mobile_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            output, html = Path(tmp) / "report.json", Path(tmp) / "report.html"
            with contextlib.redirect_stdout(StringIO()):
                main(["model-eval", "--fixture", "--jobs", "6", "--shift-at", "3",
                      "--max-calls", "6", "--output", str(output), "--html", str(html)])
            self.assertEqual(json.loads(output.read_text())["cohort"]["inference_calls"], 6)
            self.assertIn('<meta name="viewport"', html.read_text())


if __name__ == "__main__":
    unittest.main()
