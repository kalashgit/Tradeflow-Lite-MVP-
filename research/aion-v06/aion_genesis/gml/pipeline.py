"""Single entrypoint for the Genesis learning laboratory.

    python -m aion_genesis.gml run --out /tmp/gml --policy-backend fixture
    python -m aion_genesis.gml run --out /tmp/gml --policy-backend hf \
        --base-model Qwen/Qwen3-0.6B
    python -m aion_genesis.gml verify --out /tmp/gml

Stages: datasets → world-model → curriculum → policy → report. Each stage
writes a JSON record; a finished stage is skipped on re-run (resume). The
pipeline orchestrates; the candidate-side modules it calls (runtime,
training) never see the laboratory's hidden state or the authority.
"""

import argparse
import json
import os
from pathlib import Path
import time

from . import GML_VERSION, academy, authority, factory, laboratory
from .contracts import content_hash, file_hash, write_jsonl
from .runtime import ConstantPolicy, ExperienceMemory
from .training.registry import ModelRegistry

STAGES = ("datasets", "world-model", "curriculum", "policy", "report")


def _source_commit() -> str:
    import subprocess
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True,
                              cwd=Path(__file__).parent, timeout=10, check=True).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return "unknown"


class Run:
    def __init__(self, out, protocol, limit=None):
        self.out, self.protocol, self.limit = Path(out), protocol, limit
        self.out.mkdir(parents=True, exist_ok=True)
        self.registry = ModelRegistry(self.out / "models")

    def count(self, name):
        spec = self.protocol["partitions"][name]
        return spec["start"], spec["count"] if self.limit is None else min(
            self.limit, spec["count"])

    def stage(self, name, build):
        """Idempotent stage: reuse a finished record made under the same protocol."""
        path = self.out / f"stage-{name}.json"
        key = content_hash([GML_VERSION, self.protocol, self.limit, name])
        if path.exists():
            done = json.loads(path.read_text())
            if done.get("stage_key") == key:
                return done
        started = time.perf_counter()
        record = build()
        record.update(stage=name, stage_key=key,
                      seconds=round(time.perf_counter() - started, 2))
        path.write_text(json.dumps(record, sort_keys=True, indent=1))
        return record


def stage_datasets(run: Run) -> dict:
    start, count = run.count("train")
    scenarios = laboratory.scenarios("train", count, start=start)
    simulated_steps = sum(s.case.horizon for s in scenarios)
    records = factory.collect_decisions(scenarios, behaviour="uniform", seed=0)
    write_jsonl(run.out / "trajectories.jsonl", records)
    built = factory.build_policy_datasets(records)
    root = run.out / "datasets"
    sft = factory.write_dataset(root, "policy-sft", built["sft"], partition="train",
                                report=built["report"])
    pref = factory.write_dataset(root, "policy-preference", built["preference"],
                                 partition="train", report=built["report"],
                                 parents=[sft["dataset_id"]])
    transitions = factory.build_transition_dataset(factory.collect_transitions(scenarios))
    steps = factory.write_dataset(root, "transitions", transitions["examples"],
                                  partition="train", report=transitions["report"])
    simulations = len(scenarios) * (len(laboratory.STRATEGIES) + 3)
    return {
        "scenarios": len(scenarios), "trajectories": len(records),
        "trajectories_sha256": file_hash(run.out / "trajectories.jsonl"),
        "datasets": {"sft": sft, "preference": pref, "transitions": steps},
        "preference_labels_validated": False,
        "preference_note": "pairs come from exact same-world counterfactual rollouts "
                           "with a value margin; not yet used for training",
        "efficiency": {
            "simulated_episodes": simulations,
            "simulated_steps": simulated_steps * (len(laboratory.STRATEGIES) + 3),
            "useful_verified_experiences_per_1000_simulations": round(
                1000 * (len(built["sft"]) + len(transitions["examples"])) / simulations, 1)},
    }


def _transition_sets(run: Run):
    sets = {}
    for partition in ("public_validation", "protected_test", "adversarial"):
        scenarios = authority.sealed_scenarios(partition, run.protocol, run.limit)
        rows = factory.build_transition_dataset(factory.collect_transitions(scenarios))
        pairs = [p for s in scenarios for p in laboratory.intervention_pairs(s)]
        sets[partition] = (rows["examples"], pairs)
    return sets


