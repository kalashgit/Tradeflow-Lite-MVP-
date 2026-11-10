"""One CLI for the Genesis lab: run, validate and re-render a seeded experiment.

    python -m aion_genesis.lab run --out /tmp/genesis-lab
    python -m aion_genesis.lab validate --out /tmp/genesis-lab --reproduce
"""

import argparse
import json
from pathlib import Path
import sys

from .ledger import read_ledger
from .observatory import render_observatory
from .protocol import PARTITIONS, load_config, protocol_hash
from .runner import run_experiment
from .validate import ARTIFACTS, file_hash, validate_run


def _history(out: Path) -> list[dict]:
    index = out / "index.jsonl"
    if not index.is_file():
        return []
    return [json.loads(line) for line in index.read_text("utf-8").splitlines() if line.strip()]


def _latest(out: Path) -> Path:
    if (out / "ledger.jsonl").is_file():
        return out
    history = _history(out)
    if not history:
        raise SystemExit(f"No Genesis lab run found under {out}")
    return out / "runs" / history[-1]["run_id"]


def _headline(result: dict) -> dict:
    partition = "holdout" if "holdout" in result["partitions"] else next(
        iter(result["partitions"]))
    harm = result["partitions"][partition]["scorecard"]["comparisons"][
        "candidate_vs_baseline"]["pooled"]["shifted"]["harmful_choice_rate_delta"]
    return {"partition": partition,
            "candidate_harm": harm.get("first", {}).get("rate"),
            "baseline_harm": harm.get("second", {}).get("rate"),
            "relative_reduction": harm.get("relative_reduction")}


def _run(args) -> int:
    config = load_config(args.config)
    out = Path(args.out)
    history = _history(out)
    result, ledger = run_experiment(config, tuple(args.partitions), history=history)
    run_dir = out / "runs" / result["run"]["run_id"]
    run_dir.mkdir(parents=True, exist_ok=False)
    ledger.write(run_dir / "ledger.jsonl")
    (run_dir / "result.json").write_text(
        json.dumps(result, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    entry = {
        "run_id": result["run"]["run_id"], "started_at_utc": result["started_at_utc"],
        "source_commit": result["source"]["commit"], "partitions": list(args.partitions),
        "holdout_seeds": config["partitions"]["holdout"],
        "protocol_hash": protocol_hash(config), "config_hash": result["run"][
            "artifact_hashes"]["config"],
        "logical_digest": result["logical_digest"], "verdict": result["verdict"],
        "status": result["status"], "headline": _headline(result),
    }
    (run_dir / "report.html").write_text(
        render_observatory(result, ledger.records, [*history, entry]), encoding="utf-8")
    (run_dir / "manifest.json").write_text(json.dumps({
        "run_id": entry["run_id"],
        "sha256": {name: file_hash(run_dir / name) for name in ARTIFACTS},
    }, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    with (out / "index.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, sort_keys=True) + "\n")
    print(json.dumps({
        "run_dir": str(run_dir), "report": str(run_dir / "report.html"),
        "verdict": result["verdict"], "verdict_basis": result["verdict_basis"],
        "status": result["status"], "logical_digest": result["logical_digest"],
        "decisions": result["speed_economics"]["decisions"],
        "wall_seconds": result["speed_economics"]["wall_seconds"],
        "model_inference_calls": 0, "headline": entry["headline"],
        "evidence_tier": "synthetic_simulation",
    }, sort_keys=True, indent=2))
    # The command succeeded even when the candidate did not: a FAIL verdict is
    # a valid scientific result. Only an unusable run is an error.
    return 0 if result["status"] == "completed" else 2


def _validate(args) -> int:
    run_dir = _latest(Path(args.out))
    report = validate_run(run_dir, reproduce=args.reproduce)
    (run_dir / "validation.json").write_text(
        json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, sort_keys=True, indent=2))
    if args.expect_digest and report.get("logical_digest") != args.expect_digest:
        print("Logical digest differs from the expected reference.", file=sys.stderr)
        return 1
    return 0 if report["valid"] else 1


def _report(args) -> int:
    out = Path(args.out)
    run_dir = _latest(out)
    result = json.loads((run_dir / "result.json").read_text("utf-8"))
    html = render_observatory(result, read_ledger(run_dir / "ledger.jsonl"), _history(out))
    target = Path(args.html) if args.html else run_dir / "report.preview.html"
    target.write_text(html, encoding="utf-8")
    print(str(target))
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m aion_genesis.lab",
        description="AION Genesis v1.0 experimental control plane (synthetic research only)")
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="Run a bounded, seeded comparative experiment")
    run.add_argument("--out", required=True, help="Lab folder (ledger, results, history)")
    run.add_argument("--config", help="Frozen experiment config (default: built-in v1.0)")
    run.add_argument("--partitions", nargs="+", choices=PARTITIONS,
                     default=["validation", "holdout"])
    run.set_defaults(handler=_run)
    check = sub.add_parser("validate", help="Independently verify the latest run")
    check.add_argument("--out", required=True, help="Lab folder or one run directory")
    check.add_argument("--reproduce", action="store_true",
                       help="Re-run the recorded config and compare logical outcomes")
    check.add_argument("--expect-digest", help="Fail unless the logical digest equals this")
    check.set_defaults(handler=_validate)
    report = sub.add_parser("report", help="Re-render the HTML report from stored files")
    report.add_argument("--out", required=True)
    report.add_argument("--html", help="Where to write the re-rendered report")
    report.set_defaults(handler=_report)
    args = parser.parse_args(argv)
    return args.handler(args)
