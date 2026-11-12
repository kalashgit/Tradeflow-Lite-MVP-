"""GML v2 research replication: equal-volume data controls and multiple seeds.

Follow-up to the *already-inspected* single-seed development result. This
cannot be used as independent confirmation of the original result and is not
a protected holdout. It is a NEW developer-owned mechanism/family stress check.

Three arms:
    original: baseline training set, fewer examples
    volume_control: same number of examples/optimizer steps as improved,
                    but extra examples are repetitions of baseline evidence
    causal_counterexamples: real paired revocation/delivery evidence

All use identical architectures, initial random seed, optimizer settings,
epochs and hardware. Only data content differs between equal-volume arms.
"""

from hashlib import sha256
import argparse
import json
from math import ceil
from pathlib import Path
import random

from . import factory, laboratory
from .contracts import content_hash, file_hash, write_jsonl
from .learning_v2 import (GenerationLedger, collect_training_probes,
                          combine_training_evidence, coverage_report)
from .learning_v2_cli import _baseline, _brier

SCHEMA = "GenesisLearningReplication/2.1"
ARMS = ("original", "volume_control", "causal_counterexamples")
CHECK_FAMILIES = (
    "working_capital", "supplier_shock", "field_blocker", "scope_approval",
)


def volume_matched_control(baseline: list[dict], count: int, *, seed=179) -> list[dict]:
    """Add zero new causal information, while matching data and optimizer volume."""
    if not baseline or type(count) is not int or count < len(baseline):
        raise ValueError("Need a nonempty baseline and a nondecreasing target size")
    rng = random.Random(seed)
    copy = [dict(e) for e in baseline]
    while len(copy) < count:
        copy.append(dict(baseline[rng.randrange(len(baseline))]))
    rng.shuffle(copy)
    return copy


def _mean(values):
    return round(sum(values) / len(values), 6) if values else None