def stage_world_model(run: Run, datasets: dict) -> dict:
    from .training import world_model as wm
    manifest, examples = factory.load_dataset(datasets["datasets"]["transitions"]["path"])
    spec = run.protocol["world_model"]
    members, lineages = [], []
    for seed in spec["seeds"]:
        config = wm.WorldModelConfig(hidden=spec["hidden"], epochs=spec["epochs"],
                                     lr=spec["lr"], seed=seed)
        fitted = wm.train(examples, config, dataset_id=manifest["dataset_id"],
                          dataset_sha256=manifest["sha256"])
        folder = run.out / "models" / f"world-model-{manifest['sha256'][:10]}-s{seed}"
        wm.save(folder, fitted)
        members.append(wm.load(folder))          # evaluate the reloaded checkpoint
        lineages.append({**fitted["lineage"], "path": str(folder),
                         "checkpoint_sha256": file_hash(folder / "model.pt")})
    primary = members[0]
    untrained = wm.load(lineages[0]["path"], "initial.pt")
    reload_gap = float((wm.predict(primary, examples[:64]) - wm.predict(
        wm.load(lineages[0]["path"]), examples[:64])).abs().max())
    rates = {head: (sum(e["label"][head] for e in examples if head in e["label"])
                    / max(1, sum(head in e["label"] for e in examples)))
             for head in wm.HEADS}
    ensemble = lambda rows: sum(wm.predict(m, rows) for m in members) / len(members)  # noqa: E731
    evaluation = {}
    for partition, (rows, pairs) in _transition_sets(run).items():
        authority.record_exposure(run.out / "authority-state.json", partition,
                                  run.protocol, "world_model")
        report = authority.evaluate_world_model(
            ensemble, rows, rates, untrained=lambda r: wm.predict(untrained, r),
            members=[lambda r, m=m: wm.predict(m, r) for m in members])
        report["intervention_sensitivity"] = authority.intervention_sensitivity(
            ensemble, pairs)
        report["examples"] = len(rows)
        evaluation[partition] = report
    metric = run.protocol["criteria"]["world_model_metric"]
    checks = {}
    for head in wm.HEADS:
        entry = evaluation["protected_test"][head]
        if entry.get("n", 1) == 0:
            continue
        checks[head] = {base: entry["learned"][metric] < entry[base][metric]
                        for base in run.protocol["criteria"]["world_model_must_beat"]}
    beats_all = all(all(v.values()) for v in checks.values())
    verdict = {"issued_by": authority.ISSUER, "verdict": "PASS" if beats_all else "FAIL",
               "criterion": f"lower {metric} than constant, heuristic and untrained "
                            "baselines on every head of the protected test",
               "checks": checks, "human_approval_required": True}
    model_id = f"world-model-{manifest['sha256'][:10]}"
    if not any(e["model_id"] == model_id for e in run.registry.state["entries"]):
        run.registry.register(model_id=model_id, family="world_model",
                              path=lineages[0]["path"], lineage=lineages[0])
        run.registry.decide(model_id, verdict, decided_by="pipeline-recording-authority")
    return {"model_id": model_id, "members": lineages, "train_base_rates": rates,
            "reload_max_abs_difference": reload_gap, "evaluation": evaluation,
            "verdict": verdict}


