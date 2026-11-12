"""GML-01: contract, separation, dataset, training, registry and verdict tests."""

import ast
import copy
import json
from pathlib import Path
import tempfile
import unittest

from aion_genesis.gml import academy, authority, contracts, factory, laboratory, pipeline
from aion_genesis.gml.runtime import (ConstantPolicy, ExperienceMemory, build_messages,
                                      render_observation)
from aion_genesis.gml.training.registry import ModelRegistry

PACKAGE = Path(__file__).resolve().parent.parent / "aion_genesis" / "gml"
try:
    import torch  # noqa: F401
    import peft  # noqa: F401
    import transformers  # noqa: F401
    HAVE_ML = True
except ImportError:
    HAVE_ML = False


def train_scenarios(n=6, start=4000):
    return laboratory.scenarios("train", n, start=start)


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.record = factory.collect_decisions(train_scenarios(1))[0]

    def reseal(self, **changes):
        body = copy.deepcopy(self.record)
        for path, value in changes.items():
            section, field = path.split("__")
            body[section][field] = value
        return contracts.seal(body)

    def test_sealed_trajectory_is_complete_and_content_addressed(self):
        record = contracts.validate(self.record)
        self.assertEqual(set(contracts.SECTIONS) | {"schema", "trajectory_id", "checksum"},
                         set(record))
        self.assertTrue(record["provenance"]["training_eligible"])
        tampered = copy.deepcopy(record)
        tampered["verified_consequences"]["utility"] += 500
        with self.assertRaises(ValueError):
            contracts.validate(tampered)
        missing = copy.deepcopy(record)
        del missing["learning_evidence"]
        with self.assertRaises(ValueError):
            contracts.validate(missing)

    def test_hidden_information_can_never_sit_in_model_visible_input(self):
        observation = copy.deepcopy(self.record["available_information"]["observation"])
        for leak in ({"shocks": [1]}, {"jobs": [{"oracle": 1}]}, {"paid_jobs": 3},
                     {"nested": {"deep": [{"final_truth": {}}]}}):
            with self.assertRaises(ValueError):
                self.reseal(available_information__observation={**observation, **leak})
        with self.assertRaises(ValueError):
            self.reseal(available_information__observation={
                **observation, "global_truth": True})
        with self.assertRaises(ValueError):
            self.reseal(decision__predictions={"utility": 5})
        self.assertEqual(contracts.leaked_keys(observation), [])

    def test_only_trusted_training_records_are_eligible(self):
        consequences = self.record["verified_consequences"]
        with self.assertRaises(ValueError):   # censored outcome is not a label
            self.reseal(verified_consequences__censored=True)
        with self.assertRaises(ValueError):   # no receipt, no trust
            self.reseal(verified_consequences__receipts=[])
        with self.assertRaises(ValueError):   # evaluation data can never train
            self.reseal(environment__partition="protected_test")
        with self.assertRaises(ValueError):
            self.reseal(provenance__training_eligible=False)
        ok = self.reseal(provenance__training_eligible=False,
                         provenance__ineligible_reason="manual_quarantine")
        self.assertFalse(ok["provenance"]["training_eligible"])
        self.assertTrue(consequences["receipts"])


