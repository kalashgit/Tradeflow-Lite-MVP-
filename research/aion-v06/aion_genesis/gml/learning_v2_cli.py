"""Opt-in Genesis learning-v2 diagnostics: train, measure, compare (DEV ONLY).

Usage:
    python -m aion_genesis.gml.learning_v2_cli audit --out /tmp/genesis-v2
    python -m aion_genesis.gml.learning_v2_cli compare --out /tmp/genesis-v2

A run never touches public/protected/adversarial evaluations, never promotes a
candidate, and never requires Qwen inference or any credential. The optional
PyTorch experiment checks whether better label coverage actually improves a
world model on separate development cases, not whether Genesis has achieved
general intelligence or completed a new policy-learning generation.
"""

import argparse
import json
from pathlib import Path

from . import factory, laboratory
from .contracts import content_hash, file_hash, write_jsonl
from .learning_v2 import (
    GenerationLedger, collect_training_probes, combine_training_evidence,
    coverage_report, training_focus,
)

LEARNING_V2_VERSION = "genesis-dev-learning-experiment/2"


def _cohort(start: int, count: int):
    if type(start) is not int or type(count) is not int or not (
            1 <= count <= 60 and 0 <= start < 4500 and start + count <= 4500):
        raise ValueError("Invalid strictly development-only cohort")
    return laboratory.scenarios(
        "train", count, start=start, families=("working_capital",))


def _baseline(scenarios):
    return factory.build_transition_dataset(
        factory.collect_transitions(scenarios))["examples"]


def _brier(predict, rows):
    from .training.world_model import HEADS
    predictions = predict(rows)
    result = {}
    for index, head in enumerate(HEADS):
        pairs = [(float(predictions[i][index]), row["label"][head])
                 for i, row in enumerate(rows) if head in row["label"]]
        if not pairs:
            result[head] = {"n": 0, "positive": 0, "negative": 0,
                            "brier": None}
            continue
        result[head] = {
            "n": len(pairs), "positive": sum(v == 1 for _, v in pairs),
            "negative": sum(v == 0 for _, v in pairs),
            "brier": round(sum((p - y) ** 2 for p, y in pairs) / len(pairs), 6),
        }
    return result


