"""Capped, paired single-model Qwen study before the full AION model tournament.

This evaluates prompt-provided observational memory. It does not update model
weights or establish autonomous causal learning. Outputs are research-only.
"""

import argparse
from hashlib import sha256
import json
import os
from time import perf_counter

from .model_lab import benchmark_model
from .ollama import LocalOllamaAdapter
from .tournament import MeteredAdapter, ResearchBudgetExceeded, _preflight


def run_bounded_ablation(adapter, *, model_name: str, live_transport: bool = False,
                        jobs: int = 8, shift_at: int = 3,
                        pilot_seed: int = 300, holdout_seed: int = 9000,
                        max_total_calls: int = 40,
                        max_wall_seconds: int = 1200) -> dict:
    if not 5 <= jobs <= 40 or not 0 < shift_at < jobs:
        raise ValueError("Invalid synthetic episode configuration")
    if pilot_seed == holdout_seed:
        raise ValueError("Pilot and holdout must use different world seeds")
    required = 1 + (2 * jobs * 2)  # Connectivity + two arms in both cohorts.
    if not required <= max_total_calls <= 200:
        raise ValueError(f"Aborted before inference: {required} calls required")
    if not 10 <= max_wall_seconds <= 7200:
        raise ValueError("Invalid experiment wall clock cap")

    protocol = {
        "model": model_name, "jobs": jobs, "shift_at": shift_at,
        "pilot_seed": pilot_seed, "holdout_seed": holdout_seed,
        "memory_conditions": ["observation_memory", "memory_off"],
        "max_total_calls": max_total_calls,
        "max_wall_seconds": max_wall_seconds,
        "world": "synthetic_tradeflow_v1",
        "prompt": "tradeflow_model_prompt_v1",
    }
    result = {
        "aion_version": "0.6.1", "experiment": "single_model_memory_ablation",
        "status": "pending", "model": model_name,
        "transport": "local_ollama_endpoint" if live_transport else "test_fixture_not_a_model",
        "protocol": protocol,
        "protocol_sha256": sha256(json.dumps(protocol, sort_keys=True).encode()).hexdigest(),
        "github_commit": os.getenv("GITHUB_SHA"),
        "inference_attempted_calls": 0,
        "real_inference_verified": False,
        "pilot": None, "holdout": None,
        "research_admission": "BLOCKED",
        "no_production_data": True,
        "no_business_actions": True,
        "no_persistent_memory": True,
        "no_weight_updates": True,
        "automatic_promotion": False,
        "limitations": [
            "Observational prompt memory is not weight training or causal proof",
            "Two tiny cohorts do not establish statistically reliable transfer",
            "An HTTP model ID alone does not independently attest model weights",
        ],
    }
    started = perf_counter()
    ledger = {"attempted_calls": 0}
    capped = MeteredAdapter(adapter, ledger, max_total_calls, started + max_wall_seconds)
    stage = "preflight"
    try:
        _preflight(capped)
        result["real_inference_verified"] = live_transport
        stage = "pilot"
        result["pilot"] = benchmark_model(
            capped, model_name, start_seed=pilot_seed, companies=1,
            jobs=jobs, shift_at=shift_at, ablate_memory=True, max_calls=2 * jobs,
            fixture=not live_transport,
        )
        stage = "holdout"
        result["holdout"] = benchmark_model(
            capped, model_name, start_seed=holdout_seed, companies=1,
            jobs=jobs, shift_at=shift_at, ablate_memory=True, max_calls=2 * jobs,
            fixture=not live_transport,
        )
    except (RuntimeError, ValueError, TimeoutError, OSError) as exc:
        result["status"] = "INCOMPLETE"
        result["failure_stage"] = stage
        result["failure_type"] = type(exc).__name__
        # No raw model content, endpoint URL, credentials, or hidden world rules.
    else:
        result["status"] = "COMPLETE" if live_transport else "FIXTURE_ONLY"
        result["holdout_memory_delta_cents"] = round(
            result["holdout"]["model_policy"]["mean_net_contribution_cents"]
            - result["holdout"]["no_memory_control"]["mean_net_contribution_cents"], 2,
        )
        result["holdout_brier_memory_vs_off"] = {
            "on": result["holdout"]["model_policy"]["material_brier_lower_is_better"],
            "off": result["holdout"]["no_memory_control"]["material_brier_lower_is_better"],
        }
    result["inference_attempted_calls"] = ledger["attempted_calls"]
    result["inference_seconds"] = round(capped.elapsed_seconds, 3)
    result["wall_seconds"] = round(perf_counter() - started, 3)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="One-model live Qwen memory ablation")
    parser.add_argument("--model", default="qwen3:0.6b")
    parser.add_argument("--base-url", default="http://127.0.0.1:11434")
    parser.add_argument("--jobs", type=int, default=8)
    parser.add_argument("--shift-at", type=int, default=3)
    parser.add_argument("--max-total-calls", type=int, default=40)
    parser.add_argument("--max-wall-seconds", type=int, default=1200)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    adapter = LocalOllamaAdapter(model=args.model, base_url=args.base_url)
    report = run_bounded_ablation(
        adapter, model_name=args.model, live_transport=True,
        jobs=args.jobs, shift_at=args.shift_at,
        max_total_calls=args.max_total_calls,
        max_wall_seconds=args.max_wall_seconds,
    )
    with open(args.output, "w", encoding="utf-8") as file:
        json.dump(report, file, indent=2, sort_keys=True)
    print(json.dumps({
        "status": report["status"], "research_admission": report["research_admission"],
        "attempted_calls": report["inference_attempted_calls"],
        "failure_stage": report.get("failure_stage"),
        "holdout_memory_delta_cents": report.get("holdout_memory_delta_cents"),
    }, sort_keys=True))
    if report["status"] != "COMPLETE":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
