import contextlib
from io import StringIO
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from aion_genesis.cli import main
from aion_genesis.dashboard import render_tournament_dashboard
from aion_genesis.tournament import (
    Candidate, TournamentConfigurationError,
    parse_candidates, run_tournament,
)


FIXTURE_CANDIDATES = [
    Candidate("static_fixture", "fixture_static"),
    Candidate("cheap_fixture", "fixture_cost_first"),
]


class TournamentTests(unittest.TestCase):
    def test_fixture_tournament_has_locked_pilot_holdout_and_memory_ablation(self):
        result = run_tournament(FIXTURE_CANDIDATES, "fixture", jobs=8,
                                shift_at=3, max_total_calls=66,
                                ablate_memory=True)
        self.assertEqual(result["status"], "complete_fixture_wiring")
        self.assertEqual(result["attempted_calls"], 66)
        self.assertEqual(result["environment_status"], "fixture_transport_only")
        self.assertEqual(len(result["holdout_comparison"]["candidates"]), 2)
        self.assertFalse(result["holdout_comparison"]["all_candidates_are_real_endpoints"])
        self.assertFalse(result["automatic_model_promotion"])
        static, cheap = result["candidate_results"]
        self.assertEqual(static["pilot"]["model_policy"]["mean_net_contribution_cents"],
                         static["pilot"]["baselines"]["static_risk_rule"][
                             "mean_net_contribution_cents"])
        self.assertEqual(cheap["holdout"]["model_policy"]["mean_net_contribution_cents"],
                         cheap["holdout"]["baselines"]["cost_first"][
                             "mean_net_contribution_cents"])
        for entry in (static, cheap):
            for phase in ("pilot", "holdout"):
                self.assertEqual(entry[phase]["no_memory_control"][
                    "paired_contribution_deltas_cents"], [0])

    def test_budget_and_seed_overlap_rejected_before_any_model_calls(self):
        with self.assertRaises(TournamentConfigurationError):
            run_tournament(FIXTURE_CANDIDATES, "fixture", max_total_calls=65,
                           ablate_memory=True)
        with self.assertRaises(TournamentConfigurationError):
            run_tournament(FIXTURE_CANDIDATES, "fixture", pilot_seed=9,
                           holdout_seed=9, max_total_calls=66, ablate_memory=True)
        with self.assertRaises(TournamentConfigurationError):
            run_tournament(FIXTURE_CANDIDATES, "live", max_total_calls=66,
                           ablate_memory=True)

    def test_manifest_rejects_embedded_secrets_and_mixed_candidates(self):
        raw = {"schema": 1, "candidates": [
            {"id": "a", "kind": "fixture_static"},
            {"id": "b", "kind": "fixture_cost_first", "api_key": "DO_NOT_COPY"}]}
        with self.assertRaises(TournamentConfigurationError):
            parse_candidates(raw, "fixture")
        raw["candidates"][1] = {"id": "b", "kind": "compatible",
                                 "base_url_env": "AION_URL", "model_env": "AION_MODEL"}
        with self.assertRaises(TournamentConfigurationError):
            parse_candidates(raw, "live")

    def test_live_tournament_missing_config_fails_without_inference_calls(self):
        candidates = [Candidate("a", "compatible", "AION_ABSENT_URL_1", "AION_ABSENT_MODEL_1"),
                      Candidate("b", "compatible", "AION_ABSENT_URL_2", "AION_ABSENT_MODEL_2")]
        with patch.dict(os.environ, {}, clear=True):
            report = run_tournament(candidates, "live", max_total_calls=34,
                                    ablate_memory=False)
        self.assertEqual(report["status"], "blocked_configuration")
        self.assertEqual(report["attempted_calls"], 0)
        self.assertEqual(report["candidate_results"], [])
        self.assertNotIn("holdout_comparison", report)
        self.assertFalse(report["automatic_model_promotion"])

    def test_candidate_runtime_failure_blocks_model_comparison(self):
        class Broken:
            def complete(self, messages):
                raise RuntimeError("SECRET should not be printed")

        def fake_resolve(candidate):
            if candidate.identifier == "static_fixture":
                return Broken(), "broken"
            from aion_genesis.model_lab import CostFirstFixtureModel
            return CostFirstFixtureModel(), "cost_fixture"

        with patch("aion_genesis.tournament.resolve_candidate", side_effect=fake_resolve):
            result = run_tournament(FIXTURE_CANDIDATES, "fixture", max_total_calls=66,
                                    ablate_memory=True)
        self.assertEqual(result["status"], "incomplete")
        self.assertNotIn("holdout_comparison", result)
        self.assertEqual(result["failures"][0]["stage"], "preflight")
        self.assertNotIn("SECRET", json.dumps(result))

    def test_tournament_dashboard_works_for_both_complete_and_blocked(self):
        complete = run_tournament(FIXTURE_CANDIDATES, "fixture", max_total_calls=34,
                                  ablate_memory=False)
        html = render_tournament_dashboard(complete)
        self.assertIn('name="viewport"', html)
        self.assertIn("SCRIPTED FIXTURES", html)
        self.assertIn("Holdout memory benefit", html)
        blocked = dict(complete, status="blocked_configuration", candidate_results=[],
                       failures=[{"stage": "configuration", "error_type": "Missing"}])
        self.assertIn("No candidate was evaluated", render_tournament_dashboard(blocked))

    def test_cli_can_run_full_fixture_tournament(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            config = path / "config.json"
            # Test config is generated from immutable test data.
            config.write_text(json.dumps({"schema": 1, "candidates": [
                {"id": "static_fixture", "kind": "fixture_static"},
                {"id": "cheap_fixture", "kind": "fixture_cost_first"}]}))
            output, html = path / "result.json", path / "view.html"
            with contextlib.redirect_stdout(StringIO()):
                main(["tournament", "--config", str(config), "--fixture",
                      "--max-total-calls", "34", "--output", str(output),
                      "--html", str(html)])
            self.assertEqual(json.loads(output.read_text())["status"],
                             "complete_fixture_wiring")
            self.assertIn("model tournament", html.read_text().lower())

    def test_cli_live_missing_endpoint_returns_nonzero_and_saves_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            manifest = path / "models.json"
            manifest.write_text(json.dumps({"schema": 1, "candidates": [
                {"id": "a", "kind": "compatible", "base_url_env": "AION_MISSING_URL_A",
                 "model_env": "AION_MISSING_MODEL_A"},
                {"id": "b", "kind": "compatible", "base_url_env": "AION_MISSING_URL_B",
                 "model_env": "AION_MISSING_MODEL_B"}]}))
            report = path / "failed.json"
            with patch.dict(os.environ, {}, clear=True):
                with contextlib.redirect_stdout(StringIO()):
                    with self.assertRaises(SystemExit) as exit_state:
                        main(["tournament", "--config", str(manifest), "--live",
                              "--max-total-calls", "66", "--ablate-memory",
                              "--output", str(report)])
            self.assertEqual(exit_state.exception.code, 2)
            self.assertEqual(json.loads(report.read_text())["attempted_calls"], 0)


if __name__ == "__main__":
    unittest.main()