def stage_curriculum(run: Run) -> dict:
    """M4: adaptive selection versus uniform sampling at equal simulation budget."""
    from .training import world_model as wm
    spec = run.protocol["partitions"]
    rounds, batch = (3, 8) if run.limit else (6, 24)
    check_start, check_count = run.count("curriculum_dev_check")
    check = laboratory.scenarios("train", check_count, start=check_start)
    check_rows = factory.build_transition_dataset(
        factory.collect_transitions(check))["examples"]
    families = tuple(academy.CAPABILITIES)

    def losses(members):
        predict = lambda rows: sum(wm.predict(m, rows) for m in members) / len(members)  # noqa: E731
        out = {}
        for family in (*families, None):
            rows = [e for e in check_rows if family is None or e["family"] == family]
            pairs = [(float(p[0]), int(e["label"]["job_paid"]))
                     for p, e in zip(predict(rows), rows) if "job_paid" in e["label"]]
            out[family or "all"] = authority.calibration(pairs)["brier"]
        return out

    arms = {}
    for name, adaptive in (("adaptive", True), ("uniform", False)):
        plan = academy.Curriculum(families, pool_start=spec["curriculum_pool"]["start"],
                                  pool_size=spec["curriculum_pool"]["count"] // len(families),
                                  adaptive=adaptive)
        pool, curve, steps = [], [], 0
        for _ in range(rounds):
            chosen = plan.next_batch(batch)
            steps += sum(s.case.horizon * 3 for s in chosen)
            pool += factory.collect_transitions(chosen)
            examples = factory.build_transition_dataset(pool)["examples"]
            members = []
            for seed in (0, 1):
                fitted = wm.train(examples, wm.WorldModelConfig(epochs=60, seed=seed),
                                  dataset_id="curriculum", dataset_sha256="curriculum")
                members.append({"model": fitted["model"].eval(), "mean": fitted["mean"],
                                "std": fitted["std"]})
            measured = losses(members)
            plan.update({f: measured[f] for f in families})
            curve.append({"simulator_steps": steps, "examples": len(examples),
                          "dev_check_brier": measured["all"],
                          "by_family": {f: measured[f] for f in families}})
        arms[name] = {"curve": curve, "coverage": plan.coverage(),
                      "proposals_sample": plan.proposals[:3],
                      "rejected_invalid": plan.rejected[:5]}
    a, u = arms["adaptive"]["curve"][-1], arms["uniform"]["curve"][-1]
    gain = (u["dev_check_brier"] - a["dev_check_brier"]) / max(1e-9, u["dev_check_brier"])
    area = lambda c: sum(p["dev_check_brier"] for p in c) / len(c)  # noqa: E731
    need = run.protocol["criteria"]["curriculum_min_relative_gain"]
    return {"arms": arms, "evaluated_on": "development-only check scenarios",
            "final_relative_brier_gain_adaptive_vs_uniform": round(gain, 4),
            "mean_brier_over_rounds": {n: round(area(arms[n]["curve"]), 5) for n in arms},
            "simulator_steps": {n: arms[n]["curve"][-1]["simulator_steps"] for n in arms},
            "verdict": "PASS" if gain >= need else
                       "FAIL" if gain <= -need else "INCONCLUSIVE",
            "threshold": need, "single_run_no_interval": True}


def stage_policy(run: Run, datasets: dict, backend: str, base_model: str) -> dict:
    if backend == "skip":
        return {"status": "SKIPPED", "reason": "policy backend disabled for this run"}
    from .training import lora
    manifest, examples = factory.load_dataset(datasets["datasets"]["sft"]["path"])
    spec = dict(run.protocol["policy"])
    memory_k = spec.pop("memory_examples")
    if backend == "fixture":
        from .training.fixture import FIXTURE_NAME, build_fixture_model
        corpus = [m["content"] for e in examples for m in e["messages"]] + list(
            laboratory.STRATEGIES) + ["system", "user", "assistant", "Verified", "Trial"]
        spec.update(base_model=build_fixture_model(run.out / "fixture-base", corpus),
                    epochs=3.0, lr=5e-3)
        label = FIXTURE_NAME
    else:
        spec["base_model"] = label = base_model
    config = lora.LoraConfig(**{k: v for k, v in spec.items()
                                if k in lora.LoraConfig.__dataclass_fields__})
    config.threads = os.cpu_count() or 0
    folder = run.out / "models" / f"policy-{manifest['sha256'][:10]}"
    try:
        training = lora.train_adapter(examples, config, folder,
                                      dataset_id=manifest["dataset_id"],
                                      dataset_sha256=manifest["sha256"])
    except (OSError, ImportError, ValueError) as error:
        return {"status": "BLOCKED", "base_model": label,
                "reason": f"could not load or train the base model here: "
                          f"{type(error).__name__}: {str(error)[:300]}",
                "adapter_trained": False}
    base = lora.load_policy(config, name="base")
    tuned = lora.load_policy(config, folder / "adapter", name="trained")
    memory = ExperienceMemory(examples)
    constant = ConstantPolicy("risk_averse")
    arms = {
        "base": lambda obs, _: base.choose(obs),
        "base_with_memory": lambda obs, _: base.choose(
            obs, memory=memory.nearest(obs, memory_k)),
        "base_with_counterfactual_trials": lambda obs, outcomes: base.choose(
            obs, trials=outcomes),
        "trained": lambda obs, _: tuned.choose(obs),
        "trained_with_memory": lambda obs, _: tuned.choose(
            obs, memory=memory.nearest(obs, memory_k)),
        "constant_risk_averse": lambda obs, _: constant.choose(obs),
    }
    # Every arm runs on the protected test. The slower context arms are skipped
    # on the two diagnostic partitions to keep a CPU-only run bounded.
    core = {k: arms[k] for k in ("base", "trained", "constant_risk_averse")}
    results, all_scenarios = {}, []
    for partition in ("public_validation", "protected_test", "adversarial"):
        scenarios = authority.sealed_scenarios(partition, run.protocol, run.limit)
        all_scenarios += scenarios
        results[partition] = authority.evaluate_policies(
            arms if partition == "protected_test" else core, scenarios, label=partition)
    reused = authority.record_exposure(run.out / "authority-state.json", "protected_test",
                                       run.protocol, "policy:" + manifest["sha256"][:10])
    contamination = authority.contamination(examples, all_scenarios)
    verdict = authority.policy_verdict(
        results["protected_test"], results["public_validation"], run.protocol,
        candidate="trained", base="base", contamination_report=contamination,
        training_verified=training["training_verified"], reused_protected_test=reused,
        real_model=backend != "fixture")
    pairs = (("trained", "base"), ("trained", "base_with_memory"),
             ("trained", "base_with_counterfactual_trials"),
             ("trained_with_memory", "base_with_memory"),
             ("trained", "constant_risk_averse"))
    comparisons = {partition: {
        f"{a}_vs_{b}": authority.compare(results[partition], a, b) for a, b in pairs
        if a in results[partition]["summary"] and b in results[partition]["summary"]}
        for partition in results}
    model_id = f"policy-{manifest['sha256'][:10]}"
    if not any(e["model_id"] == model_id for e in run.registry.state["entries"]):
        run.registry.register(model_id=model_id, family="policy", path=str(folder),
                              lineage={k: v for k, v in training.items() if k != "losses"})
        run.registry.decide(model_id, verdict, decided_by="pipeline-recording-authority")
    tokens = {"base": base.tokens, "trained": tuned.tokens}
    protected = results["protected_test"]["summary"]
    return {
        "status": "COMPLETED", "backend": backend, "base_model": label,
        "is_fixture_not_a_real_language_model": backend == "fixture",
        "model_id": model_id, "training": training, "contamination": contamination,
        "protected_test_seen_before": reused,
        "evaluation": {p: results[p]["summary"] for p in results},
        "comparisons": comparisons, "verdict": verdict,
        "inference_tokens": tokens,
        "successful_tasks_per_1000_inference_tokens": {
            "trained": round(1000 * sum(s["successes"] for s in (
                results[p]["summary"]["trained"] for p in results))
                / max(1, tuned.tokens), 4)},
        "cases": {p: results[p]["cases"] for p in results},
        "headline": {arm: protected[arm]["success_rate"] for arm in protected},
    }


