"""ASIL v2.5: routing, memory hygiene, safety boundaries and reproducibility."""

import ast
import copy
import json
from pathlib import Path
import tempfile
import unittest

from aion_genesis.asil import (
    ABSTAIN, DEEP, FAST, REFLEX, AdaptiveStrategyLearner, CausalOutcomeVerifier,
    ConfidenceCalibrator, IntuitionMemory, MetacognitiveRouter, Option, RouterConfig,
    StrategicContextRecognizer,
)
from aion_genesis.eval_v2 import asil_runner
from aion_genesis.eval_v2.asil_policy import AsilCausalPolicy, TransitionModel
from aion_genesis.eval_v2.causal_world import TOOLS, World, generate

PACKAGE = Path(__file__).resolve().parent.parent / "aion_genesis"
SCOPE = "SYN-ASIL-TEST"
RECOGNIZER = StrategicContextRecognizer(("stage", "funding"))


def context(action="order_material", **features):
    base = {"stage": "unplaced", "funding": "full", "blocker": "none"}
    base.update(features)
    return RECOGNIZER.recognise(action, base)


def record(ctx, outcome, episode=0, **extra):
    return {"scope": SCOPE, "action": ctx.action, "tokens": ctx.tokens,
            "core_tokens": ctx.core_tokens, "outcome": outcome, "verified": True,
            "episode": episode, "route": "deep", "expected": 0.6,
            "evidence_ref": "SYN-PROPOSAL-x", **extra}


def memory_with(ctx, wins, losses, episode=0, config=None):
    memory = IntuitionMemory(SCOPE, config or RouterConfig())
    for outcome, count in ((1, wins), (0, losses)):
        for _ in range(count):
            memory.append(record(ctx, outcome, episode))
    return memory


def option(ctx, stake=0.0, name="OPT"):
    return Option(name, ctx, stake, stake == 0, 1.0)


class IntuitionMemoryTests(unittest.TestCase):
    def test_only_abstract_tokens_and_verified_outcomes_are_stored(self):
        memory = IntuitionMemory(SCOPE)
        with self.assertRaises(ValueError):   # identifiers and amounts cannot enter
            RECOGNIZER.recognise("order_material", {"job": "JOB-830000-1"})
        with self.assertRaises(ValueError):
            RECOGNIZER.recognise("order_material", {"cash": "1,250.00"})
        good = context()
        with self.assertRaises(ValueError):
            memory.append({**record(good, 1), "verified": False})
        with self.assertRaises(ValueError):
            memory.append({**record(good, 1), "outcome": 0.7})
        with self.assertRaises(PermissionError):
            memory.append({**record(good, 1), "scope": "SYN-OTHER-TENANT"})
        self.assertEqual(memory.version, 0)
        memory.append(record(good, 1))
        self.assertNotIn("JOB-", json.dumps(memory.to_json()))

    def test_learning_is_reversible_traceable_and_freezable(self):
        ctx = context()
        memory = memory_with(ctx, 6, 0)
        before = memory.digest()
        for _ in range(6):
            memory.append(record(ctx, 0, confounders=["disputed"]))
        self.assertLess(memory.recall(ctx, 0).mean, 0.9)
        memory.rollback(6)
        self.assertEqual(memory.digest(), before)
        self.assertGreater(memory.recall(ctx, 0).lower, 0.7)
        restored = IntuitionMemory.from_json(memory.to_json())
        self.assertEqual(restored.digest(), before)
        memory.frozen = True
        with self.assertRaises(PermissionError):
            memory.append(record(ctx, 1))
        with self.assertRaises(ValueError):
            memory.rollback(0)
        self.assertTrue(all(r["evidence_ref"] for r in memory.records()))

    def test_stale_and_confounded_evidence_counts_for_less(self):
        ctx = context()
        fresh = memory_with(ctx, 8, 0).recall(ctx, 0)
        stale = memory_with(ctx, 8, 0).recall(ctx, 400)
        self.assertGreater(fresh.support, 7.9)
        self.assertLess(stale.support, 0.1)
        self.assertLess(stale.lower, 0.7)
        memory = IntuitionMemory(SCOPE)
        for _ in range(8):
            memory.append(record(ctx, 0, confounders=["delivery_delayed"]))
        self.assertEqual(memory.recall(ctx, 0).support, 4.0)

    def test_calibrator_scores_confidence_against_outcomes(self):
        perfect = ConfidenceCalibrator.score([(0.9, 1)] * 9 + [(0.9, 0)])
        self.assertEqual(perfect["ece"], 0.0)
        over = ConfidenceCalibrator.score([(0.9, 0)] * 10)
        self.assertEqual(over["ece"], 0.9)
        self.assertIsNone(ConfidenceCalibrator.score([])["ece"])
        mean, low, high = ConfidenceCalibrator.estimate(0, 0)
        self.assertEqual((mean, low < 0.2, high > 0.8), (0.5, True, True))


