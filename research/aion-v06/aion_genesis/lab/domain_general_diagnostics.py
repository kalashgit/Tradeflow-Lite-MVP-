"""Passive v1.2.4 prospective memory diagnostic; zero holdout access."""

import argparse
import json
from pathlib import Path

from .hidden import make_world
from .memory_effects import BUDGETS, TracedRuntimePolicy, _summarize
from .protocol import load_config
from .referee import hindsight_oracle, run_episode

CONFIG = Path(__file__).resolve().parent / "configs/genesis_v124_domain_general_eval.json"
POLICIES = ("v09_strategist", "aion_v1_memory",
            "aion_v123_relevant", "aion_v124_domain_relevant")
SCHEMA = "GenesisDomainGeneralRecallDiagnostics/1.0"


def build_report(partition):
    if partition not in ("dev", "validation"):
        raise ValueError("Protected holdout is prohibited in passive diagnostics")
    config = load_config(CONFIG)
    start = config["partitions"][partition]["start_seed"]
    episodes = config["partitions"][partition]["episodes"]
    rows = []
    for variant in ("nominal", "shifted"):
        for seed in range(start, start + episodes):
            world = make_world("resource_allocation", seed, variant)
            oracle = hindsight_oracle(world)
            for name in POLICIES:
                observer = TracedRuntimePolicy(name, BUDGETS)
                decisions, _ = run_episode(world, observer, partition, oracle)
                if len(decisions) != len(observer.snapshots):
                    raise RuntimeError("Incomplete public trace")
                for decision, snap in zip(decisions, observer.snapshots):
                    if decision["case_id"] != snap["case_id"]:
                        raise RuntimeError("Trace/referee mismatch")
                    if set(decision["failure_classes"]) & {
                            "policy_error", "inadmissible_action", "invalid_evidence",
                            "invalid_proposal"}:
                        raise RuntimeError("Unsafe research proposal")
                    rows.append({**decision, "instrumentation": snap})
    activity = {}
    for variant in ("nominal", "shifted"):
        ours = [r for r in rows if r["variant"] == variant
                and r["policy"] == "aion_v124_domain_relevant"]
        activity[variant] = {
            "decisions": len(ours),
            "supported_proposals": sum(
                r["instrumentation"]["retrieval"].get("supported_relevant_options", 0) > 0
                for r in ours),
            "supported_option_occurrences": sum(
                r["instrumentation"]["retrieval"].get("supported_relevant_options", 0)
                for r in ours),
            "matching_receipt_occurrences": sum(
                r["instrumentation"]["retrieval"].get("supported_receipt_matches", 0)
                for r in ours),
            "estimate_corrections": sum(
                r["instrumentation"]["memory_applied"] for r in ours),
            "score_leader_flips": sum(
                r["instrumentation"]["ranking_flip"] for r in ours),
        }
    return {"schema": SCHEMA, "research_only": True, "partition": partition,
            "seed_range": [start, start + episodes],
            "protected_holdout_evaluated": False, "real_world_improvement_proven": False,
            "hidden_truth_exposed_to_policy": False,
            "policy_actions_modified_by_instrumentation": False,
            "family": "resource_allocation", "policies": list(POLICIES),
            "activity": activity, "comparison": _summarize(rows), "cases": rows}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--partition", required=True, choices=("dev", "validation"))
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    report = build_report(args.partition)
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", "utf-8")
    print(json.dumps({"partition": args.partition, "activity": report["activity"],
                      "comparison": report["comparison"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