def _report(run: Run, stages: dict) -> str:
    lines = ["# Genesis GML-01 run", "",
             "Synthetic simulation only. No protected external holdout. A verdict here "
             "is a research record, never a deployment or automatic promotion.", "",
             f"Source commit `{stages['commit']}` · limit `{run.limit}`", ""]
    d = stages["datasets"]
    lines += ["## M1 experience factory", "",
              f"{d['trajectories']} sealed trajectories from {d['scenarios']} training "
              f"scenarios; {d['datasets']['sft']['examples']} supervised examples, "
              f"{d['datasets']['preference']['examples']} preference pairs, "
              f"{d['datasets']['transitions']['examples']} transition examples.", ""]
    w = stages["world-model"]
    lines += ["## M2 learned world model — verdict " + w["verdict"]["verdict"], "",
              "| Partition | Head | n | Learned Brier | Constant | Heuristic | Untrained |",
              "|---|---|---:|---:|---:|---:|---:|"]
    for partition, report in w["evaluation"].items():
        for head, entry in report.items():
            if isinstance(entry, dict) and "learned" in entry:
                lines.append(f"| {partition} | {head} | {entry['learned']['n']} | "
                             f"{entry['learned']['brier']} | {entry['constant']['brier']} | "
                             f"{entry['heuristic']['brier']} | {entry['untrained']['brier']} |")
    c = stages["curriculum"]
    lines += ["", "## M4 curriculum — verdict " + c["verdict"], "",
              f"Adaptive vs uniform final relative Brier gain "
              f"{c['final_relative_brier_gain_adaptive_vs_uniform']:+.2%} "
              f"(threshold {c['threshold']:.0%}, single run, no interval).", ""]
    p = stages["policy"]
    lines += ["## M3 policy training — " + p["status"], ""]
    if p["status"] == "COMPLETED":
        t = p["training"]
        lines += [f"Base `{p['base_model']}`"
                  + (" (**fixture, not a real language model**)"
                     if p["is_fixture_not_a_real_language_model"] else "")
                  + f"; {t['steps']} steps on {t['examples']} examples; loss "
                  f"{t['loss_first']} → {t['loss_last_mean_5']}; adapter reload verified: "
                  f"{t['training_verified']}.", "",
                  "| Arm | Protected test success | Mean regret | Denied | Inaction misses |",
                  "|---|---:|---:|---:|---:|"]
        for arm, s in p["evaluation"]["protected_test"].items():
            lines.append(f"| {arm} | {s['successes']}/{s['cases']} | {s['mean_regret']} | "
                         f"{s['denied_actions']} | {s['missed_opportunity_by_inaction']} |")
        v = p["verdict"]
        k = v["versus_best_constant_policy"]
        lines += ["", f"**Verdict: {v['verdict']}** — trained minus base "
                  f"{v['protected_test']['success_rate_delta']:+.3f}, 95% CI "
                  f"{v['protected_test']['ci95']}; trained minus always-risk_averse "
                  f"{k['success_rate_delta']:+.3f}, 95% CI {k['ci95']}; "
                  f"always the same choice: {v['always_same_choice']}; "
                  f"blockers: {v['blockers'] or 'none'}.", ""]
    else:
        lines += [p.get("reason", ""), ""]
    return "\n".join(lines) + "\n"


