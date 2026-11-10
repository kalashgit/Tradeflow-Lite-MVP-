"""AION Genesis v1.0 laboratory: independence, reproducibility and integrity tests."""

import ast
import contextlib
import copy
from dataclasses import replace
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from aion_genesis.lab import cli
from aion_genesis.lab.hidden import FAMILIES, make_world
from aion_genesis.lab.ledger import Ledger, events, logical_digest, read_ledger, verify_chain
from aion_genesis.lab.observatory import render_observatory
from aion_genesis.lab.policies import RuntimePolicy, build_policy
from aion_genesis.lab.promotion import evaluate_gate
from aion_genesis.lab.protocol import (
    PublicStep, adapters, load_config, protocol_hash, validate_config,
)
from aion_genesis.lab.referee import hindsight_oracle, run_episode
from aion_genesis.lab.runner import run_experiment, summarize
from aion_genesis.lab.scorecard import cluster_bootstrap, proportion
from aion_genesis.lab.validate import ARTIFACTS, file_hash, validate_run
from aion_genesis.runtime import DecisionProposalV1, ObservationV1, OutcomeRecordV1
from aion_genesis.strategic_evaluator import evaluate_strategy

PACKAGE = Path(__file__).resolve().parent.parent / "aion_genesis"
BUDGETS = {"time_budget_ms": 5000, "compute_budget": 64}
SAFETY = {"inadmissible_action", "invalid_evidence", "invalid_proposal", "policy_error"}


def tiny_config(**changes) -> dict:
    config = copy.deepcopy(load_config())
    config["config_version"] = "unit-test"
    config["partitions"] = {"dev": {"start_seed": 500, "episodes": 2},
                            "validation": {"start_seed": 600, "episodes": 2},
                            "holdout": {"start_seed": 700, "episodes": 3}}
    config["promotion_gate"]["bootstrap_resamples"] = 100
    for key, value in changes.items():
        section, _, field = key.partition("__")
        if field:
            config[section][field] = value
        else:
            config[section] = value
    return config


def policy_case(world, state):
    """Build the public case a policy would see at step 0 (test helper)."""
    adapter = next(a for a in adapters() if a.domain_id == world.domain_id)
    step = world.public_step(state, 0)
    latest = {}
    for item in step.observations:
        if item.fact_key not in latest or item.source_revision > latest[
                item.fact_key].source_revision:
            latest[item.fact_key] = item
    usable = [item for item in latest.values() if item.value is not None]
    return adapter.build_case(usable, world.tenant_id, step.scope_id).facts


def quiet(*argv) -> int:
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return cli.main(list(argv))


def play(family, seed, variant, policy):
    world = make_world(family, seed, variant)
    return run_episode(world, policy, "dev", hindsight_oracle(world))