class RouterTests(unittest.TestCase):
    def route(self, options, memory, budget=5, **kwargs):
        return MetacognitiveRouter(RouterConfig(), **kwargs).route(
            options, memory, 0, budget)

    def test_strong_fresh_verified_experience_takes_the_fast_path(self):
        ctx = context("assign_crew", stage="ready")
        decision = self.route([option(ctx)], memory_with(ctx, 12, 0))
        self.assertEqual((decision.route, decision.selected), (FAST, "OPT"))
        self.assertGreater(decision.confidence, 0.9)

    def test_familiarity_is_not_correctness(self):
        seen = context(funding="full")
        lookalike = context(funding="thin")          # same stage, different situation
        memory = memory_with(seen, 30, 0)
        recall = memory.recall(lookalike, 0)
        self.assertEqual(recall.match, "none")
        partial = RECOGNIZER.recognise("order_material", {
            "stage": "unplaced", "funding": "full", "blocker": "active"})
        self.assertEqual(memory.recall(partial, 0).match, "partial")
        for ctx in (lookalike, partial):   # resemblance never authorises a fast action
            self.assertEqual(self.route([option(ctx, 0.4)], memory).route, DEEP)
        thin = memory_with(seen, 2, 0)     # too little evidence
        self.assertEqual(self.route([option(seen)], thin).route, DEEP)

    def test_contradicted_or_high_stakes_contexts_are_investigated(self):
        ctx = context()
        memory = memory_with(ctx, 14, 0)
        for _ in range(6):
            memory.append(record(ctx, 0))
        self.assertTrue(memory.recall(ctx, 0).contradicted)
        self.assertEqual(self.route([option(ctx)], memory).route, DEEP)
        middling = memory_with(ctx, 9, 1)   # lower bound between 0.7 and 0.8
        bound = middling.recall(ctx, 0).lower
        self.assertTrue(0.7 <= bound < 0.8, bound)
        self.assertEqual(self.route([option(ctx, 0.0)], middling).route, FAST)
        self.assertEqual(self.route([option(ctx, 0.6)], middling).route, DEEP)

    def test_abstention_reflex_and_budget(self):
        ctx = context()
        self.assertEqual(self.route([], None).route, REFLEX)
        bad = memory_with(ctx, 0, 12)
        vetoed = self.route([option(ctx, 0.5)], bad)
        self.assertEqual((vetoed.route, vetoed.selected), (ABSTAIN, None))
        unknown = self.route([option(ctx, 0.5)], IntuitionMemory(SCOPE), budget=0)
        self.assertEqual(unknown.route, ABSTAIN)
        self.assertEqual(self.route([option(ctx)], memory_with(ctx, 12, 0),
                                    allow_fast=False).route, DEEP)
        self.assertEqual(self.route([option(ctx)], IntuitionMemory(SCOPE),
                                    allow_deep=False).route, ABSTAIN)

    def test_high_stakes_unknown_overrides_a_trusted_routine_option(self):
        routine, risky = context("assign_crew", stage="ready"), context(funding="thin")
        memory = memory_with(routine, 12, 0)
        decision = self.route([option(routine, 0.0, "ROUTINE"),
                               option(risky, 0.6, "RISKY")], memory)
        self.assertEqual(decision.route, DEEP)
        cheap = self.route([option(routine, 0.0, "ROUTINE"),
                            option(risky, 0.05, "CHEAP")], memory)
        self.assertEqual((cheap.route, cheap.selected), (FAST, "ROUTINE"))