def run_pipeline(out, *, stages=STAGES, policy_backend="fixture",
                 base_model="Qwen/Qwen3-0.6B", limit=None, protocol=None) -> dict:
    protocol = protocol or authority.load_protocol()
    run = Run(out, protocol, limit)
    done = {"commit": _source_commit()}
    done["datasets"] = run.stage("datasets", lambda: stage_datasets(run))
    if "world-model" in stages:
        done["world-model"] = run.stage(
            "world-model", lambda: stage_world_model(run, done["datasets"]))
    if "curriculum" in stages:
        done["curriculum"] = run.stage("curriculum", lambda: stage_curriculum(run))
    if "policy" in stages:
        done["policy"] = run.stage("policy-" + policy_backend, lambda: stage_policy(
            run, done["datasets"], policy_backend, base_model))
    if "report" in stages and all(k in done for k in ("world-model", "curriculum", "policy")):
        (run.out / "REPORT.md").write_text(_report(run, done))
        compact = json.loads(json.dumps(done))
        compact["policy"].pop("cases", None)
        (run.out / "result.json").write_text(json.dumps(compact, sort_keys=True, indent=1))
        (run.out / "manifest.json").write_text(json.dumps({
            "schema": "GenesisGmlRunManifest/1", "protocol_hash": content_hash(protocol),
            "limit": limit, "commit": done["commit"],
            "sha256": {name: file_hash(run.out / name) for name in (
                "result.json", "REPORT.md", "trajectories.jsonl")},
            "release_eligible": False}, sort_keys=True, indent=1))
    return done


def verify(out) -> dict:
    """Integrity check of a finished run: hashes, datasets, lineage, contracts."""
    from .contracts import read_jsonl, validate
    out = Path(out)
    manifest = json.loads((out / "manifest.json").read_text())
    problems = [name for name, digest in manifest["sha256"].items()
                if file_hash(out / name) != digest]
    result = json.loads((out / "result.json").read_text())
    for record in read_jsonl(out / "trajectories.jsonl"):
        validate(record)
    for dataset in result["datasets"]["datasets"].values():
        factory.load_dataset(dataset["path"])
    for member in result["world-model"]["members"]:
        if file_hash(Path(member["path"]) / "model.pt") != member["checkpoint_sha256"]:
            problems.append("world model checkpoint changed: " + member["path"])
    if result["policy"].get("status") == "COMPLETED":
        folder = Path(result["policy"]["training"]["config"]["base_model"])
        adapter = out / "models" / result["policy"]["model_id"] / "adapter"
        for name, digest in result["policy"]["training"]["adapter_files"].items():
            if file_hash(adapter / name) != digest:
                problems.append("adapter file changed: " + name)
        del folder
    return {"verified": not problems, "problems": problems,
            "policy_status": result["policy"].get("status"),
            "release_eligible": False}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m aion_genesis.gml", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run")
    run.add_argument("--out", required=True)
    run.add_argument("--stages", default=",".join(STAGES))
    run.add_argument("--policy-backend", choices=("fixture", "hf", "skip"), default="fixture")
    run.add_argument("--base-model", default="Qwen/Qwen3-0.6B")
    run.add_argument("--limit", type=int, help="smoke run: first N scenarios per partition")
    check = sub.add_parser("verify")
    check.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    if args.command == "verify":
        print(json.dumps(verify(args.out), sort_keys=True))
        return 0
    done = run_pipeline(args.out, stages=tuple(args.stages.split(",")),
                        policy_backend=args.policy_backend, base_model=args.base_model,
                        limit=args.limit)
    report = Path(args.out) / "REPORT.md"
    print(report.read_text() if report.exists() else json.dumps(
        {k: v.get("stage") for k, v in done.items() if isinstance(v, dict)}))
    return 0
