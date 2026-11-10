"""Non-holdout prospective v1.2.3 relevance diagnosis, passive by construction.

The policy never sees hidden state, its comparator or a judge result.
The independent referee evaluates decisions only after they are committed.
"""

import argparse
import json
from pathlib import Path

from .hidden import make_world
from .memory_effects import BUDGETS, TracedRuntimePolicy, _summarize
from .protocol import load_config
from .referee import hindsight_oracle, run_episode

CONFIG = Path(__file__).resolve().parent / "configs/genesis_v123_relevance_eval.json"
POLICIES = ("v09_strategist", "aion_v1_memory", "aion_v123_relevant")
SCHEMA = "GenesisRelevantRecallDiagnostics/1.0"


def build_report(partition):
    if partition not in ("dev", "validation"):
        raise ValueError("Research diagnostics never run a protected holdout")
    config = load_config(CONFIG)
    start = config["partitions"][partition]["start_seed"]
    episodes = config["partitions"][partition]["episodes"]
    cases = []
    for variant in ("nominal", "shifted"):
        for seed in range(start, start + episodes):
            world = make_world("resource_allocation", seed, variant)
            oracle = hindsight_oracle(world)
            for name in POLICIES:
                observer = TracedRuntimePolicy(name, BUDGETS)
                rows, _ = run_episode(world, observer, partition, oracle)
                if len(rows) != len(observer.snapshots):
                    raise RuntimeError("Incomplete public research trace")
                for decision, snapshot in zip(rows, observer.snapshots):
                    if decision["case_id"] != snapshot["case_id"]:
                        raise RuntimeError("Decision/referee reconciliation failed")
                    if set(decision["failure_classes"]) & {
                            "policy_error", "invalid_proposal", "inadmissible_action",
                            "invalid_evidence"}:
                        raise RuntimeError("Invalid research proposal in diagnosis")
                    cases.append({**decision, "instrumentation": snapshot})
    summary = _summarize(cases)
    activity = {}
    for variant in ("nominal", "shifted"):
        selected = [r for r in cases
                    if r["variant"] == variant and r["policy"] == "aion_v123_relevant"]
        activity[variant] = {
            "decisions": len(selected),
            "supported_proposals": sum(
                r["instrumentation"]["retrieval"].get("supported_relevant_options", 0) > 0
                for r in selected),
            "supported_option_occurrences": sum(
                r["instrumentation"]["retrieval"].get("supported_relevant_options", 0)
                for r in selected),
            "matched_receipt_occurrences": sum(
                r["instrumentation"]["retrieval"].get("supported_receipt_matches", 0)
                for r in selected),
            "applied_estimate_corrections": sum(
                r["instrumentation"]["memory_applied"] for r in selected),
            "score_leader_flips": sum(
                r["instrumentation"]["ranking_flip"] for r in selected),
        }
    return {
        "schema": SCHEMA, "research_only": True,
        "protected_holdout_evaluated": False,
        "policy_actions_modified_by_instrumentation": False,
        "hidden_truth_exposed_to_policy": False,
        "real_world_improvement_proven": False,
        "partition": partition, "seed_range": [start, start + episodes],
        "policies": list(POLICIES), "family": "resource_allocation",
        "activity": activity, "comparison": summary, "cases": cases,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--partition", required=True, choices=("dev", "validation"))
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    result = build_report(args.partition)
    target = Path(args.out)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", "utf-8")
    print(json.dumps({"partition": args.partition, "activity": result["activity"],
                      "comparisons": result["comparison"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