class LaboratoryTests(unittest.TestCase):
    def test_held_out_partitions_need_the_authority_and_differ_by_mechanism(self):
        for partition in ("public_validation", "protected_test", "adversarial"):
            with self.assertRaises(PermissionError):
                laboratory.scenarios(partition, 2)
        with self.assertRaises(PermissionError):
            laboratory.AuthorityToken()
        with self.assertRaises(PermissionError):   # held-out family cannot enter training
            laboratory.scenarios("train", 2, families=("compound",))
        protocol = authority.load_protocol()
        train = laboratory.scenarios("train", 120)
        protected = authority.sealed_scenarios("protected_test", protocol, 60)
        adversarial = authority.sealed_scenarios("adversarial", protocol, 30)
        lineages = {s.template_lineage for s in train}
        self.assertFalse(lineages & {s.template_lineage for s in protected})
        self.assertFalse(lineages & {s.template_lineage for s in adversarial})
        self.assertFalse({s.case.family for s in train} & set(laboratory.HELD_OUT_FAMILIES))
        self.assertTrue({s.case.family for s in protected} >= set(
            laboratory.HELD_OUT_FAMILIES))
        self.assertFalse({s.case.seed for s in train} & {s.case.seed for s in protected})
        self.assertFalse(authority.state_hashes(train) & authority.state_hashes(protected))

    def test_rollouts_are_deterministic_and_observations_are_scoped(self):
        scenario = train_scenarios(1)[0]
        self.assertEqual(laboratory.strategy_outcomes(scenario),
                         laboratory.strategy_outcomes(scenario))
        observation = laboratory.initial_observation(scenario)
        self.assertEqual(contracts.leaked_keys(observation), [])
        self.assertIs(observation["global_truth"], False)
        text = render_observation(observation)
        self.assertNotIn("JOB-", text)            # no seed-bearing identifiers
        self.assertNotIn(str(scenario.case.seed), text)
        with self.assertRaises(PermissionError):
            render_observation({**observation, "global_truth": True})

    def test_transition_labels_stay_out_of_inputs_and_pairs_are_matched(self):
        scenario = train_scenarios(4)[2]
        rows = laboratory.transition_records(scenario, "risk_averse")
        self.assertTrue(rows)
        for row in rows:
            self.assertEqual(contracts.leaked_keys(row["input"]), [])
            self.assertNotIn("job_paid", json.dumps(row["input"]))
            self.assertIn(row["label"]["denied"], (0, 1))
        pairs = [p for s in train_scenarios(8) for p in laboratory.intervention_pairs(s)]
        self.assertTrue(pairs)
        for pair in pairs:
            first, second = pair["arms"]
            self.assertEqual({k: v for k, v in first["input"].items() if k != "job"},
                             {k: v for k, v in second["input"].items() if k != "job"})


class FactoryTests(unittest.TestCase):
    def setUp(self):
        self.records = factory.collect_decisions(train_scenarios(8))

    def test_examples_are_traceable_deduplicated_and_keep_negatives(self):
        built = factory.build_policy_datasets(self.records + self.records[:3])
        self.assertEqual(built["report"]["duplicates_removed"], 3)
        ids = {r["trajectory_id"] for r in self.records}
        for example in built["sft"]:
            self.assertIn(example["trajectory_id"], ids)
            self.assertIn(example["target"], laboratory.STRATEGIES)
            self.assertEqual(contracts.leaked_keys(example["messages"]), [])
        for pair in built["preference"]:
            self.assertGreaterEqual(pair["margin"], factory.MIN_PREFERENCE_MARGIN)
            self.assertGreater(pair["evidence"]["chosen"]["value"],
                               pair["evidence"]["rejected"]["value"])
        self.assertTrue(built["preference"])   # worse alternatives are preserved

    def test_contaminated_and_untrusted_records_are_excluded_with_a_reason(self):
        forbidden = {self.records[0]["environment"]["initial_state_hash"]}
        built = factory.build_policy_datasets(self.records,
                                              forbidden_state_hashes=forbidden)
        self.assertEqual(built["report"]["excluded"],
                         {"contaminated_with_evaluation_scenario": 1})
        quarantined = copy.deepcopy(self.records[1])
        quarantined["provenance"].update(training_eligible=False,
                                         ineligible_reason="unverified_reward_label")
        quarantined = contracts.seal(quarantined)
        built = factory.build_policy_datasets([quarantined, *self.records[2:]])
        self.assertEqual(built["report"]["excluded"], {"unverified_reward_label": 1})
        broken = copy.deepcopy(self.records[2])
        broken["learning_evidence"]["corrective_action"] = "no_action"
        with self.assertRaises(ValueError):    # edited labels fail the checksum
            factory.build_policy_datasets([broken])

    def test_censored_outcomes_are_masked_not_relabelled(self):
        row = laboratory.transition_records(train_scenarios(1)[0], "risk_averse")[0]
        row = {**row, "censored": True, "label": {**row["label"], "job_paid": 0}}
        built = factory.build_transition_dataset([row])
        self.assertNotIn("job_paid", built["examples"][0]["label"])
        self.assertEqual(built["report"]["censored_job_outcomes_masked"], 1)
        leaky = {**row, "input": {**row["input"], "oracle": 1}}
        self.assertEqual(factory.build_transition_dataset([leaky])["report"]["leaky_dropped"], 1)

    def test_dataset_is_content_addressed_and_tamper_evident(self):
        built = factory.build_policy_datasets(self.records)
        with tempfile.TemporaryDirectory() as root:
            first = factory.write_dataset(root, "policy-sft", built["sft"],
                                          partition="train", report=built["report"])
            again = factory.write_dataset(root, "policy-sft", built["sft"],
                                          partition="train", report=built["report"])
            self.assertEqual(first["dataset_id"], again["dataset_id"])
            manifest, examples = factory.load_dataset(first["path"])
            self.assertEqual(len(examples), manifest["examples"])
            with open(Path(first["path"]) / "data.jsonl", "a") as handle:
                handle.write(json.dumps({"example_id": "INJECTED"}) + "\n")
            with self.assertRaises(ValueError):
                factory.load_dataset(first["path"])