def execute(out, *, training_cases=24, dev_check_cases=12,
            epochs=32, train_models=False):
    """New experiment is opt-in and does not override GML v1's protocol."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    training = _cohort(1400, training_cases)
    checks = _cohort(3300, dev_check_cases)
    train_ids = {s.case.seed for s in training}
    check_ids = {s.case.seed for s in checks}
    if train_ids & check_ids:
        raise AssertionError("Development control cohort overlaps training")

    baseline_rows = _baseline(training)
    probes = collect_training_probes(training, max_cases=training_cases)
    improved_rows = combine_training_evidence(baseline_rows, probes)
    control_rows = combine_training_evidence(
        _baseline(checks), collect_training_probes(checks, max_cases=dev_check_cases))
    prior = coverage_report(baseline_rows, min_per_class=8)
    current = coverage_report(improved_rows, min_per_class=8)
    record = {
        "schema": LEARNING_V2_VERSION,
        "experiment_class": "unpromoted_development_diagnostic",
        "training_scenarios": len(training),
        "dev_check_scenarios": len(checks),
        "training_cohort_sha": content_hash([
            (s.scenario_id, s.case.fingerprint()) for s in training]),
        "dev_check_cohort_sha": content_hash([
            (s.scenario_id, s.case.fingerprint()) for s in checks]),
        "baseline": prior, "balanced": current,
        "improvement_proposals": training_focus(current),
        "baseline_examples": len(baseline_rows),
        "probe_examples": len(probes),
        "balanced_examples": len(improved_rows),
        "dev_check_examples": len(control_rows),
        "dev_check_is_protected_holdout": False,
        "training_metadata_visible_to_candidate": False,
        "evaluated_model_weights": bool(train_models),
        "model_results": None,
        "automatic_promotion": False,
    }
    rows_dir = out / "datasets"
    rows_dir.mkdir(exist_ok=True)
    before_sha = write_jsonl(rows_dir / "baseline.jsonl", baseline_rows)
    after_sha = write_jsonl(rows_dir / "balanced.jsonl", improved_rows)
    check_sha = write_jsonl(rows_dir / "dev-check.jsonl", control_rows)
    record["dataset_sha256"] = dict(
        baseline=before_sha, balanced=after_sha, dev_check=check_sha)

    if train_models:
        from .training import world_model as wm
        spec = wm.WorldModelConfig(hidden=32, epochs=epochs, seed=43, batch=128)
        fitted_base = wm.train(
            baseline_rows, spec,
            dataset_id="learning-v2-baseline", dataset_sha256=before_sha)
        fitted_better = wm.train(
            improved_rows, spec,
            dataset_id="learning-v2-balanced", dataset_sha256=after_sha)
        base_path = out / "models" / "baseline"
        improved_path = out / "models" / "candidate"
        wm.save(base_path, fitted_base)
        wm.save(improved_path, fitted_better)
        original = wm.load(base_path)
        candidate = wm.load(improved_path)
        baseline_scores = _brier(lambda rows: wm.predict(original, rows), control_rows)
        candidate_scores = _brier(lambda rows: wm.predict(candidate, rows), control_rows)
        changes = {head: {
            "baseline_brier": baseline_scores[head]["brier"],
            "balanced_brier": candidate_scores[head]["brier"],
            "delta_brier_candidate_minus_baseline": (
                round(candidate_scores[head]["brier"] - baseline_scores[head]["brier"], 6)
                if candidate_scores[head]["brier"] is not None else None),
            "n": baseline_scores[head]["n"],
            "positives": baseline_scores[head]["positive"],
            "negatives": baseline_scores[head]["negative"],
        } for head in wm.HEADS}
        ledger = GenerationLedger(out / "generations.sqlite3")
        hashes = [file_hash(base_path / "model.pt"), file_hash(improved_path / "model.pt")]
        variants = []
        for model_file_hash, dataset_hash, parent, marker in (
                (hashes[0], before_sha, None, "baseline"),
                (hashes[1], after_sha, None, "balanced")):
            # These are siblings (matched models from the same initial RNG),
            # not a claim that the candidate fine-tunes the baseline checkpoint.
            generation = ledger.register_generation(
                parent=parent, source_sha=file_hash(__file__),
                model_sha=model_file_hash, dataset_sha=dataset_hash,
                memory_sha=content_hash("none"),
                curriculum_sha=content_hash(["train", training_cases]),
                architecture_sha=file_hash(Path(wm.__file__)),
                note="development only: " + marker)
            variants.append(generation)
        ledger.append("experiment", {
            "control_generation": variants[0], "candidate_generation": variants[1],
            "same_initial_seed": 43,
            "paired_evaluation_cohort_sha": record["dev_check_cohort_sha"],
            "metrics": changes,
            "no_independent_holdout": True,
            "no_policy_success_metric": True,
        })
        record["model_results"] = {
            "comparison": changes, "generations": variants,
            "ledger_integrity": ledger.verify(),
            "baseline_model_sha256": hashes[0],
            "candidate_model_sha256": hashes[1],
            "baseline_training": fitted_base["lineage"],
            "candidate_training": fitted_better["lineage"],
            "verdict": "INCONCLUSIVE_DEVELOPMENT_ONLY",
            "note": "New causal probes may improve label support; only measured "
                    "fresh development Brier deltas establish any predictive benefit.",
        }
    (out / "result.json").write_text(json.dumps(record, sort_keys=True, indent=2))
    return record


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("mode", choices=("audit", "compare"))
    cli.add_argument("--out", required=True)
    cli.add_argument("--training-cases", type=int, default=24)
    cli.add_argument("--dev-check-cases", type=int, default=12)
    cli.add_argument("--epochs", type=int, default=32)
    opts = cli.parse_args()
    result = execute(
        opts.out, training_cases=opts.training_cases,
        dev_check_cases=opts.dev_check_cases,
        epochs=opts.epochs, train_models=opts.mode == "compare")
    print(json.dumps({
        "experiment": result["schema"],
        "coverage_before": result["baseline"]["label_heads"],
        "coverage_after": result["balanced"]["label_heads"],
        "models": result["model_results"]["comparison"]
        if result["model_results"] else None,
        "record": str(Path(opts.out) / "result.json"),
        "automatic_promotion": False,
    }, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