class WorldFamilyTests(unittest.TestCase):
    def test_required_families_with_shift_variants_are_registered(self):
        self.assertLessEqual({"hidden_causal_rules", "resource_allocation",
                              "operational_dependencies", "electrical_procurement"},
                             set(FAMILIES))
        self.assertTrue(FAMILIES["operational_dependencies"].sequential)
        with self.assertRaises(ValueError):
            make_world("made_up_family", 1, "nominal")
        with self.assertRaises(ValueError):
            make_world("resource_allocation", 1, "favourable")

    def test_worlds_publish_valid_observations_and_actions_only(self):
        for family in FAMILIES:
            with self.subTest(family=family):
                world = make_world(family, 512, "nominal")
                state = world.initial_state()
                for step in range(world.horizon):
                    public = world.public_step(state, step)
                    self.assertIsInstance(public, PublicStep)
                    for item in public.observations:
                        self.assertIsInstance(item, ObservationV1)
                        self.assertEqual((item.tenant_id, item.domain_id, item.provenance),
                                         (world.tenant_id, world.domain_id, "synthetic"))
                    options = world.admissible(state, step)
                    self.assertIn(world.baseline_decisions, options)
                    self.assertEqual(len(set(options)), len(options))
                    first = world.transition(state, step, options[-1])
                    self.assertEqual(first, world.transition(state, step, options[-1]))
                    state = world.transition(state, step, world.baseline_decisions)[1]

    def test_shift_is_hidden_and_outcomes_are_stochastic(self):
        for family in FAMILIES:
            with self.subTest(family=family):
                nominal, shifted = (make_world(family, 512, v) for v in ("nominal", "shifted"))
                # A policy cannot read the regime: identical public facts and goals.
                self.assertEqual(
                    [o.to_json() | {"tenant_id": ""} for o in nominal.public_step(
                        nominal.initial_state(), 0).observations],
                    [o.to_json() | {"tenant_id": ""} for o in shifted.public_step(
                        shifted.initial_state(), 0).observations])
                self.assertEqual(nominal.weights, shifted.weights)
                totals = {}
                for variant in ("nominal", "shifted"):
                    for seed in range(500, 530):
                        world = make_world(family, seed, variant)
                        totals[(variant, seed)] = hindsight_oracle(world)
                self.assertGreater(len({totals[("nominal", s)] for s in range(500, 530)}), 5)
                self.assertTrue(any(totals[("nominal", s)] != totals[("shifted", s)]
                                    for s in range(500, 530)))

    def test_partial_observability_and_corrections_appear(self):
        unknown = corrected = 0
        for seed in range(500, 540):
            causal = make_world("hidden_causal_rules", seed, "nominal")
            unknown += sum(o.value is None for o in causal.public_step(None, 0).observations)
            electrical = make_world("electrical_procurement", seed, "nominal")
            corrected += sum(o.corrects_event_id is not None
                             for o in electrical.public_step(None, 0).observations)
        self.assertGreater(unknown, 0)
        self.assertGreater(corrected, 0)


class IndependenceTests(unittest.TestCase):
    FORBIDDEN = ("hidden", "referee", "strategic_evaluator", "scorecard", "promotion",
                 "runner", "validate", "ledger")

    def test_candidate_code_never_imports_hidden_outcomes_or_scoring(self):
        public = [*(PACKAGE / "runtime").glob("*.py"), *(PACKAGE / "domains").glob("*.py"),
                  PACKAGE / "strategic_planner.py", PACKAGE / "situation_engine.py",
                  PACKAGE / "lab" / "policies.py", PACKAGE / "lab" / "protocol.py"]
        self.assertGreater(len(public), 12)
        for path in public:
            for node in ast.walk(ast.parse(path.read_text("utf-8"))):
                names = []
                if isinstance(node, ast.ImportFrom):
                    names = [node.module or "", *(alias.name for alias in node.names)]
                elif isinstance(node, ast.Import):
                    names = [alias.name for alias in node.names]
                for name in names:
                    self.assertFalse(
                        set(name.split(".")) & set(self.FORBIDDEN),
                        f"{path.name} imports judge-side module {name}")

    def test_importing_the_runtime_does_not_load_the_hidden_side(self):
        probe = ("import sys, aion_genesis.runtime, aion_genesis.lab.policies, "
                 "aion_genesis.domains.electrical_runtime; "
                 "bad=[m for m in sys.modules if 'lab.hidden' in m or 'referee' in m "
                 "or 'strategic_evaluator' in m]; print(bad); sys.exit(bool(bad))")
        done = subprocess.run([sys.executable, "-c", probe], cwd=PACKAGE.parent,
                              capture_output=True, text=True)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)

    def test_policy_receives_public_facts_and_its_own_outcome_only(self):
        seen = []

        class Spy(RuntimePolicy):
            def begin(self, tenant_id, domain_id, profile):
                seen.append(("begin", tenant_id, domain_id, profile.to_json()))
                super().begin(tenant_id, domain_id, profile)

            def decide(self, step):
                seen.append(("step", type(step).__name__, sorted(vars(step))))
                return super().decide(step)

            def learn(self, outcome):
                seen.append(("outcome", outcome))
                super().learn(outcome)

        rows, _ = play("hidden_causal_rules", 505, "shifted", Spy("aion_v1_memory", BUDGETS))
        steps = [item for item in seen if item[0] == "step"]
        self.assertEqual(steps[0][1:], ("PublicStep", [
            "as_of", "case_id", "observations", "scope_id", "step"]))
        outcomes = [item[1] for item in seen if item[0] == "outcome"]
        self.assertEqual(len(outcomes), len(rows))
        for outcome, row in zip(outcomes, rows):
            self.assertIsInstance(outcome, OutcomeRecordV1)
            self.assertEqual(outcome.chosen_action_ref, row["applied"])
            self.assertEqual(set(outcome.to_json()) & {
                "oracle_value", "no_action_value", "regret", "harmful", "score"}, set())
        blob = json.dumps([item[3] for item in seen if item[0] == "begin"]) + json.dumps(
            [o.to_json() for o in outcomes])
        for secret in ("shifted", "potency", "oracle", "fragility", "regime"):
            self.assertNotIn(secret, blob)

    def test_memory_off_twin_is_the_frozen_v09_strategist(self):
        report = evaluate_strategy(start_seed=8000, worlds=30, regime="unexpected_failure")
        harmful = 0
        for index, seed in enumerate(range(8000, 8030)):
            rows, _ = play("electrical_procurement", seed, "shifted",
                           build_policy("v09_strategist", BUDGETS))
            harmful += rows[0]["harmful"]
            if index < 10:
                frozen = report["sample_rows"][index]
                self.assertEqual(rows[0]["selected"], frozen["selected"])
                self.assertAlmostEqual(rows[0]["realized_value"],
                                       frozen["selected_actual_value"], places=4)
                self.assertAlmostEqual(rows[0]["oracle_value"],
                                       frozen["oracle_hindsight_value"], places=4)
                self.assertAlmostEqual(rows[0]["no_action_value"],
                                       frozen["baseline_actual_value"], places=4)
        self.assertAlmostEqual(harmful / 30, report["fraction_planner_worse_than_baseline"],
                               places=4)