class AuthorityTests(unittest.TestCase):
    PROTOCOL = authority.load_protocol()

    @staticmethod
    def result(label, trained, base, constant=None, n=120, denied=0):
        constant = base if constant is None else constant
        cases = []
        for i in range(n):
            arm = lambda k, d=0: {"success": int(i < k), "denied": d, "choice":  # noqa: E731
                                  "risk_averse" if i % 2 else "cash_first"}
            cases.append({"arms": {"trained": arm(trained, denied if i == 0 else 0),
                                   "base": arm(base), "constant_risk_averse": arm(constant)}})
        summary = {name: {"denied_actions": sum(c["arms"][name]["denied"] for c in cases),
                          "choices": {"risk_averse": n // 2, "cash_first": n - n // 2}}
                   for name in ("trained", "base", "constant_risk_averse")}
        return {"label": label, "cases": cases, "summary": summary}

    def verdict(self, protected, public=None, **kwargs):
        options = dict(candidate="trained", base="base", training_verified=True,
                       contamination_report={"contaminated": 0})
        options.update(kwargs)
        return authority.policy_verdict(
            protected, public or self.result("public", 60, 60), self.PROTOCOL, **options)

    def test_pass_needs_the_preregistered_gain_and_a_positive_interval(self):
        good = self.verdict(self.result("p", 90, 60))
        self.assertEqual(good["verdict"], "PASS")
        self.assertTrue(good["human_approval_required"])
        self.assertFalse(good["auto_promoted"])
        self.assertEqual(self.verdict(self.result("p", 63, 60))["verdict"], "FAIL")
        self.assertEqual(self.verdict(self.result("p", 50, 60))["verdict"], "FAIL")
        small = self.verdict(self.result("p", 12, 7, n=14))
        self.assertEqual(small["verdict"], "INCONCLUSIVE")   # under-powered
        wide = self.verdict(self.result("p", 67, 60))        # gain below target, CI spans it
        self.assertIn(wide["verdict"], ("INCONCLUSIVE", "FAIL"))
        prior_only = self.verdict(self.result("p", 90, 60, constant=90))
        self.assertFalse(prior_only["adds_value_over_constant_policy"])

    def test_hard_blockers_override_any_gain(self):
        strong = self.result("p", 100, 50)
        self.assertEqual(self.verdict(strong, contamination_report={
            "contaminated": 2})["verdict"], "FAIL")
        self.assertEqual(self.verdict(strong, training_verified=False)["verdict"], "FAIL")
        self.assertEqual(self.verdict(self.result("p", 100, 50, denied=1))["verdict"], "FAIL")
        self.assertEqual(self.verdict(strong, self.result("public", 40, 60))["verdict"],
                         "FAIL")
        self.assertEqual(self.verdict(strong, real_model=False)["verdict"], "INCONCLUSIVE")
        self.assertEqual(self.verdict(strong, reused_protected_test=True)["verdict"],
                         "INCONCLUSIVE")

    def test_contamination_and_exposure_tracking(self):
        scenarios = authority.sealed_scenarios("protected_test", self.PROTOCOL, 4)
        state = next(iter(authority.state_hashes(scenarios)))
        report = authority.contamination(
            [{"example_id": "A", "initial_state_hash": state},
             {"example_id": "B", "initial_state_hash": "clean",
              "scenario_id": scenarios[0].scenario_id},
             {"example_id": "C", "initial_state_hash": "clean", "scenario_id": "x"}],
            scenarios)
        self.assertEqual(report["contaminated"], 2)
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "state.json"
            self.assertFalse(authority.record_exposure(
                path, "protected_test", self.PROTOCOL, "policy:a"))
            self.assertFalse(authority.record_exposure(
                path, "protected_test", self.PROTOCOL, "world_model"))
            self.assertTrue(authority.record_exposure(
                path, "protected_test", self.PROTOCOL, "policy:b"))

    def test_policy_evaluation_scores_from_the_laboratory_only(self):
        scenarios = authority.sealed_scenarios("public_validation", self.PROTOCOL, 6)
        constant = ConstantPolicy("risk_averse")
        result = authority.evaluate_policies({
            "constant": lambda obs, _: constant.choose(obs),
            "garbage": lambda obs, _: "delete_everything",
            "idle": lambda obs, _: "no_action"}, scenarios, label="t")
        self.assertEqual(result["summary"]["garbage"]["invalid_outputs"], 6)
        self.assertEqual(result["summary"]["idle"]["paid_jobs"], 0)
        self.assertGreater(result["summary"]["idle"]["missed_opportunity_by_inaction"], 0)
        self.assertGreater(result["summary"]["constant"]["successes"], 0)
        self.assertEqual(authority.calibration([(0.8, 1)] * 8 + [(0.8, 0)] * 2)["ece"], 0.0)


class RegistryAndAcademyTests(unittest.TestCase):
    def test_only_authority_verdicts_move_the_current_model_and_rollback_works(self):
        with tempfile.TemporaryDirectory() as root:
            registry = ModelRegistry(root)
            registry.register(model_id="m1", family="policy", path="a", lineage={})
            with self.assertRaises(PermissionError):   # a candidate cannot certify itself
                registry.decide("m1", {"verdict": "PASS", "issued_by": "candidate"},
                                decided_by="candidate")
            passed = {"verdict": "PASS", "issued_by": authority.ISSUER}
            registry.decide("m1", passed, decided_by="reviewer")
            registry.register(model_id="m2", family="policy", path="b", lineage={})
            registry.decide("m2", {"verdict": "FAIL", "issued_by": authority.ISSUER},
                            decided_by="reviewer")
            self.assertEqual(registry.current("policy"), "m1")   # regression rejected
            self.assertEqual(registry.entry("m2")["state"], "rejected")
            registry.register(model_id="m3", family="policy", path="c", lineage={})
            registry.decide("m3", passed, decided_by="reviewer")
            self.assertEqual(ModelRegistry(root).current("policy"), "m3")
            self.assertEqual(registry.rollback("policy"), "m1")
            self.assertEqual(len(registry.state["entries"]), 3)   # nothing deleted
            with self.assertRaises(ValueError):
                registry.register(model_id="m1", family="policy", path="x", lineage={})

    def test_curriculum_keeps_quotas_never_repeats_and_rejects_invalid_cases(self):
        plan = academy.Curriculum(pool_start=4500, pool_size=100)
        plan.update({"supplier_shock": 5.0, "field_blocker": 0.01,
                     "scope_approval": 0.01, "working_capital": 0.01})
        seen = []
        for _ in range(3):
            seen += [s.scenario_id for s in plan.next_batch(20)]
        self.assertEqual(len(seen), len(set(seen)))
        share = plan.coverage()["family_share"]
        self.assertLessEqual(max(share.values()), 0.56)
        self.assertGreaterEqual(min(share.values()), 0.08)
        self.assertEqual(max(share, key=share.get), "supplier_shock")
        proposal = plan.proposals[0]
        for field in ("target_capability", "current_uncertainty", "hypothesis",
                      "causal_mechanism", "allowed_interventions",
                      "expected_information_gain", "difficulty", "novelty",
                      "verification_method", "estimated_simulation_cost"):
            self.assertIn(field, proposal)
        uniform = academy.Curriculum(pool_start=4500, pool_size=100, adaptive=False)
        uniform.next_batch(20)
        self.assertEqual(set(uniform.coverage()["family_share"].values()), {0.25})
        held_out = authority.sealed_scenarios("protected_test", authority.load_protocol(), 1)
        self.assertEqual(academy.validate_scenario(held_out[0]),
                         (False, "not_a_training_scenario"))
        original = laboratory.strategy_outcomes
        try:
            laboratory.strategy_outcomes = lambda s: {
                n: {**original(s)[n], "paid_jobs": 0} for n in laboratory.STRATEGIES}
            self.assertEqual(academy.validate_scenario(train_scenarios(1)[0])[1],
                             "impossible_no_strategy_can_succeed")
        finally:
            laboratory.strategy_outcomes = original


class SeparationTests(unittest.TestCase):
    def test_candidate_side_code_never_imports_the_hidden_side(self):
        candidate = [PACKAGE / "runtime.py", *(PACKAGE / "training").glob("*.py")]
        self.assertGreaterEqual(len(candidate), 5)
        for path in candidate:
            source = path.read_text()
            for word in ("final_truth", "strategy_outcomes", "AuthorityToken"):
                self.assertNotIn(word, source, path.name)
            for node in ast.walk(ast.parse(source)):
                names = []
                if isinstance(node, ast.ImportFrom):
                    names = [node.module or "", *(a.name for a in node.names)]
                elif isinstance(node, ast.Import):
                    names = [a.name for a in node.names]
                for name in names:
                    self.assertFalse(set(name.split(".")) & {
                        "laboratory", "authority", "academy", "eval_v2", "pipeline",
                        "factory", "causal_world", "adaptive"}, f"{path.name}: {name}")

    def test_memory_arm_gets_context_not_answers_for_the_current_case(self):
        records = factory.collect_decisions(train_scenarios(6))
        examples = factory.build_policy_datasets(records)["sft"]
        observation = laboratory.initial_observation(train_scenarios(1, start=4100)[0])
        memory = ExperienceMemory(examples).nearest(observation, 2)
        messages = build_messages(observation, memory=memory)
        self.assertEqual(len(memory), 2)
        self.assertIn("Verified past case", messages[1]["content"])
        self.assertTrue(messages[1]["content"].rstrip().endswith("Which strategy?"))


@unittest.skipUnless(HAVE_ML, "PyTorch/Transformers/PEFT not installed")
class TrainingTests(unittest.TestCase):
    def test_world_model_really_updates_saves_and_reloads(self):
        from aion_genesis.gml.training import world_model as wm
        examples = factory.build_transition_dataset(
            factory.collect_transitions(train_scenarios(30)))["examples"]
        fitted = wm.train(examples, wm.WorldModelConfig(epochs=40), dataset_id="d",
                          dataset_sha256="h")
        self.assertGreater(fitted["lineage"]["parameter_delta_l2"], 0.1)
        self.assertLess(fitted["lineage"]["loss_last_epoch"],
                        fitted["lineage"]["loss_first_epoch"])
        with tempfile.TemporaryDirectory() as root:
            wm.save(root, fitted)
            trained, blank = wm.load(root), wm.load(root, "initial.pt")
            p = wm.predict(trained, examples[:50])
            live = {"model": fitted["model"].eval(), "mean": fitted["mean"],
                    "std": fitted["std"]}
            self.assertLess(float((p - wm.predict(live, examples[:50])).abs().max()), 1e-6)
            self.assertGreater(float((p - wm.predict(blank, examples[:50])).abs().max()),
                               0.05)
            self.assertEqual(trained["lineage"]["dataset_sha256"], "h")
        self.assertEqual(len(wm.featurize(examples[0]["input"], "wait")),
                         fitted["lineage"]["inputs"])

    def test_lora_adapter_is_trained_saved_reloaded_and_bounded(self):
        from aion_genesis.gml.training import lora
        from aion_genesis.gml.training.fixture import build_fixture_model
        examples = factory.build_policy_datasets(
            factory.collect_decisions(train_scenarios(12)))["sft"]
        with tempfile.TemporaryDirectory() as root:
            base = build_fixture_model(Path(root) / "base", [
                m["content"] for e in examples for m in e["messages"]] + list(
                    laboratory.STRATEGIES))
            config = lora.LoraConfig(base_model=base, epochs=2, lr=5e-3)
            manifest = lora.train_adapter(examples, config, Path(root) / "run",
                                          dataset_id="d", dataset_sha256="h")
            self.assertTrue(manifest["training_verified"])
            self.assertTrue(manifest["parameters_changed"])
            self.assertTrue(manifest["reload_reproduces_trained_model"])
            self.assertTrue(manifest["adapter_changes_outputs"])
            self.assertEqual(manifest["dataset_sha256"], "h")
            self.assertTrue(any(name.endswith(".safetensors")
                                for name in manifest["adapter_files"]))
            policy = lora.load_policy(config, Path(root) / "run" / "adapter")
            observation = laboratory.initial_observation(train_scenarios(1)[0])
            self.assertIn(policy.choose(observation), laboratory.STRATEGIES)
            messages = build_messages(observation)
            fast, slow = policy.scores(messages), policy.scores_reference(messages)
            for name in laboratory.STRATEGIES:   # cached scoring equals plain scoring
                self.assertAlmostEqual(fast[name], slow[name], places=3)
            self.assertGreater(policy.tokens, 0)
            with self.assertRaises(ValueError):   # RL/preference training stays locked
                lora.train_adapter(examples, lora.LoraConfig(
                    base_model=base, algorithm="reinforcement"), Path(root) / "rl",
                    dataset_id="d", dataset_sha256="h")
            capped = lora.train_adapter(examples, lora.LoraConfig(
                base_model=base, epochs=50, max_wall_seconds=0), Path(root) / "capped",
                dataset_id="d", dataset_sha256="h")
            self.assertEqual(capped["stopped"], "wall_time_budget_exhausted")
            self.assertFalse(capped["training_verified"])

    def test_pipeline_runs_resumes_verifies_and_blocks_honestly(self):
        with tempfile.TemporaryDirectory() as root:
            out = Path(root) / "run"
            done = pipeline.run_pipeline(out, policy_backend="fixture", limit=6)
            self.assertEqual(done["policy"]["status"], "COMPLETED")
            self.assertTrue(done["policy"]["is_fixture_not_a_real_language_model"])
            self.assertEqual(done["policy"]["verdict"]["verdict"], "INCONCLUSIVE")
            self.assertEqual(done["policy"]["contamination"]["contaminated"], 0)
            self.assertIn(done["world-model"]["verdict"]["verdict"], ("PASS", "FAIL"))
            self.assertLess(done["world-model"]["reload_max_abs_difference"], 1e-6)
            self.assertTrue(pipeline.verify(out)["verified"])
            again = pipeline.run_pipeline(out, policy_backend="fixture", limit=6)
            self.assertEqual(again["datasets"]["seconds"], done["datasets"]["seconds"])
            blocked = pipeline.run_pipeline(
                Path(root) / "blocked", policy_backend="hf", limit=6,
                base_model=str(Path(root) / "no-such-model"), stages=(
                    "datasets", "policy"))
            self.assertEqual(blocked["policy"]["status"], "BLOCKED")
            self.assertFalse(blocked["policy"]["adapter_trained"])
            member = Path(done["world-model"]["members"][0]["path"]) / "model.pt"
            member.write_bytes(member.read_bytes() + b"x")
            self.assertFalse(pipeline.verify(out)["verified"])


if __name__ == "__main__":
    unittest.main()
