"""Experiment runner: frozen config → matched seeded episodes → ledger → result.

``summarize`` is a pure function of the ledger, so an independent validator can
recompute every reported number from the raw rows.
"""

from datetime import datetime, timezone
from pathlib import Path
import subprocess
from time import perf_counter

from ..runtime.contracts import ENGINE_VERSION, ExperimentRunV1, digest
from .hidden import FAMILIES, make_world
from .ledger import Ledger, events, logical_digest
from .policies import POLICY_VERSIONS, build_policy
from .promotion import evaluate_gate
from .protocol import (
    GRADER_VERSION, LAB_VERSION, PARTITIONS, VARIANTS, adapters, config_hash,
    grader_source_hash, protocol_hash, validate_config,
)
from .referee import hindsight_oracle, run_episode
from .scorecard import build_scorecard, not_measured

RESULT_SCHEMA = "GenesisLabResult/1.0"
LIMITATIONS = [
    "Every world is a small simulator written by the same team as the candidate; "
    "results are synthetic and say nothing about real contractors or machines.",
    "Zero language-model calls were made; nothing here is live model learning.",
    "The referee runs in the same Python process as the candidate. Module "
    "separation is not a security boundary against hostile code.",
    "The legacy memory policy fits additive correction per decision component; "
    "the opt-in contextual candidate is experimental, sparse and unvalidated.",
    "'Harmful' means realized worse than no action on matched shocks, so prudent "
    "preventive spend that turned out unnecessary is counted as harm.",
    "The holdout-reuse guard only sees the local run history in the output folder.",
    "Latency is in-process Python on small option sets, not model or network latency.",
]


def source_commit() -> dict:
    root = Path(__file__).resolve().parent
    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True,
                                text=True, timeout=10, check=True).stdout.strip()
        dirty = bool(subprocess.run(
            ["git", "status", "--porcelain", "--", str(root.parent.parent)], cwd=root,
            capture_output=True, text=True, timeout=10, check=True).stdout.strip())
        return {"commit": commit, "dirty": dirty}
    except (OSError, subprocess.SubprocessError):
        return {"commit": "unknown", "dirty": None}


def protocol_conflict(history: list[dict], config: dict, partitions) -> bool:
    """True when this holdout was already scored under different judging rules."""
    if "holdout" not in partitions:
        return False
    seeds, current = config["partitions"]["holdout"], protocol_hash(config)
    return any("holdout" in entry.get("partitions", ())
               and entry.get("holdout_seeds") == seeds
               and entry.get("protocol_hash") != current for entry in history)


def run_experiment(config: dict, partitions=("validation", "holdout"), *,
                   history: list[dict] = (), clock=perf_counter) -> tuple[dict, Ledger]:
    validate_config(config)
    partitions = tuple(partitions)
    if not partitions or len(set(partitions)) != len(partitions) or set(
            partitions) - set(PARTITIONS):
        raise ValueError("Unknown or repeated seed partition")
    if set(config["families"]) - set(FAMILIES):
        raise ValueError("Unknown world family")
    budgets, started = config["budgets"], clock()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ledger = Ledger()
    ledger.append({
        "type": "run_started",
        "run_id": f"RUN-{stamp}-{digest([config, list(partitions), stamp], 8)}",
        "started_at_utc": stamp, "lab_version": LAB_VERSION,
        "grader_version": GRADER_VERSION, "engine_version": ENGINE_VERSION,
        "config": config, "config_hash": config_hash(config),
        "protocol_hash": protocol_hash(config),
        "grader_source_hash": grader_source_hash(), "source": source_commit(),
        "partitions": list(partitions),
        "holdout_protocol_conflict": protocol_conflict(list(history), config, partitions),
        "policy_versions": {name: POLICY_VERSIONS[name] for name in config["policies"]},
        "world_versions": {name: FAMILIES[name].version for name in config["families"]},
        "domain_versions": {a.domain_id: a.version for a in adapters()},
        "model_identity": "none (no model configured; 0 inference calls)",
    })
    decisions = skipped = 0
    for partition in partitions:
        part = config["partitions"][partition]
        for family in config["families"]:
            cost = FAMILIES[family].horizon * len(config["policies"])
            for variant in VARIANTS:
                for seed in range(part["start_seed"], part["start_seed"] + part["episodes"]):
                    if (decisions + cost > budgets["max_decisions"]
                            or clock() - started > budgets["max_wall_seconds"]):
                        skipped += 1   # a whole matched group, never a partial one
                        continue
                    world = make_world(family, seed, variant)
                    oracle = hindsight_oracle(world)
                    for name in config["policies"]:
                        rows, episode = run_episode(
                            world, build_policy(name, budgets), partition, oracle, clock)
                        for row in rows:
                            ledger.append(row)
                        ledger.append(episode)
                        decisions += len(rows)
    ledger.append({
        "type": "run_completed",
        "status": "completed" if skipped == 0 else "budget_exhausted",
        "decisions": decisions, "skipped_matched_groups": skipped,
        "wall_seconds": round(clock() - started, 3),
        "logical_digest": logical_digest(ledger.records),
    })
    return summarize(ledger.records), ledger


def _percentile(values: list[float], fraction: float) -> float | None:
    return sorted(values)[int(round(fraction * (len(values) - 1)))] if values else None