class InvalidCandidateTests(unittest.TestCase):
    def contained(self, mutate, expected):
        class Forger(RuntimePolicy):
            def decide(self, step):
                return mutate(super().decide(step))

        policy = Forger("v09_strategist", BUDGETS)
        rows, episode = play("electrical_procurement", 507, "nominal", policy)
        safe, reference = play("electrical_procurement", 507, "nominal",
                               build_policy("no_action", BUDGETS))
        for row in rows:
            self.assertIn(expected, row["failure_classes"])
            self.assertEqual(row["applied"], "wait|hold|quiet")
        self.assertEqual(episode["episode_value"], reference["episode_value"])
        return rows, episode

    def test_fabricated_evidence_is_rejected(self):
        rows, _ = self.contained(lambda p: replace(p, evidence_refs=(
            {"event_id": "EV-INVENTED", "source_revision": 1, "observed_at": 1},)),
            "invalid_evidence")
        self.assertFalse(any(row["evidence_valid"] for row in rows))
        self.contained(lambda p: replace(p, evidence_refs=()), "invalid_evidence")
        self.contained(lambda p: replace(p, evidence_refs=tuple(
            {**ref, "source_revision": ref["source_revision"] + 5}
            for ref in p.evidence_refs)), "invalid_evidence")

    def test_inadmissible_and_malformed_actions_are_rejected(self):
        self.contained(lambda p: replace(p, selected_option={
            **p.selected_option, "decisions": [["supply", "teleport_materials"],
                                               ["crew", "hold"], ["customer", "quiet"]]}),
            "inadmissible_action")
        self.contained(lambda p: replace(p, selected_option={"identifier": "no decisions"}),
                       "invalid_proposal")
        self.contained(lambda p: replace(p, tenant_id="T-SOMEONE-ELSE"), "invalid_proposal")
        self.contained(lambda p: {"selected": "wait|hold|quiet", "score": 10**9},
                       "invalid_proposal")

    def test_crashing_candidate_is_recorded_not_hidden(self):
        def explode(_):
            raise RuntimeError("candidate bug")

        _, episode = self.contained(explode, "policy_error")
        self.assertEqual(episode["error_types"], ["RuntimeError"])

    def test_spending_over_the_owner_bound_is_inadmissible(self):
        for family in FAMILIES:
            world = make_world(family, 507, "nominal")
            state = world.initial_state()
            facts = policy_case(world, state)
            options = world.admissible(state, 0)
            self.assertTrue(options)
            assessed = [world.pack.assess(facts, decisions) for decisions in options]
            # With unknown preconditions a policy can assess fewer options than
            # the world admits, never more expensive ones.
            self.assertTrue(any(option is not None for option in assessed))
            for option in assessed:
                if option is not None:
                    self.assertLessEqual(option.estimated_spend, world.max_spend)


class ExperimentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = tiny_config()
        cls.result, cls.ledger = run_experiment(cls.config, ("dev", "holdout"))

    def test_same_run_reproduces_and_other_seeds_differ(self):
        again, ledger = run_experiment(self.config, ("dev", "holdout"))
        self.assertEqual(again["logical_digest"], self.result["logical_digest"])
        self.assertEqual(again["partitions"], self.result["partitions"])
        self.assertNotEqual(ledger.records[0]["event"]["run_id"],
                            self.ledger.records[0]["event"]["run_id"])
        moved = tiny_config()
        moved["partitions"]["dev"]["start_seed"] = 510
        other, _ = run_experiment(moved, ("dev", "holdout"))
        self.assertNotEqual(other["logical_digest"], self.result["logical_digest"])
        dev = lambda r: r["partitions"]["dev"]["scorecard"]["decision_quality"]  # noqa: E731
        self.assertNotEqual(dev(other), dev(self.result))

    def test_summary_is_a_pure_function_of_the_ledger(self):
        self.assertEqual(summarize(self.ledger.records), self.result)
        self.assertEqual(verify_chain(self.ledger.records), [])
        self.assertEqual(logical_digest(self.ledger.records), self.result["logical_digest"])

    def test_scorecard_carries_counts_intervals_and_explicit_gaps(self):
        card = self.result["partitions"]["holdout"]["scorecard"]
        self.assertEqual(card["evidence_tier"], "synthetic_simulation")
        self.assertNotIn("operational_dependencies",
                         card["families_with_per_decision_counterfactuals"])
        for family in self.config["families"]:
            for variant in ("nominal", "shifted"):
                quiet = card["decision_quality"][family][variant]["no_action"]
                self.assertEqual(quiet["episode_worse_than_no_action"]["numerator"], 0)
                self.assertEqual(quiet["safety_failures"], 0)
                mine = card["decision_quality"][family][variant]["aion_v1_memory"]
                self.assertEqual(mine["episodes"], 3)
                self.assertEqual(mine["model_calls"], 0)
                self.assertEqual(mine["mean_episode_utility"]["n"], 3)
                harm = mine["harmful_choice"]
                if family == "operational_dependencies":
                    self.assertEqual(harm["status"], "not_measured")
                else:
                    self.assertEqual(harm["denominator"], 18)
                    self.assertLessEqual(harm["ci95"][0], harm["rate"])
        pooled = card["comparisons"]["candidate_vs_baseline"]["pooled"]["shifted"]
        self.assertEqual(pooled["harmful_choice_rate_delta"]["first"]["denominator"], 54)
        self.assertEqual(pooled["paired_mean_episode_utility_delta"]["status"],
                         "not_measured")
        learning = card["learning_gain"]
        self.assertEqual((learning["memory_on"], learning["memory_off"]),
                         ("aion_v1_memory", "v09_strategist"))
        self.assertEqual(learning["by_step"]["hidden_causal_rules"]["shifted"][0][
            "mean_utility_delta"], 0.0)  # both twins start with empty memory
        self.assertEqual(learning["forgetting"]["status"], "not_measured")
        for name in ("option_discovery", "proactivity", "product_value"):
            self.assertEqual(self.result["not_measured"][name]["status"], "not_measured")
        throughput = self.result["research_throughput"]
        self.assertEqual(throughput["throughput_multiplier"]["status"], "not_measured")
        self.assertEqual(throughput["human_review_hours"]["status"], "not_measured")
        self.assertEqual(self.result["speed_economics"]["tokens"]["status"], "not_measured")
        self.assertEqual(self.result["labels"]["model_inference_calls"], 0)
        self.assertFalse(self.result["labels"]["real_world_improvement_proven"])

    def test_every_candidate_proposal_stays_reviewable_and_grounded(self):
        decisions = events(self.ledger.records, "decision")
        self.assertEqual(len(decisions), self.result["speed_economics"]["decisions"])
        for row in decisions:
            self.assertFalse(SAFETY & set(row["failure_classes"]))
            if row["policy"] != "no_action" and not row["abstained"]:
                self.assertTrue(row["evidence_valid"])
                self.assertGreater(row["evidence_refs"], 0)
        self.assertTrue(any(row["abstained"] for row in decisions))
        self.assertEqual({row["route"] for row in decisions if row["policy"] == "fixed_rule"
                          and not row["abstained"]}, {"deterministic_fast_path"})
        self.assertTrue(any(row["memory_version"] for row in decisions
                            if row["policy"] == "aion_v1_memory"))
        self.assertFalse(any(row["memory_version"] for row in decisions
                             if row["policy"] == "v09_strategist"))

    def test_verdict_comes_only_from_the_protected_holdout(self):
        self.assertTrue(self.result["partitions"]["holdout"]["gate"]["decisive"])
        self.assertFalse(self.result["partitions"]["dev"]["gate"]["decisive"])
        self.assertEqual(self.result["verdict"],
                         self.result["partitions"]["holdout"]["gate"]["verdict"])
        only_dev, _ = run_experiment(self.config, ("dev",))
        self.assertEqual(only_dev["verdict"], "INCONCLUSIVE")
        self.assertIn("holdout not evaluated", only_dev["verdict_basis"])
        for part in self.result["partitions"].values():
            self.assertFalse(part["gate"]["promoted"])
            self.assertTrue(part["gate"]["human_review_required"])
            self.assertFalse(part["gate"]["candidate_can_change_rules"])

    def test_exhausted_budget_blocks_instead_of_reporting_a_partial_win(self):
        starved = tiny_config(budgets__max_decisions=150)
        result, ledger = run_experiment(starved, ("holdout",))
        self.assertEqual(result["status"], "budget_exhausted")
        self.assertEqual(result["verdict"], "BLOCKED")
        self.assertLessEqual(result["speed_economics"]["decisions"], 150)
        counts = {}
        for episode in events(ledger.records, "episode"):
            key = (episode["family"], episode["variant"], episode["seed"])
            counts[key] = counts.get(key, 0) + 1
        self.assertEqual(set(counts.values()), {4})  # whole matched groups only

    def test_holdout_cannot_be_rescored_under_changed_rules(self):
        history = [{"partitions": ["holdout"], "protocol_hash": protocol_hash(self.config),
                    "holdout_seeds": self.config["partitions"]["holdout"]}]
        same, _ = run_experiment(self.config, ("holdout",), history=history)
        self.assertNotEqual(same["verdict"], "BLOCKED")
        relaxed = tiny_config(promotion_gate__min_relative_harm_reduction_shifted=0.01)
        blocked, _ = run_experiment(relaxed, ("holdout",), history=history)
        self.assertEqual(blocked["verdict"], "BLOCKED")
        check = next(c for c in blocked["partitions"]["holdout"]["gate"]["checks"]
                     if c["name"] == "holdout_protocol_integrity")
        self.assertEqual(check["status"], "BLOCKED")
        fresh, _ = run_experiment(relaxed, ("dev",), history=history)
        self.assertNotEqual(fresh["verdict"], "BLOCKED")

    def test_config_contract_rejects_weakened_experiments(self):
        validate_config(tiny_config())
        broken = [
            tiny_config(budgets__max_model_calls=5),
            tiny_config(promotion_gate__partition="dev"),
            tiny_config(promotion_gate__min_relative_harm_reduction_shifted=0),
            tiny_config(policies=["no_action", "aion_v1_memory"]),
            tiny_config(policies=["fixed_rule", "v09_strategist", "aion_v1_memory"]),
            tiny_config(baseline="aion_v1_memory"),
            tiny_config(variants=["nominal"]),
            tiny_config(partitions={"dev": {"start_seed": 500, "episodes": 2},
                                    "validation": {"start_seed": 501, "episodes": 2},
                                    "holdout": {"start_seed": 700, "episodes": 3}}),
            tiny_config(partitions={"dev": {"start_seed": 500, "episodes": 2},
                                    "validation": {"start_seed": 600, "episodes": 2},
                                    "holdout": {"start_seed": 8100, "episodes": 3}}),
            {**tiny_config(), "grader_override": "lenient"},
        ]
        for config in broken:
            with self.assertRaises(ValueError):
                validate_config(config)
        with self.assertRaises(ValueError):
            run_experiment(tiny_config(families=["invented_world"]), ("dev",))
        with self.assertRaises(ValueError):
            run_experiment(tiny_config(), ("dev", "dev"))


