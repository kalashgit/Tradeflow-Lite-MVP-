"""Reproducible CLI for AION's synthetic multi-option decision experiment."""

import argparse
import json
from pathlib import Path

from .domains.electrical_strategy import (
    DEMO_CASE, ElectricalStrategyPack, STRATEGY_DEMO_OBSERVATIONS,
    plan_for_electrical_situation,
)
from .situation_engine import SituationStore
from .strategic_evaluator import evaluate_strategy
from .strategic_planner import Goals, StrategicPlanner


def main() -> None:
    parser = argparse.ArgumentParser(description="AION v0.9 research-only strategy search")
    parser.add_argument("command", choices=("plan", "benchmark"))
    parser.add_argument("--output", required=True)
    parser.add_argument("--worlds", type=int, default=100)
    parser.add_argument("--seed", type=int, default=8000)
    parser.add_argument("--regime", choices=("nominal", "unexpected_failure"),
                        default="nominal")
    parser.add_argument("--max-spend", type=float, default=500)
    parser.add_argument("--source", choices=("situation", "direct"),
                        default="situation")
    args = parser.parse_args()
    if args.command == "benchmark":
        report = evaluate_strategy(start_seed=args.seed, worlds=args.worlds,
                                   regime=args.regime)
        summary = {key: report[key] for key in (
            "worlds", "hidden_regime", "mean_planner_actual_value",
            "mean_baseline_actual_value", "fraction_planner_worse_than_baseline",
            "mean_planner_regret_to_hindsight_oracle", "p95_planning_ms",
            "autonomous_learning_proven",
        )}
    else:
        goals = Goals(
            weights={"schedule": 5, "margin": 3, "crew_productivity": 2,
                     "customer_trust": 1},
            max_spend=args.max_spend, uncertainty_aversion=0.5,
        )
        if args.source == "direct":
            report = StrategicPlanner().enumerate_and_rank(
                ElectricalStrategyPack(), DEMO_CASE, DEMO_CASE.evidence(), goals,
            )
            report["case_source"] = "direct_synthetic_fixture"
        else:
            store = SituationStore(":memory:")
            try:
                for observation in STRATEGY_DEMO_OBSERVATIONS:
                    store.observe(observation)
                for objective, weight in goals.weights.items():
                    store.set_goal("OWNER-1", objective, weight)
                report = plan_for_electrical_situation(
                    store, "OWNER-1", "MATERIAL-BATCH-7", args.max_spend,
                )
            finally:
                store.close()
        summary = {key: report[key] for key in (
            "declared_combinations", "feasible_options", "pareto_survivors",
            "selected", "planning_ms", "learned_policy_verified",
        )}
    Path(args.output).write_text(json.dumps(report, sort_keys=True, indent=2) + "\n",
                                 encoding="utf-8")
    print(json.dumps(summary, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