class VerifiedLearningTests(unittest.TestCase):
    def test_nothing_is_learned_before_a_verified_delayed_outcome(self):
        memory = IntuitionMemory(SCOPE)
        verifier, learner = CausalOutcomeVerifier(), AdaptiveStrategyLearner(memory)
        ctx = context()
        verifier.expect(subject="A", context=ctx, route=DEEP, expected=0.9,
                        evidence_ref="SYN-PROPOSAL-1", tick=1)
        verifier.expect(subject="B", context=ctx, route=FAST, expected=0.8,
                        evidence_ref="SYN-PROPOSAL-2", tick=2)
        self.assertEqual(learner.learn(verifier.settle({}), 0), 0)
        self.assertEqual(memory.version, 0)   # a committed receipt alone teaches nothing
        verifier.note_confounder("B", "disputed")
        self.assertEqual(learner.learn(verifier.settle({"A": True, "B": False}), 0), 2)
        success, failure = memory.records()
        self.assertEqual((success["outcome"], failure["outcome"]), (1, 0))
        self.assertEqual(failure["confounders"], ["disputed"])
        self.assertTrue(failure["alternative_explanations"])
        self.assertTrue(success["alternative_explanations"])  # success is doubted too
        self.assertEqual(verifier.open, [])
        self.assertEqual(len(learner.calibration), 2)


class PolicyBoundaryTests(unittest.TestCase):
    def play(self, case, **kwargs):
        policy, world, actions = AsilCausalPolicy(case, **kwargs), World(case), []
        try:
            while world.tick < case.horizon:
                view = world.public_view("project_manager", tenant=policy.tenant)
                action = policy.choose(view)
                event = world.step(action)
                policy.observe(action, event["result"])
                actions.append(action)
            return policy, world.final_truth(), actions, policy.finish()
        finally:
            policy.close()

    def test_episode_uses_only_validated_mock_actions_and_learns_after_verification(self):
        case = generate("dev", 41000, family="working_capital")
        memory, model = IntuitionMemory("SYN-ASIL-LEARNER"), TransitionModel()
        policy, truth, actions, learning = self.play(case, memory=memory, model=model)
        self.assertEqual(truth["denials"], 0)
        self.assertTrue(all(a["tool"] in TOOLS for a in actions))
        self.assertEqual(learning["memory_records_written"], memory.version)
        self.assertGreater(memory.version, 0)
        self.assertTrue(all(r["verified"] for r in memory.records()))
        self.assertIn(str(len(case.jobs)), model.horizons)
        blob = json.dumps(memory.to_json())
        for job in case.jobs:
            self.assertNotIn(job.name, blob)
        self.assertTrue({d["route"] for d in policy.decisions} <= {
            "fast", "deep", "deep_abstain", "abstain", "reflex"})

    def test_frozen_or_disabled_memory_never_changes(self):
        case = generate("dev", 41001, family="supplier_shock")
        memory = IntuitionMemory("SYN-ASIL-LEARNER")
        self.play(generate("dev", 41000, family="working_capital"), memory=memory)
        memory.frozen = True
        digest = memory.digest()
        model = TransitionModel()
        model.frozen = True
        self.play(case, memory=memory, model=model)
        self.assertEqual(memory.digest(), digest)
        self.assertEqual(model.to_json()["samples"], {})
        policy, _, _, learning = self.play(case, mode="memory_off", memory=memory)
        self.assertIsNone(policy.memory)
        self.assertEqual(learning["memory_records_written"], 0)

    def test_input_and_split_boundaries(self):
        case = generate("dev", 41000)
        policy = AsilCausalPolicy(case)
        self.addCleanup(policy.close)
        view = World(case).public_view("project_manager", tenant=policy.tenant)
        for bad in ({**view, "global_truth": True}, {**view, "role": "owner"},
                    {**view, "fictional": False}, {**view, "jobs": view["jobs"][:1]}):
            with self.assertRaises(PermissionError):
                policy.choose(bad)
        with self.assertRaises(ValueError):
            AsilCausalPolicy(case, mode="self_promote")
        with self.assertRaises(PermissionError):
            generate("holdout", 1)
        for name in ("execute", "approve", "promote", "deploy"):
            self.assertFalse(hasattr(policy, name))

    def test_candidate_modules_cannot_import_the_judge_or_world_truth(self):
        for path in (PACKAGE / "asil" / "core.py", PACKAGE / "asil" / "__init__.py",
                     PACKAGE / "eval_v2" / "asil_policy.py"):
            source = path.read_text("utf-8")
            self.assertNotIn("final_truth", source)
            self.assertNotIn("export_causal_network", source)
            for node in ast.walk(ast.parse(source)):
                names = []
                if isinstance(node, ast.ImportFrom):
                    names = [node.module or "", *(a.name for a in node.names)]
                elif isinstance(node, ast.Import):
                    names = [a.name for a in node.names]
                for name in names:
                    self.assertFalse(set(name.split(".")) & {
                        "judge", "adaptive", "causal_world", "World", "referee", "hidden",
                        "holdout", "improvement_gate"}, f"{path.name} imports {name}")