def execute(out, *, train_scenarios=24, check_scenarios=48,
            seeds=(17, 43, 71), epochs=32):
    if (type(train_scenarios) is not int or not 8 <= train_scenarios <= 60
            or type(check_scenarios) is not int or not 8 <= check_scenarios <= 80
            or type(epochs) is not int or not 1 <= epochs <= 100
            or not 1 <= len(seeds) <= 5
            or any(type(s) is not int or s < 0 for s in seeds)
            or len(set(seeds)) != len(seeds)):
        raise ValueError("Invalid bounded replication protocol")
    from .training import world_model as wm

    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    train = laboratory.scenarios(
        "train", train_scenarios, start=1400,
        families=("working_capital",))
    check = laboratory.scenarios(
        "train", check_scenarios, start=3700, families=CHECK_FAMILIES)
    if set(s.case.seed for s in train) & set(s.case.seed for s in check):
        raise ValueError("Dev-check cohort overlaps training")

    original = _baseline(train)
    interventions = collect_training_probes(train, max_cases=train_scenarios)
    improved = combine_training_evidence(original, interventions)
    repeated = volume_matched_control(original, len(improved))
    dev_check = combine_training_evidence(
        _baseline(check), collect_training_probes(check, max_cases=check_scenarios))

    arms = {"original": original, "volume_control": repeated,
            "causal_counterexamples": improved}
    datasets = out / "datasets"
    datasets.mkdir(exist_ok=True)
    dataset_hashes = {
        name: write_jsonl(datasets / (name + ".jsonl"), rows)
        for name, rows in arms.items()}
    dev_hash = write_jsonl(datasets / "dev-check.jsonl", dev_check)
    cohort_sha = content_hash([(s.scenario_id, s.case.fingerprint()) for s in check])
    if not all(len(arms[a]) == len(improved)
               for a in ("volume_control", "causal_counterexamples")):
        raise AssertionError("Optimization budget is not volume matched")
    ledger = GenerationLedger(out / "generations.sqlite3")
    evaluated = {}
    per_seed = []
    for seed in seeds:
        row = {"seed": seed, "arms": {}}
        for name in ARMS:
            spec = wm.WorldModelConfig(
                hidden=32, epochs=epochs, seed=seed, batch=128)
            fitted = wm.train(arms[name], spec, dataset_id=name,
                              dataset_sha256=dataset_hashes[name])
            path = out / "models" / f"seed-{seed}" / name
            wm.save(path, fitted)
            restored = wm.load(path)
            scores = _brier(lambda examples: wm.predict(restored, examples), dev_check)
            generation = ledger.register_generation(
                parent=None, source_sha=file_hash(__file__),
                model_sha=file_hash(path / "model.pt"),
                dataset_sha=dataset_hashes[name],
                memory_sha=content_hash("none"),
                curriculum_sha=content_hash(["fixed", train_scenarios]),
                architecture_sha=file_hash(Path(wm.__file__)),
                note=f"exploratory replication: seed={seed} arm={name}")
            row["arms"][name] = {
                "generation_id": generation,
                "evaluation": scores,
                "dataset_rows": len(arms[name]),
                "gradient_step_budget": epochs * ceil(len(arms[name]) / spec.batch),
                "trainable_parameters": fitted["lineage"]["parameters"],
                "parameter_delta_l2": fitted["lineage"]["parameter_delta_l2"],
                "training_seconds": fitted["lineage"]["train_seconds"],
                "model_sha256": file_hash(path / "model.pt"),
            }
        per_seed.append(row)

    by_head = {}
    for head in wm.HEADS:
        means = {name: _mean([
            item["arms"][name]["evaluation"][head]["brier"] for item in per_seed])
                 for name in ARMS}
        difference = [
            item["arms"]["causal_counterexamples"]["evaluation"][head]["brier"]
            - item["arms"]["volume_control"]["evaluation"][head]["brier"]
            for item in per_seed]
        by_head[head] = {
            "brier_by_arm": means,
            "causal_minus_equal_volume_mean_delta": _mean(difference),
            "seed_wins_against_equal_volume": sum(delta < 0 for delta in difference),
            "seeds": len(seeds),
            "n_dev_check": per_seed[0]["arms"]["original"]["evaluation"][head]["n"],
            "positive_dev_check": per_seed[0]["arms"]["original"]["evaluation"][head]["positive"],
            "negative_dev_check": per_seed[0]["arms"]["original"]["evaluation"][head]["negative"],
        }
    ledger.append("experiment", {
        "schema": SCHEMA, "seeds": list(seeds),
        "dev_check_cohort_sha": cohort_sha,
        "original_dataset_sha": dataset_hashes["original"],
        "volume_control_dataset_sha": dataset_hashes["volume_control"],
        "causal_dataset_sha": dataset_hashes["causal_counterexamples"],
        "observed_metrics": by_head,
        "exploratory": True, "not_an_independent_protected_holdout": True,
    })
    report = {
        "schema": SCHEMA, "status": "EXPLORATORY_DEVELOPMENT_ONLY",
        "train_cases": train_scenarios, "dev_check_cases": check_scenarios,
        "dev_check_families": list(CHECK_FAMILIES),
        "dev_check_cohort_sha": cohort_sha, "dev_check_dataset_sha": dev_hash,
        "train_dataset_hashes": dataset_hashes,
        "train_label_coverage": {
            "original": coverage_report(original),
            "causal_counterexamples": coverage_report(improved),
        },
        "per_seed": per_seed, "per_head": by_head,
        "ledger_integrity": ledger.verify(),
        "same_training_steps_equal_volume": True,
        "single_experiment_not_statistically_confirmatory": True,
        "protected_holdout_evaluated": False,
        "model_or_policy_promoted": False,
    }
    (out / "result.json").write_text(json.dumps(report, sort_keys=True, indent=2))
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--train-cases", type=int, default=24)
    p.add_argument("--check-cases", type=int, default=48)
    p.add_argument("--epochs", type=int, default=32)
    args = p.parse_args()
    report = execute(args.out, train_scenarios=args.train_cases,
                     check_scenarios=args.check_cases, epochs=args.epochs)
    print(json.dumps({
        "schema": SCHEMA, "experiment": report["status"],
        "per_head": report["per_head"],
        "ledger_integrity": report["ledger_integrity"],
        "protected_holdout_evaluated": False,
        "results": str(Path(args.out) / "result.json"),
    }, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