def scorecard(candidate=(10, 100), baseline=(30, 100), interval=(-0.3, -0.1), drop=0.0,
              shifted_ci=(-1.0, 3.0), safety=0):
    def policy(mean, harm):
        return {"mean_episode_utility": {"value": mean}, "safety_failures": safety,
                "harmful_choice": proportion(*harm)}

    rate = lambda pair: pair[0] / pair[1]  # noqa: E731
    harm = {"first": proportion(*candidate), "second": proportion(*baseline),
            "value": rate(candidate) - rate(baseline),
            "ci95": None if interval is None else list(interval),
            "relative_reduction": None if baseline[0] == 0
            else (rate(baseline) - rate(candidate)) / rate(baseline)}
    delta = {"paired_mean_episode_utility_delta": {
        "value": 1.0, "ci95": None if shifted_ci is None else list(shifted_ci)}}
    return {
        "partition": "holdout",
        "decision_quality": {"world": {
            "nominal": {"aion_v1_memory": policy(20.0 - drop, candidate),
                        "v09_strategist": policy(20.0, baseline)},
            "shifted": {"aion_v1_memory": policy(5.0, candidate),
                        "v09_strategist": policy(4.0, baseline)}}},
        "comparisons": {"candidate_vs_baseline": {
            "world": {"nominal": delta, "shifted": delta},
            "pooled": {"shifted": {"harmful_choice_rate_delta": harm}}}},
    }