def tiny_protocol():
    protocol = copy.deepcopy(asil_runner.load_protocol())
    for name, start in (("training_career", 42000), ("validation", 42100),
                        ("novel", 42200), ("false_familiarity_twins", 42300)):
        protocol["cohorts"][name].update(split="dev", start_index=start, count=2)
    protocol["cohorts"]["false_familiarity_twins"]["twin_of_start_index"] = 42100
    protocol["memory_control_cases"] = 2
    return protocol


class ExperimentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.out = Path(cls.folder.name) / "run"
        cls.protocol = tiny_protocol()
        cls.result = asil_runner.write_run(cls.out, cls.protocol)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def test_registered_protocol_keeps_validation_untouched_and_unpromotable(self):
        protocol = asil_runner.load_protocol()
        self.assertTrue(protocol["registered_before_validation"])
        self.assertFalse(protocol["protected_holdout_used"])
        self.assertEqual(protocol["cohorts"]["training_career"]["split"], "dev")
        self.assertGreaterEqual(protocol["cohorts"]["validation"]["start_index"], 2000)
        with self.assertRaises(ValueError):
            bad = Path(self.folder.name) / "bad.json"
            bad.write_text(json.dumps({**protocol, "protected_holdout_used": True}))
            asil_runner.load_protocol(bad)

    def test_run_freezes_before_validation_and_reports_all_controls(self):
        result = self.result
        self.assertTrue(result["candidate"]["frozen_before_validation"])
        self.assertFalse(result["candidate_promoted"] or result["promotion_authorized"])
        self.assertEqual((result["model_calls"], result["real_business_actions"]), (0, 0))
        table = result["suites"]["validation"]["summary"]["policies"]
        self.assertLessEqual({"adaptive", "fast_only", "deep_only", "memory_off",
                              "planner_only", "runtime_memory_off", "runtime_memory_on",
                              "deadline_first", "cash_first", "risk_averse", "no_action"},
                             set(table))
        self.assertEqual(table["no_action"]["paid_jobs"], 0)
        self.assertNotIn("fast", table["memory_off"]["routes"])
        self.assertNotIn("deep", table["fast_only"]["routes"])
        for key in ("fast_path_reliability", "false_familiarity", "calibration_fast",
                    "planning_ops"):
            self.assertIn(key, table["adaptive"])
        self.assertEqual(set(result["suites"]["memory_controls"]),
                         {"clean", "misleading", "stale"})
        self.assertIn(result["status"], (
            "ALL_PRESPECIFIED_CRITERIA_MET_EXTERNAL_REVIEW_REQUIRED",
            "PRESPECIFIED_CRITERIA_NOT_ALL_MET"))
        kinds = [r["event"]["type"] for r in asil_runner.read_ledger(
            self.out / "ledger.jsonl")]
        self.assertLess(kinds.index("candidate_frozen"), kinds.index("matched_case"))

    def test_independent_replay_and_tamper_rejection(self):
        verdict = asil_runner.verify_run(self.out, self.protocol)
        self.assertTrue(verdict["verified"] and verdict["independent_replay"])
        self.assertFalse(verdict["promotion_authorized"])
        with self.assertRaises(ValueError):   # judged under a different protocol
            changed = copy.deepcopy(self.protocol)
            changed["criteria"]["max_fast_ece"] = 0.99
            asil_runner.verify_run(self.out, changed)
        result_path = self.out / "result.json"
        original = result_path.read_text()
        forged = json.loads(original)
        forged["suites"]["validation"]["summary"]["policies"]["adaptive"]["paid_jobs"] += 3
        result_path.write_text(json.dumps(forged, sort_keys=True, indent=1) + "\n")
        with self.assertRaises(ValueError):
            asil_runner.verify_run(self.out, self.protocol)
        manifest = json.loads((self.out / "manifest.json").read_text())
        manifest["sha256"]["result.json"] = asil_runner.sha256(
            result_path.read_bytes()).hexdigest()
        (self.out / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):   # consistent hashes, wrong outcome
            asil_runner.verify_run(self.out, self.protocol)
        with self.assertRaises(FileExistsError):
            asil_runner.write_run(self.out, self.protocol)


if __name__ == "__main__":
    unittest.main()
