"""Actual AionRuntime vs fixed-policy causal business benchmark (offline).

The runtime and its provisional receipt memory really run, but no LLM is
required and no model-weight training occurs. The grader remains independent.
This is a synthetic integration gate, not an improvement or promotion verdict.
"""

import argparse
import json
from hashlib import sha256
from pathlib import Path
from statistics import mean

from ..lab.ledger import Ledger, read_ledger, verify_chain
from .adaptive import episode
from .causal_world import FAMILIES, generate
from .genesis_policy import run_genesis_episode

SCHEMA = "GenesisActualRuntimeCausalBenchmark/2.4"
FILES = ("result.json", "ledger.jsonl", "review.md")


def _hash(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def _summary(scores):
    return {
        "cases": len(scores),
        "paid_jobs": sum(x["paid_jobs"] for x in scores),
        "possible_jobs": sum(x["possible_jobs"] for x in scores),
        "safety_denials": sum(x["safety_denials"] for x in scores),
        "mean_fictional_cash_delta": round(mean(x["cash_change"] for x in scores), 4),
        "mean_synthetic_value_proxy": round(mean(x["synthetic_value_proxy"]
                                                for x in scores), 4),
    }


def run_benchmark(dev_count=4, validation_count=4):
    if (type(dev_count) is not int or not 2 <= dev_count <= 12 or
            type(validation_count) is not int or not 2 <= validation_count <= 12):
        raise ValueError("Bounded offline runtime verification budget is 2–12 per split")
    ledger = Ledger()
    ledger.append({"type": "runtime_benchmark_start", "schema": SCHEMA,
                   "dev_count": dev_count, "validation_count": validation_count,
                   "remote_model_calls_allowed": False,
                   "protected_holdout": False})
    outputs = {}
    for split, count in (("dev", dev_count), ("validation", validation_count)):
        rows = []
        for index in range(count):
            case = generate(split, index, family=FAMILIES[index % len(FAMILIES)])
            # Compare on exactly the same episode truth, as simple fixed
            # baselines; no policy receives the hidden shock schedule.
            real = run_genesis_episode(case, enable_outcome_memory=True)
            without_memory = run_genesis_episode(case, enable_outcome_memory=False)
            controls = {name: episode(case, name) for name in (
                "deadline_first", "cash_first", "risk_averse", "no_action")}
            assert real["model_calls"] == 0 and without_memory["model_calls"] == 0
            row = {
                "case_id": case.case_id, "case_hash": case.fingerprint(),
                "runtime_memory_on": real["score"],
                "runtime_memory_off": without_memory["score"],
                "baselines": controls,
                "runtime_verified_operations": real["verified_operations"],
                "runtime_provisional_memory_updates": real["learning_receipts"],
                "runtime_proposals": real["proposal_count"],
                "action_trace_hash": sha256(json.dumps(
                    real["trace"], sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
            }
            rows.append(row)
            ledger.append({"type": "matched_runtime_case", "split": split,
                           "evidence": row})
        outputs[split] = rows
    table = {}
    for split, rows in outputs.items():
        table[split] = {}
        for key in ("runtime_memory_on", "runtime_memory_off"):
            table[split][key] = _summary([x[key] for x in rows])
        for name in ("deadline_first", "cash_first", "risk_averse", "no_action"):
            table[split][name] = _summary([x["baselines"][name] for x in rows])
    result = {
        "schema": SCHEMA,
        "cohorts": outputs, "summaries": table,
        "memory_updates_only_from_verified_mock_operation_receipts": True,
        "memory_updates_are_provisional_not_causal_proof": True,
        "runtime": "AionRuntime",
        "domain_bridge": "synthetic_causal_business_v24",
        "model_calls": 0, "real_business_actions": 0,
        "real_training_data": False, "model_weight_training": False,
        "protected_holdout_used": False,
        "candidate_promoted": False,
        "validation_used_to_train": False,
        "nonzero_runtime_actions_are_mock_simulator_only": True,
        "unproven": [
            "General AION causal intelligence", "Real model inference quality",
            "Real contractor cash outcomes", "Independent sealed holdout",
            "Multi-tenant transfer", "Expert-calibrated human judgments",
        ],
    }
    ledger.append({"type": "runtime_benchmark_completed",
                   "result_digest": sha256(json.dumps(
                       result, sort_keys=True, separators=(",", ":")).encode()).hexdigest()})
    result["ledger_hash"] = ledger.head
    return result, ledger


def markdown(result):
    lines = [
        "# AionRuntime v2.4 causal mock integration",
        "",
        "Real AionRuntime bounded planning; provisional verified-receipt memory; "
        "no remote model inference, no live TradeFlow commands.",
        "",
        "| Public synthetic cohort | Policy | Paid jobs | Denied actions | "
        "Mean cash change (fictional) |",
        "|---|---|---:|---:|---:|",
    ]
    for split in ("dev", "validation"):
        for name, score in result["summaries"][split].items():
            lines.append(f"| {split} | {name} | "
                         f"{score['paid_jobs']}/{score['possible_jobs']} | "
                         f"{score['safety_denials']} | "
                         f"{score['mean_fictional_cash_delta']:+.2f} |")
    lines += [
        "", "This is an **integration benchmark**, not proof of superiority. "
        "Training within each fresh simulator company is provisional; no "
        "cross-company policy weights are trained, and public validation "
        "is not a protected holdout.",
    ]
    return "\n".join(lines) + "\n"


def write_run(out, dev_count=4, validation_count=4):
    root = Path(out)
    if root.exists() and any(root.iterdir()):
        raise FileExistsError("Do not overwrite evaluation artifacts")
    root.mkdir(parents=True, exist_ok=True)
    result, ledger = run_benchmark(dev_count, validation_count)
    (root / "result.json").write_text(json.dumps(
        result, sort_keys=True, indent=2) + "\n")
    ledger.write(root / "ledger.jsonl")
    (root / "review.md").write_text(markdown(result))
    (root / "manifest.json").write_text(json.dumps({
        "schema": "GenesisActualRuntimeCausalRunManifest/2.4",
        "sha256": {k: _hash(root / k) for k in FILES},
        "release_eligible": False, "secured_holdout": False,
    }, sort_keys=True, indent=2) + "\n")
    return result


def verify_run(out):
    root = Path(out)
    manifest = json.loads((root / "manifest.json").read_text())
    if (manifest.get("secured_holdout") or manifest.get("release_eligible")
            or set(manifest.get("sha256", {})) != set(FILES)):
        raise ValueError("Invalid restricted research manifest")
    for path, expected in manifest["sha256"].items():
        if _hash(root / path) != expected:
            raise ValueError("Artifact hash verification failed")
    original = json.loads((root / "result.json").read_text())
    ledger = read_ledger(root / "ledger.jsonl")
    if verify_chain(ledger):
        raise ValueError("Hash chained experiment corrupted")
    reproduced, replay = run_benchmark(
        len(original["cohorts"]["dev"]),
        len(original["cohorts"]["validation"]))
    if reproduced != original or replay.records != ledger:
        raise ValueError("Actual AionRuntime experiment not reproducible")
    if (root / "review.md").read_text() != markdown(reproduced):
        raise ValueError("Review does not match independently scored receipts")
    return {"verified": True, "independent_replay": True,
            "protected_holdout_used": False, "real_model_calls": 0,
            "real_business_actions": 0}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    a = sub.add_parser("run")
    a.add_argument("--out", required=True)
    a.add_argument("--dev", type=int, default=4)
    a.add_argument("--validation", type=int, default=4)
    b = sub.add_parser("verify")
    b.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    if args.command == "run":
        print(markdown(write_run(args.out, args.dev, args.validation)))
    else:
        print(json.dumps(verify_run(args.out), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
