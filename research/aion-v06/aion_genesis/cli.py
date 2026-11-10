"""CLI: reproducible evolutionary baseline and optional real-Qwen smoke test."""

import argparse
import json
from pathlib import Path

from .evolution import evolve
from .investigation import investigate
from .provider import CompatibleChatAdapter, InferenceConfig
from .recovery import run_recovery, run_sweep
from .dashboard import render_recovery_dashboard
from .dashboard import render_transfer_dashboard
from .dashboard import render_tradeflow_world_dashboard
from .transfer import run_transfer
from .tradeflow_lab import benchmark_tradeflow_world
from .model_lab import FixtureChatModel, benchmark_model
from .model_compare import compare_model_reports
from .dashboard import render_model_dashboard
from .dashboard import render_tournament_dashboard
from .tournament import parse_candidates, run_tournament


def main(argv=None):
    parser = argparse.ArgumentParser(description="AION Genesis experimental research core")
    sub = parser.add_subparsers(dest="command", required=True)
    benchmark = sub.add_parser("benchmark", help="Evolve and independently evaluate learners")
    benchmark.add_argument("--seed", type=int, default=42)
    benchmark.add_argument("--generations", type=int, default=5)
    benchmark.add_argument("--population", type=int, default=8)
    benchmark.add_argument("--dev-worlds", type=int, default=24)
    benchmark.add_argument("--holdout-worlds", type=int, default=24)
    benchmark.add_argument("--budget", type=int, default=12)
    benchmark.add_argument("--output", type=Path, help="Optional JSON report destination")
    sub.add_parser("qwen-smoke", help="Send one real request to configured Qwen endpoint")
    investigation = sub.add_parser("investigate", help="Watch hypothesis revisions as evidence arrives")
    investigation.add_argument("--world-seed", type=int, default=7)
    recovery = sub.add_parser("recover", help="Detect, validate, and adapt to a hidden causal shift")
    recovery.add_argument("--seed", type=int, default=42)
    recovery.add_argument("--output", type=Path, help="Optional JSON report")
    recovery.add_argument("--html", type=Path, help="Optional standalone mobile-readable report")
    cohort = sub.add_parser("recovery-sweep", help="Compare adaptation across a prespecified seed cohort")
    cohort.add_argument("--worlds", type=int, default=50)
    cohort.add_argument("--start-seed", type=int, default=0)
    cohort.add_argument("--output", type=Path, help="Optional JSON report")
    transfer = sub.add_parser("transfer", help="Learn a validated probe policy, then test transfer")
    transfer.add_argument("--memory", type=Path, default=Path("reports/causal_memory.sqlite3"))
    transfer.add_argument("--source-worlds", type=int, default=16)
    transfer.add_argument("--target-worlds", type=int, default=40)
    transfer.add_argument("--output", type=Path, help="Optional JSON study report")
    transfer.add_argument("--html", type=Path, help="Optional standalone summary visualization")
    business = sub.add_parser("tradeflow-world", help="Benchmark simulated contractor decisions")
    business.add_argument("--start-seed", type=int, default=100)
    business.add_argument("--companies", type=int, default=50)
    business.add_argument("--jobs", type=int, default=80)
    business.add_argument("--shift-at", type=int, default=30)
    business.add_argument("--output", type=Path, help="Optional JSON benchmark report")
    business.add_argument("--html", type=Path, help="Optional standalone dashboard")
    model_eval = sub.add_parser("model-eval", help="Bounded simulated model comparison")
    adapter_mode = model_eval.add_mutually_exclusive_group(required=True)
    adapter_mode.add_argument("--fixture", action="store_true",
                              help="Run deterministic wiring fixture, NOT an LLM")
    adapter_mode.add_argument("--live", action="store_true",
                              help="Explicitly allow real configured endpoint calls, potentially billed")
    model_eval.add_argument("--start-seed", type=int, default=300)
    model_eval.add_argument("--companies", type=int, default=1)
    model_eval.add_argument("--jobs", type=int, default=20)
    model_eval.add_argument("--shift-at", type=int, default=8)
    model_eval.add_argument("--max-calls", type=int, default=40)
    model_eval.add_argument("--ablate-memory", action="store_true",
                            help="Run paired no-memory control (DOUBLES model calls)")
    model_eval.add_argument("--output", type=Path, help="JSON model comparison and trace")
    model_eval.add_argument("--html", type=Path, help="Standalone experiment dashboard")
    compare = sub.add_parser("compare-models", help="Paired model trial comparison, no automatic promotion")
    compare.add_argument("reports", type=Path, nargs="+", help="Two or more JSON model-eval reports")
    compare.add_argument("--output", type=Path, help="Optional JSON comparison report")
    tournament = sub.add_parser("tournament", help="Bounded model tournament with locked pilot and holdout")
    tournament.add_argument("--config", type=Path, required=True,
                            help="JSON candidate manifest with environment-variable references")
    tournament_mode = tournament.add_mutually_exclusive_group(required=True)
    tournament_mode.add_argument("--live", action="store_true", help="Explicit real endpoint calls; may be billed")
    tournament_mode.add_argument("--fixture", action="store_true", help="Scripted non-AI test fixtures")
    tournament.add_argument("--pilot-seed", type=int, default=300)
    tournament.add_argument("--pilot-companies", type=int, default=1)
    tournament.add_argument("--holdout-seed", type=int, default=9000)
    tournament.add_argument("--holdout-companies", type=int, default=1)
    tournament.add_argument("--jobs", type=int, default=8)
    tournament.add_argument("--shift-at", type=int, default=3)
    tournament.add_argument("--ablate-memory", action="store_true")
    tournament.add_argument("--max-total-calls", type=int, required=True,
                            help="Explicit cap across candidates, preflights, and episodes")
    tournament.add_argument("--max-wall-seconds", type=int, default=600)
    tournament.add_argument("--output", type=Path, help="Optional JSON tournament report")
    tournament.add_argument("--html", type=Path, help="Optional mobile dashboard")
    args = parser.parse_args(argv)

    if args.command == "tournament":
        if args.config.stat().st_size > 32_000:
            raise ValueError("Candidate manifest exceeds 32KB")
        manifest = json.loads(args.config.read_text(encoding="utf-8"))
        mode = "live" if args.live else "fixture"
        candidates = parse_candidates(manifest, mode)
        result = run_tournament(
            candidates, mode, pilot_seed=args.pilot_seed,
            pilot_companies=args.pilot_companies, holdout_seed=args.holdout_seed,
            holdout_companies=args.holdout_companies, jobs=args.jobs,
            shift_at=args.shift_at, ablate_memory=args.ablate_memory,
            max_total_calls=args.max_total_calls,
            max_wall_seconds=args.max_wall_seconds,
        )
        report = json.dumps(result, indent=2, sort_keys=True)
        print(report)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(report + "\n", encoding="utf-8")
        if args.html:
            args.html.parent.mkdir(parents=True, exist_ok=True)
            args.html.write_text(render_tournament_dashboard(result), encoding="utf-8")
        if result["status"] in ("blocked_configuration", "incomplete"):
            raise SystemExit(2)
        return

    if args.command == "compare-models":
        reports = []
        for path in args.reports:
            if path.stat().st_size > 3_000_000:
                raise ValueError("Model report exceeds 3MB safety bound")
            reports.append(json.loads(path.read_text(encoding="utf-8")))
        report = json.dumps(compare_model_reports(reports), indent=2, sort_keys=True)
        print(report)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(report + "\n", encoding="utf-8")
        return

    if args.command == "qwen-smoke":
        configuration = InferenceConfig.from_environment()
        answer = CompatibleChatAdapter(configuration).complete([
            {"role": "system", "content": "Reply with exactly the token AION_OK."},
            {"role": "user", "content": "Connectivity verification."},
        ])
        print(json.dumps({
            "model": configuration.model,
            "connected": True,
            "response": answer,
            "exact_instruction_followed": answer.strip() == "AION_OK",
        }, indent=2))
        return

    if args.command == "investigate":
        print(json.dumps(investigate(world_seed=args.world_seed), indent=2))
        return

    if args.command in ("recover", "recovery-sweep"):
        result = run_recovery(seed=args.seed) if args.command == "recover" else run_sweep(
            worlds=args.worlds, start_seed=args.start_seed
        )
        report = json.dumps(result.as_dict() if args.command == "recover" else result,
                            indent=2, sort_keys=True)
        print(report)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(report + "\n", encoding="utf-8")
        if args.command == "recover" and args.html:
            args.html.parent.mkdir(parents=True, exist_ok=True)
            args.html.write_text(render_recovery_dashboard(result), encoding="utf-8")
        return

    if args.command == "transfer":
        result = run_transfer(
            memory_path=args.memory, source_worlds=args.source_worlds,
            target_worlds=args.target_worlds,
        )
        report = json.dumps(result, indent=2, sort_keys=True)
        print(report)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(report + "\n", encoding="utf-8")
        if args.html:
            args.html.parent.mkdir(parents=True, exist_ok=True)
            args.html.write_text(render_transfer_dashboard(result), encoding="utf-8")
        return

    if args.command == "tradeflow-world":
        result = benchmark_tradeflow_world(
            start_seed=args.start_seed, companies=args.companies,
            jobs=args.jobs, shift_at=args.shift_at,
        )
        report = json.dumps(result, indent=2, sort_keys=True)
        print(report)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(report + "\n", encoding="utf-8")
        if args.html:
            args.html.parent.mkdir(parents=True, exist_ok=True)
            args.html.write_text(render_tradeflow_world_dashboard(result), encoding="utf-8")
        return

    if args.command == "model-eval":
        configuration = InferenceConfig.from_environment() if args.live else None
        adapter = CompatibleChatAdapter(configuration) if configuration else FixtureChatModel()
        result = benchmark_model(
            adapter, configuration.model if configuration else "fixture_static_rule",
            start_seed=args.start_seed, companies=args.companies,
            jobs=args.jobs, shift_at=args.shift_at, max_calls=args.max_calls,
            fixture=args.fixture, ablate_memory=args.ablate_memory,
        )
        report = json.dumps(result, indent=2, sort_keys=True)
        print(report)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(report + "\n", encoding="utf-8")
        if args.html:
            args.html.parent.mkdir(parents=True, exist_ok=True)
            args.html.write_text(render_model_dashboard(result), encoding="utf-8")
        return

    result = evolve(
        seed=args.seed, generations=args.generations,
        population_size=args.population, training_worlds=args.dev_worlds,
        holdout_worlds=args.holdout_worlds, budget=args.budget,
    ).as_dict()
    report = json.dumps(result, indent=2, sort_keys=True)
    print(report)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