class PromotionGateTests(unittest.TestCase):
    CONFIG = {**tiny_config(), "families": ["world"]}

    def verdict(self, card, status="completed", conflict=False):
        gate = evaluate_gate(card, self.CONFIG, run_status=status,
                             protocol_conflict=conflict)
        return gate["verdict"], {c["name"]: c["status"] for c in gate["checks"]}, gate

    def test_pass_requires_every_prespecified_check(self):
        verdict, checks, gate = self.verdict(scorecard())
        self.assertEqual(verdict, "PASS")
        self.assertEqual(set(checks.values()), {"PASS"})
        self.assertEqual(gate["decision"], "eligible_for_human_review")
        self.assertFalse(gate["promoted"])

    def test_fail_conditions(self):
        small = self.verdict(scorecard(candidate=(28, 100)))
        self.assertEqual((small[0], small[1]["shifted_harm_reduction"]), ("FAIL", "FAIL"))
        costly = self.verdict(scorecard(drop=1.5))
        self.assertEqual((costly[0], costly[1]["nominal_utility_preserved"]),
                         ("FAIL", "FAIL"))
        self.assertEqual(self.verdict(scorecard(drop=0.9))[0], "PASS")
        unsafe = self.verdict(scorecard(safety=1))
        self.assertEqual((unsafe[0], unsafe[1]["safety"]), ("FAIL", "FAIL"))
        regress = self.verdict(scorecard(shifted_ci=(-4.0, -0.5)))
        self.assertEqual((regress[0], regress[1]["no_family_regression_shifted"]),
                         ("FAIL", "FAIL"))

    def test_inconclusive_when_the_interval_cannot_exclude_zero(self):
        self.assertEqual(self.verdict(scorecard(interval=(-0.3, 0.02)))[0], "INCONCLUSIVE")
        self.assertEqual(self.verdict(scorecard(interval=None))[0], "INCONCLUSIVE")
        self.assertEqual(self.verdict(scorecard(candidate=(0, 100), baseline=(0, 100)))[0],
                         "INCONCLUSIVE")

    def test_blocked_overrides_everything(self):
        self.assertEqual(self.verdict(scorecard(), status="budget_exhausted")[0], "BLOCKED")
        self.assertEqual(self.verdict(scorecard(), conflict=True)[0], "BLOCKED")
        self.assertEqual(self.verdict(scorecard(safety=3), conflict=True)[0], "BLOCKED")

    def test_statistics_helpers(self):
        self.assertEqual(proportion(0, 0)["rate"], None)
        self.assertEqual(proportion(5, 50)["rate"], 0.1)
        self.assertLess(proportion(5, 50)["ci95"][0], 0.1)
        pairs = [(-1, 6)] * 30 + [(0, 6)] * 10
        low, high = cluster_bootstrap(pairs, 200, "label")
        self.assertLess(high, 0)
        self.assertEqual(cluster_bootstrap(pairs, 200, "label"), [low, high])
        self.assertIsNone(cluster_bootstrap(pairs[:1], 200, "label"))


class ReportIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.root = Path(cls.folder.name)
        cls.config_path = cls.root / "config.json"
        cls.config_path.write_text(json.dumps(tiny_config()), encoding="utf-8")
        cls.lab = cls.root / "lab"
        cls.code = quiet("run", "--out", str(cls.lab), "--config", str(cls.config_path),
                         "--partitions", "validation", "holdout")
        cls.run_dir = next((cls.lab / "runs").iterdir())

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def clone(self) -> Path:
        target = Path(tempfile.mkdtemp(dir=self.root))
        shutil.copytree(self.run_dir, target / "run")
        return target / "run"

    @staticmethod
    def reseal(run: Path, records=None, rebuild=False):
        """What a careful forger would do: fix the chain, result, report and manifest."""
        if records is not None:
            ledger = Ledger()
            for record in records:
                ledger.append(record["event"])
            if rebuild:
                end = ledger.records[-1]["event"]
                end["logical_digest"] = logical_digest(ledger.records)
                sealed = Ledger()
                for record in ledger.records:
                    sealed.append(record["event"])
                ledger = sealed
            ledger.write(run / "ledger.jsonl")
            if rebuild:
                result = summarize(ledger.records)
                (run / "result.json").write_text(json.dumps(result), encoding="utf-8")
                (run / "report.html").write_text(
                    render_observatory(result, ledger.records), encoding="utf-8")
        (run / "manifest.json").write_text(json.dumps({"sha256": {
            name: file_hash(run / name) for name in ARTIFACTS}}), encoding="utf-8")

    def test_cli_produces_ledger_result_and_phone_readable_report(self):
        self.assertEqual(self.code, 0)
        for name in (*ARTIFACTS, "manifest.json"):
            self.assertTrue((self.run_dir / name).is_file())
        html = (self.run_dir / "report.html").read_text("utf-8")
        result = json.loads((self.run_dir / "result.json").read_text("utf-8"))
        self.assertIn('name="viewport" content="width=device-width', html)
        self.assertEqual(html.count("data-verdict="), 1)
        self.assertIn(f'data-verdict="{result["verdict"]}"', html)
        self.assertIn("SYNTHETIC SIMULATION ONLY", html)
        self.assertNotIn("<script", html)
        self.assertNotIn("http://", html.replace("http://www.w3.org", ""))
        self.assertIn(result["verdict"], ("PASS", "FAIL", "INCONCLUSIVE", "BLOCKED"))
        self.assertEqual(result["run"]["schema"], "ExperimentRunV1/1.0")
        index = [json.loads(line) for line in
                 (self.lab / "index.jsonl").read_text("utf-8").splitlines()]
        self.assertEqual(index[-1]["logical_digest"], result["logical_digest"])

    def test_independent_validation_and_reproduction_accept_an_honest_run(self):
        report = validate_run(self.run_dir, reproduce=True)
        self.assertEqual(report["problems"], [])
        self.assertTrue(report["valid"])
        self.assertTrue(report["reproduced"])
        self.assertEqual(quiet("validate", "--out", str(self.lab)), 0)
        self.assertEqual(quiet("validate", "--out", str(self.run_dir), "--expect-digest",
                               "0" * 64), 1)
        self.assertEqual(quiet("report", "--out", str(self.lab), "--html",
                               str(self.root / "again.html")), 0)

    def test_edited_ledger_row_breaks_the_chain(self):
        run = self.clone()
        records = read_ledger(run / "ledger.jsonl")
        target = next(r for r in records if r["event"].get("type") == "decision"
                      and r["event"]["policy"] == "aion_v1_memory")
        target["event"]["realized_value"] += 50
        (run / "ledger.jsonl").write_text(
            "\n".join(json.dumps(r, sort_keys=True, separators=(",", ":"))
                      for r in records) + "\n", encoding="utf-8")
        self.reseal(run)
        report = validate_run(run)
        self.assertFalse(report["valid"])
        self.assertEqual(report["checks"]["ledger_hash_chain"], "failed")

    def test_rechained_ledger_no_longer_matches_the_reported_result(self):
        run = self.clone()
        records = read_ledger(run / "ledger.jsonl")
        for record in records:
            event = record["event"]
            if event.get("type") == "decision" and event["policy"] == "aion_v1_memory":
                event["harmful"] = False if event["harmful"] is not None else None
        self.reseal(run, records)
        report = validate_run(run)
        self.assertFalse(report["valid"])
        self.assertEqual(report["checks"]["ledger_hash_chain"], "ok")
        self.assertEqual(report["checks"]["logical_digest"], "failed")

    def test_fully_consistent_forgery_is_caught_by_reproduction(self):
        run = self.clone()
        records = read_ledger(run / "ledger.jsonl")
        for record in records:
            event = record["event"]
            if event.get("type") == "decision" and event["policy"] == "aion_v1_memory":
                if event["harmful"]:
                    event["harmful"] = False
                    event["failure_classes"] = [
                        f for f in event["failure_classes"] if f != "harmful_choice"]
        self.reseal(run, records, rebuild=True)
        self.assertTrue(validate_run(run)["valid"])  # internally consistent
        report = validate_run(run, reproduce=True)
        self.assertFalse(report["valid"])
        self.assertFalse(report["reproduced"])
        self.assertEqual(report["checks"]["independent_reproduction"], "failed")

    def test_edited_verdict_or_report_label_is_rejected(self):
        run = self.clone()
        result = json.loads((run / "result.json").read_text("utf-8"))
        result["verdict"] = result["run"]["verdict"] = "PASS"
        result["partitions"]["holdout"]["gate"]["verdict"] = "PASS"
        (run / "result.json").write_text(json.dumps(result), encoding="utf-8")
        self.reseal(run)
        if json.loads((self.run_dir / "result.json").read_text("utf-8"))["verdict"] != "PASS":
            report = validate_run(run)
            self.assertFalse(report["valid"])
            self.assertEqual(report["checks"]["ledger_recomputation"], "failed")
        run = self.clone()
        html = (run / "report.html").read_text("utf-8")
        actual = json.loads((run / "result.json").read_text("utf-8"))["verdict"]
        fake = "FAIL" if actual == "PASS" else "PASS"
        (run / "report.html").write_text(
            html.replace(f'data-verdict="{actual}"', f'data-verdict="{fake}"'),
            encoding="utf-8")
        self.reseal(run)
        report = validate_run(run)
        self.assertFalse(report["valid"])
        self.assertEqual(report["checks"]["report_integrity"], "failed")
        run = self.clone()
        with (run / "report.html").open("a", encoding="utf-8") as handle:
            handle.write("<!-- edited after the fact -->")
        self.assertEqual(validate_run(run)["checks"]["artifact_hashes"], "failed")

    def test_dropping_unfavourable_episodes_is_rejected(self):
        run = self.clone()
        records = read_ledger(run / "ledger.jsonl")
        worst = min((r["event"] for r in records if r["event"].get("type") == "episode"
                     and r["event"]["policy"] == "aion_v1_memory"),
                    key=lambda e: e["episode_value"])
        key = (worst["partition"], worst["family"], worst["variant"], worst["seed"])
        kept = [r for r in records if r["event"].get("type") not in ("decision", "episode")
                or (r["event"]["partition"], r["event"]["family"], r["event"]["variant"],
                    r["event"]["seed"]) != key]
        self.assertLess(len(kept), len(records))
        self.reseal(run, kept, rebuild=True)
        report = validate_run(run)
        self.assertFalse(report["valid"])
        self.assertEqual(report["checks"]["matched_design_complete"], "failed")

    def test_missing_artifacts_and_garbage_are_rejected(self):
        run = self.clone()
        (run / "ledger.jsonl").unlink()
        self.assertFalse(validate_run(run)["valid"])
        run = self.clone()
        (run / "result.json").write_text("{not json", encoding="utf-8")
        self.assertFalse(validate_run(run)["valid"])
        self.assertIsInstance(DecisionProposalV1, type)


if __name__ == "__main__":
    unittest.main()