def summarize(records: list[dict]) -> dict:
    """Rebuild the complete result from ledger records alone."""
    start, end = events(records, "run_started"), events(records, "run_completed")
    if len(start) != 1 or len(end) != 1:
        raise ValueError("A ledger must hold exactly one started and one completed run")
    start, end = start[0], end[0]
    config = validate_config(start["config"])
    rows = [e for e in events(records) if e.get("type") in ("decision", "episode")]
    decisions = [r for r in rows if r["type"] == "decision"]
    partitions, gate_partition = {}, config["promotion_gate"]["partition"]
    for partition in start["partitions"]:
        scorecard = build_scorecard(rows, config, partition)
        partitions[partition] = {"scorecard": scorecard, "gate": evaluate_gate(
            scorecard, config, run_status=end["status"],
            protocol_conflict=start["holdout_protocol_conflict"])}
    if gate_partition in partitions:
        verdict = partitions[gate_partition]["gate"]["verdict"]
        basis = "protected holdout gate"
    else:
        verdict = "BLOCKED" if end["status"] != "completed" else "INCONCLUSIVE"
        basis = "protected holdout not evaluated in this run"
    selection = partitions.get("validation", {}).get("gate", {}).get("verdict")
    failures: dict[str, dict[str, int]] = {}
    latency: dict[str, list[float]] = {}
    for row in decisions:
        latency.setdefault(row["policy"], []).append(row["latency_ms"])
        for name in row["failure_classes"]:
            failures.setdefault(row["policy"], {}).setdefault(name, 0)
            failures[row["policy"]][name] += 1
    model_calls = sum(r["model_calls"] for r in decisions)
    seconds = end["wall_seconds"]
    run = ExperimentRunV1(
        run_id=start["run_id"], source_commit=start["source"]["commit"],
        candidate_version=start["policy_versions"][config["candidate"]],
        baseline_version=start["policy_versions"][config["baseline"]],
        domain_version=start["domain_versions"], world_family=tuple(config["families"]),
        seed_partition={p: config["partitions"][p] for p in start["partitions"]},
        grader_version=start["grader_version"], model_identity=start["model_identity"],
        memory_mode="paired_on_and_off", budgets=config["budgets"],
        metrics={"decisions": end["decisions"], "model_calls": model_calls,
                 "logical_digest": end["logical_digest"]},
        failure_classes={p: dict(sorted(f.items())) for p, f in sorted(failures.items())},
        artifact_hashes={"config": start["config_hash"], "protocol": start["protocol_hash"],
                         "grader_source": start["grader_source_hash"],
                         "ledger_head": records[-1]["hash"]},
        verdict=verdict)
    return {
        "schema": RESULT_SCHEMA, "run": run.to_json(), "status": end["status"],
        "source": start["source"], "started_at_utc": start["started_at_utc"],
        "lab_version": start["lab_version"], "config": config,
        "policy_versions": start["policy_versions"],
        "world_versions": start["world_versions"],
        "labels": {
            "evidence_tier": "synthetic_simulation",
            "model_inference": "none",
            "model_inference_calls": model_calls,
            "real_world_improvement_proven": False,
            "live_model_learning_proven": False,
            "external_actions": 0,
        },
        "logical_digest": end["logical_digest"],
        "verdict": verdict, "verdict_basis": basis,
        "partitions": partitions,
        "research_throughput": {
            "candidate_trials": len(start["partitions"]),
            "candidates_evaluated": 1,
            "candidates_eligible_for_human_review": int(verdict == "PASS"),
            "false_discoveries": None if selection is None or gate_partition not in partitions
            else int(selection == "PASS" and verdict != "PASS"),
            "accepted_improvements": not_measured(
                "acceptance requires a human promotion review that has not happened"),
            "independently_reproduced_improvements": not_measured(
                "set by the separate validation job, not by the runner"),
            "human_review_hours": not_measured("no human review time was recorded"),
            "improvements_per_review_hour_per_compute_cost": not_measured(
                "needs accepted improvements and review hours"),
            "throughput_multiplier": not_measured(
                "this run is the first baseline; no earlier throughput exists to compare"),
        },
        "speed_economics": {
            "wall_seconds": seconds, "decisions": end["decisions"],
            "decisions_per_second": round(end["decisions"] / seconds, 3) if seconds else None,
            "decision_latency_ms": {policy: {
                "p50": _percentile(values, 0.5), "p95": _percentile(values, 0.95),
                "n": len(values)} for policy, values in sorted(latency.items())},
            "hardware": "single CPU process, no GPU",
            "model_calls": model_calls,
            "tokens": not_measured("no model was called"),
            "monetary_spend": not_measured("no paid inference; local CPU cost not metered"),
        },
        "not_measured": {
            "option_discovery": not_measured(
                "options come from each pack's declared finite axes; no separate "
                "admissible-set oracle exists yet (Work Package 3)"),
            "proactivity": not_measured("no alerting behaviour or attention budget is tested"),
            "tenant_role_isolation_in_run": not_measured(
                "covered by unit tests; each episode here is a single isolated tenant"),
            "product_value": not_measured(
                "contractor task success, invoice readiness, minutes saved, device "
                "acceptance and willingness to pay need real users, not simulation"),
        },
        "limitations": LIMITATIONS,
    }
