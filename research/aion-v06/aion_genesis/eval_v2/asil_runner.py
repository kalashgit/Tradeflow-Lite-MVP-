"""Preregistered ASIL experiment: train on development, freeze, then validate.

    python -m aion_genesis.eval_v2.asil_runner run --out /tmp/asil-v25
    python -m aion_genesis.eval_v2.asil_runner verify --out /tmp/asil-v25

The protocol file is committed before any validation case is generated or run.
Scoring is the frozen v2.3 synthetic judge. This module can report whether
prespecified criteria were met; it cannot promote, merge or deploy anything.
No model is called and no protected holdout exists in this repository.
"""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import random

from ..asil import ConfidenceCalibrator, IntuitionMemory, RouterConfig
from ..lab.ledger import Ledger, read_ledger, verify_chain
from .adaptive import episode, judge
from .asil_policy import AsilCausalPolicy, TransitionModel
from .causal_world import FAMILIES, World, generate
from .genesis_policy import run_genesis_episode

SCHEMA = "GenesisAsilExperiment/2.5"
PROTOCOL = Path(__file__).with_name("asil_protocol_v25.json")
FILES = ("result.json", "ledger.jsonl", "review.md", "memory.json")
FIXED = ("deadline_first", "cash_first", "risk_averse", "no_action")
ASIL_MODES = ("adaptive", "fast_only", "deep_only", "memory_off", "planner_only")
BASELINES = ("planner_only", "runtime_memory_off", "runtime_memory_on", *FIXED)
SCOPE = "SYN-ASIL-LEARNER-V25"


def run_asil_episode(case, *, mode="adaptive", memory=None, model=None, config=None,
                     episode_index=0):
    """Play one matched synthetic episode and have the frozen judge score it."""
    policy = AsilCausalPolicy(case, mode=mode, memory=memory, model=model, config=config,
                              episode_index=episode_index)
    world = World(case)
    try:
        while world.tick < case.horizon:
            view = world.public_view("project_manager", tenant=policy.tenant)
            action = policy.choose(view)
            event = world.step(action)
            policy.observe(action, event["result"])
        learning = policy.finish()
        routes: dict[str, int] = {}
        for decision in policy.decisions:
            routes[decision["route"]] = routes.get(decision["route"], 0) + 1
        return {
            "schema": "GenesisAsilCausalEpisode/2.5", "case_id": case.case_id,
            "mode": mode, "score": judge(case, world.final_truth()),
            "routes": dict(sorted(routes.items())),
            "decisions": len(policy.decisions), "planning_ops": policy.planning_ops,
            "runtime_proposals": policy.proposals, "model_calls": 0,
            "latency_ms": [(d["route"], d["latency_ms"]) for d in policy.decisions],
            "calibration": list(policy.learner.calibration),
            "learning": learning, "external_business_actions": 0,
            "synthetic_mock_operations_only": True,
            "protected_holdout_evaluated": False,
        }
    finally:
        policy.close()


def _digest(value) -> str:
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def load_protocol(path=None) -> dict:
    protocol = json.loads(Path(path or PROTOCOL).read_text("utf-8"))
    if protocol.get("schema") != "GenesisAsilProtocol/2.5" or protocol.get(
            "protected_holdout_used") is not False:
        raise ValueError("Unrecognised or unsafe ASIL protocol")
    return protocol


def cohort(spec: dict, limit=None) -> list:
    """Deterministic public synthetic cases from a preregistered cohort spec."""
    count = spec["count"] if limit is None else min(limit, spec["count"])
    cases = []
    for i in range(count):
        index = spec["start_index"] + i
        family = spec.get("family") or FAMILIES[i % len(FAMILIES)]
        difficulty = spec["difficulty"][(i // len(FAMILIES)) % len(spec["difficulty"])]
        novelty = spec["novelty"][(i // 3) % len(spec["novelty"])]
        seed = None
        if spec.get("twin_of_start_index") is not None:   # same jobs, different shocks
            from .causal_world import SPLITS
            seed = SPLITS[spec["split"]] + spec["twin_of_start_index"] + i
        cases.append(generate(spec["split"], index, family=family, difficulty=difficulty,
                              novelty=novelty, seed_override=seed))
    return cases


def _row(score: dict, extra: dict | None = None) -> dict:
    row = {key: score[key] for key in ("paid_jobs", "possible_jobs", "cash_change",
                                       "safety_denials", "synthetic_value_proxy")}
    row.update(extra or {})
    return row


def _asil(case, mode, memory, model, config, index) -> tuple[dict, list]:
    out = run_asil_episode(case, mode=mode, memory=memory, model=model, config=config,
                           episode_index=index)
    fast = [c for c in out["calibration"] if c["route"] == "fast"]
    row = _row(out["score"], {
        "routes": out["routes"], "decisions": out["decisions"],
        "planning_ops": out["planning_ops"], "runtime_proposals": out["runtime_proposals"],
        "model_calls": 0, "calibration": out["calibration"],
        "fast_decisions_verified": len(fast),
        "fast_decisions_succeeded": sum(c["outcome"] for c in fast)})
    return row, out["latency_ms"]


def _baseline(case, name) -> dict:
    if name in FIXED:
        return _row(episode(case, name))
    out = run_genesis_episode(case, enable_outcome_memory=name == "runtime_memory_on")
    return _row(out["score"])


def _suite(cases, modes, baselines, memory, model, config, index, timing) -> list[dict]:
    rows = []
    for case in cases:
        row = {"case_id": case.case_id, "case_hash": case.fingerprint(),
               "family": case.family, "difficulty": case.difficulty,
               "novelty": case.novelty, "policies": {}}
        for mode in modes:
            row["policies"][mode], latency = _asil(case, mode, memory, model, config, index)
            for route, ms in latency:
                timing.setdefault(f"{mode}:{route}", []).append(ms)
        for name in baselines:
            row["policies"][name] = _baseline(case, name)
        rows.append(row)
    return rows


def _bootstrap(deltas: list[float], label: str, resamples=2000):
    if len(deltas) < 2:
        return None
    rng = random.Random(int(_digest(label)[:12], 16))
    means = sorted(sum(rng.choices(deltas, k=len(deltas))) / len(deltas)
                   for _ in range(resamples))
    return [round(means[int(0.025 * (resamples - 1))], 4),
            round(means[int(round(0.975 * (resamples - 1)))], 4)]


def _total(rows, policy, key):
    return sum(row["policies"][policy][key] for row in rows)


def summarize(rows: list[dict], label: str) -> dict:
    policies = list(rows[0]["policies"])
    table = {}
    for policy in policies:
        entry = {"cases": len(rows), "paid_jobs": _total(rows, policy, "paid_jobs"),
                 "possible_jobs": _total(rows, policy, "possible_jobs"),
                 "safety_denials": _total(rows, policy, "safety_denials"),
                 "total_cash_change": _total(rows, policy, "cash_change"),
                 "total_value_proxy": _total(rows, policy, "synthetic_value_proxy"),
                 "worst_case_cash_change": min(r["policies"][policy]["cash_change"]
                                               for r in rows)}
        if "routes" in rows[0]["policies"][policy]:
            routes: dict[str, int] = {}
            pairs = {"fast": [], "deep": []}
            for row in rows:
                for route, count in row["policies"][policy]["routes"].items():
                    routes[route] = routes.get(route, 0) + count
                for item in row["policies"][policy]["calibration"]:
                    if item["route"] in pairs:
                        pairs[item["route"]].append((item["confidence"], item["outcome"]))
            fast_n = _total(rows, policy, "fast_decisions_verified")
            fast_ok = _total(rows, policy, "fast_decisions_succeeded")
            confident_wrong = sum(1 for p, y in pairs["fast"] if p >= 0.7 and not y)
            entry.update({
                "routes": dict(sorted(routes.items())),
                "decisions": _total(rows, policy, "decisions"),
                "planning_ops": _total(rows, policy, "planning_ops"),
                "runtime_proposals": _total(rows, policy, "runtime_proposals"),
                "model_calls": 0, "tokens": "not_measured_no_model_called",
                "fast_path_reliability": {"numerator": fast_ok, "denominator": fast_n,
                                          "rate": round(fast_ok / fast_n, 4) if fast_n else None},
                "false_familiarity": {
                    "numerator": confident_wrong, "denominator": len(pairs["fast"]),
                    "rate": round(confident_wrong / len(pairs["fast"]), 4)
                    if pairs["fast"] else None},
                "calibration_fast": ConfidenceCalibrator.score(pairs["fast"]),
                "calibration_deep": ConfidenceCalibrator.score(pairs["deep"]),
            })
        table[policy] = entry
    return {"label": label, "policies": table}


def paired(rows, first, second, label) -> dict:
    deltas = [r["policies"][first]["paid_jobs"] - r["policies"][second]["paid_jobs"]
              for r in rows]
    cash = [r["policies"][first]["cash_change"] - r["policies"][second]["cash_change"]
            for r in rows]
    return {"first": first, "second": second, "cases": len(rows),
            "mean_paid_job_delta": round(sum(deltas) / len(deltas), 4),
            "paid_job_delta_ci95": _bootstrap(deltas, label + "/paid"),
            "mean_cash_delta": round(sum(cash) / len(cash), 4),
            "cash_delta_ci95": _bootstrap(cash, label + "/cash"),
            "cases_worse": sum(d < 0 for d in deltas),
            "cases_better": sum(d > 0 for d in deltas)}


def _poison(memory: IntuitionMemory, config) -> IntuitionMemory:
    """Misleading memory: every verified failure rewritten as repeated success."""
    poisoned = IntuitionMemory(memory.scope, config)
    for record in memory.records():
        poisoned.append(record)
        if record["outcome"] == 0:
            for _ in range(6):
                poisoned.append({**record, "outcome": 1, "confounders": []})
    poisoned.frozen = True
    return poisoned


def _criteria(result: dict, protocol: dict) -> list[dict]:
    limits = protocol["criteria"]
    validation = result["suites"]["validation"]
    table = validation["summary"]["policies"]
    comparisons = validation["comparisons"]
    strongest = validation["strongest_baseline"]
    adaptive, deep = table["adaptive"], table["deep_only"]

    def check(name, passed, observed, threshold):
        return {"name": name, "status": "MET" if passed else "NOT_MET",
                "observed": observed, "threshold": threshold}

    vs_best = comparisons["adaptive_vs_" + strongest]
    vs_off = comparisons["adaptive_vs_memory_off"]
    novel = result["suites"]["novel"]
    twins = result["suites"]["false_familiarity_twins"]["summary"]["policies"]["adaptive"]
    repeat = result["suites"]["familiar_repeat"]
    ops_ratio = adaptive["planning_ops"] / max(1, deep["planning_ops"])
    return [
        check("decision_quality_vs_strongest_baseline",
              vs_best["paid_job_delta_ci95"] is not None
              and vs_best["paid_job_delta_ci95"][0] > 0,
              {"strongest_baseline": strongest, **vs_best}, "paired 95% CI lower bound > 0"),
        check("experience_does_not_hurt",
              vs_off["paid_job_delta_ci95"] is not None
              and vs_off["paid_job_delta_ci95"][0] >= 0, vs_off,
              "memory-on minus memory-off paired 95% CI lower bound >= 0"),
        check("experience_improves_decisions",
              vs_off["paid_job_delta_ci95"] is not None
              and vs_off["paid_job_delta_ci95"][0] > 0, vs_off,
              "memory-on minus memory-off paired 95% CI lower bound > 0"),
        check("deep_reasoning_used_selectively",
              ops_ratio <= limits["max_planning_ops_ratio_vs_deep_only"]
              and adaptive["paid_jobs"] >= deep["paid_jobs"] * (
                  1 - limits["max_quality_loss_vs_deep_only"]),
              {"planning_ops_ratio": round(ops_ratio, 4),
               "adaptive_paid": adaptive["paid_jobs"], "deep_only_paid": deep["paid_jobs"]},
              limits["max_planning_ops_ratio_vs_deep_only"]),
        check("safety", adaptive["safety_denials"] <= table[strongest]["safety_denials"],
              {"adaptive_denials": adaptive["safety_denials"],
               "strongest_baseline_denials": table[strongest]["safety_denials"]},
              "no more denied actions than the strongest baseline"),
        check("false_familiarity",
              all(s["false_familiarity"]["rate"] is not None and
                  s["false_familiarity"]["rate"] <= limits["max_false_familiarity_rate"]
                  for s in (adaptive, twins)),
              {"validation": adaptive["false_familiarity"],
               "twins": twins["false_familiarity"]}, limits["max_false_familiarity_rate"]),
        check("fast_path_calibration",
              adaptive["calibration_fast"]["ece"] is not None
              and adaptive["calibration_fast"]["ece"] <= limits["max_fast_ece"],
              adaptive["calibration_fast"], limits["max_fast_ece"]),
        check("retention_on_familiar_cases",
              repeat["paid_jobs_repeat"] >= repeat["paid_jobs_first_exposure"]
              and repeat["planning_ops_repeat"] < repeat["planning_ops_first_exposure"],
              repeat, "no fewer paid jobs and fewer planning operations than first exposure"),
        check("transfer_to_novel_cases",
              novel["comparisons"]["adaptive_vs_" + novel["strongest_baseline"]][
                  "mean_paid_job_delta"] >= 0
              and novel["comparisons"]["adaptive_vs_memory_off"]["cases_worse"]
              <= limits["max_novel_cases_worse_than_memory_off"],
              {"vs_strongest": novel["comparisons"][
                  "adaptive_vs_" + novel["strongest_baseline"]],
               "vs_memory_off": novel["comparisons"]["adaptive_vs_memory_off"]},
              "not below strongest baseline; at most N cases worse than memory-off"),
    ]


def _with_comparisons(rows, label, baselines) -> dict:
    summary = summarize(rows, label)
    table = summary["policies"]
    strongest = max(baselines, key=lambda n: (table[n]["paid_jobs"],
                                              table[n]["total_cash_change"], n))
    comparisons = {f"adaptive_vs_{name}": paired(rows, "adaptive", name, f"{label}/{name}")
                   for name in [p for p in table if p != "adaptive"]}
    return {"summary": summary, "strongest_baseline": strongest,
            "comparisons": comparisons, "cases": rows}


def run_experiment(protocol: dict, limit=None) -> tuple[dict, Ledger, dict, dict]:
    config = RouterConfig(**protocol["router_config"])
    ledger, timing = Ledger(), {}
    ledger.append({"type": "asil_experiment_start", "schema": SCHEMA,
                   "protocol_digest": _digest(protocol),
                   "router_config_digest": config.digest(),
                   "remote_model_calls_allowed": False, "protected_holdout": False})
    memory, model = IntuitionMemory(SCOPE, config), TransitionModel()
    # 1. Development career: the only place anything is learned.
    career = []
    for index, case in enumerate(cohort(protocol["cohorts"]["training_career"], limit)):
        row, latency = _asil(case, "adaptive", memory, model, config, index)
        row.update(case_id=case.case_id, episode=index, memory_version=memory.version)
        career.append(row)
        ledger.append({"type": "career_episode", "evidence": row})
    # 2. Freeze the candidate before any validation case is generated.
    memory.frozen = model.frozen = True
    frozen = {"memory_digest": memory.digest(), "memory_records": memory.version,
              "transition_model": model.to_json(),
              "transition_model_digest": _digest(model.to_json()),
              "router_config": dict(config.__dict__), "frozen_before_validation": True}
    ledger.append({"type": "candidate_frozen", "evidence": frozen})
    index = len(career)
    cohorts, suites = protocol["cohorts"], {}

    def suite(name, rows, baselines):
        suites[name] = _with_comparisons(rows, name, baselines)
        for row in rows:
            ledger.append({"type": "matched_case", "suite": name, "evidence": row})

    suite("validation", _suite(cohort(cohorts["validation"], limit), ASIL_MODES, BASELINES,
                               memory, model, config, index, timing), BASELINES)
    stress_modes = ("adaptive", "deep_only", "memory_off")
    stress_base = ("runtime_memory_off", "deadline_first", "cash_first", "risk_averse")
    suite("novel", _suite(cohort(cohorts["novel"], limit), stress_modes, stress_base,
                          memory, model, config, index, timing), stress_base)
    suite("false_familiarity_twins",
          _suite(cohort(cohorts["false_familiarity_twins"], limit), stress_modes, stress_base,
                 memory, model, config, index, timing), stress_base)
    # 3. Retention: the training cases again, memory frozen.
    repeats = _suite(cohort(cohorts["training_career"], limit), ("adaptive",), (),
                     memory, model, config, index, timing)
    suites["familiar_repeat"] = {
        "cases": len(repeats),
        "paid_jobs_first_exposure": sum(r["paid_jobs"] for r in career),
        "paid_jobs_repeat": _total(repeats, "adaptive", "paid_jobs"),
        "possible_jobs": _total(repeats, "adaptive", "possible_jobs"),
        "planning_ops_first_exposure": sum(r["planning_ops"] for r in career),
        "planning_ops_repeat": _total(repeats, "adaptive", "planning_ops"),
        "cases_worse_than_first_exposure": sum(
            b["policies"]["adaptive"]["paid_jobs"] < a["paid_jobs"]
            for a, b in zip(career, repeats)),
    }
    ledger.append({"type": "familiar_repeat", "evidence": suites["familiar_repeat"]})
    # 4. Negative controls on memory itself (validation cases, fresh memories).
    control_cases = cohort(cohorts["validation"], limit)[:protocol["memory_control_cases"]]
    clean = _suite(control_cases, ("adaptive",), (), memory, model, config, index, timing)
    poisoned = _suite(control_cases, ("adaptive",), (), _poison(memory, config), model,
                      config, index, timing)
    stale = _suite(control_cases, ("adaptive",), (), memory, model, config,
                   index + protocol["stale_memory_age_episodes"], timing)
    controls = {}
    for name, rows in (("clean", clean), ("misleading", poisoned), ("stale", stale)):
        s = summarize(rows, "memory_control/" + name)["policies"]["adaptive"]
        controls[name] = {k: s[k] for k in (
            "paid_jobs", "possible_jobs", "safety_denials", "total_cash_change", "routes",
            "planning_ops", "fast_path_reliability", "false_familiarity")}
    suites["memory_controls"] = controls
    ledger.append({"type": "memory_controls", "evidence": controls})

    blocks, size = [], max(1, len(career) // 4)
    for start in range(0, len(career), size):
        part = career[start:start + size]
        blocks.append({"episodes": [start, start + len(part) - 1],
                       "paid_jobs": sum(r["paid_jobs"] for r in part),
                       "possible_jobs": sum(r["possible_jobs"] for r in part),
                       "planning_ops": sum(r["planning_ops"] for r in part),
                       "fast_decisions": sum(r["routes"].get("fast", 0) for r in part),
                       "deep_decisions": sum(r["routes"].get("deep", 0)
                                             + r["routes"].get("deep_abstain", 0)
                                             for r in part)})
    result = {
        "schema": SCHEMA, "protocol_digest": _digest(protocol),
        "candidate": frozen, "career_learning_curve": blocks, "suites": suites,
        "model_calls": 0, "real_business_actions": 0, "protected_holdout_used": False,
        "validation_used_to_train": False, "candidate_promoted": False,
        "promotion_authorized": False,
        "evidence_tier": "synthetic_simulation_public_dev_and_validation_only",
    }
    if limit is None:
        result["criteria"] = _criteria(result, protocol)
        met = all(c["status"] == "MET" for c in result["criteria"])
        result["status"] = ("ALL_PRESPECIFIED_CRITERIA_MET_EXTERNAL_REVIEW_REQUIRED" if met
                            else "PRESPECIFIED_CRITERIA_NOT_ALL_MET")
    ledger.append({"type": "asil_experiment_completed", "result_digest": _digest(result)})
    result["ledger_hash"] = ledger.head
    percentile = lambda v, q: sorted(v)[int(round(q * (len(v) - 1)))]  # noqa: E731
    latency = {name: {"decisions": len(values), "p50_ms": percentile(values, 0.5),
                      "p95_ms": percentile(values, 0.95)}
               for name, values in sorted(timing.items())}
    return result, ledger, memory.to_json(), latency


def markdown(result: dict, latency: dict | None = None) -> str:
    lines = ["# ASIL v2.5 — preregistered synthetic experiment", "",
             "Synthetic simulation only. Zero model calls, no real business action, no "
             "protected holdout. A met criterion is not a promotion.", "",
             f"**Status: {result.get('status', 'SMOKE_RUN_NO_CRITERIA')}**", ""]
    for name in ("validation", "novel", "false_familiarity_twins"):
        suite = result["suites"][name]
        lines += [f"## {name} ({suite['summary']['policies']['adaptive']['cases']} cases)", "",
                  "| Policy | Paid jobs | Denied | Total cash change | Worst case cash | "
                  "Planning ops | Fast / deep decisions |", "|---|---:|---:|---:|---:|---:|---:|"]
        for policy, s in suite["summary"]["policies"].items():
            routes = s.get("routes", {})
            lines.append(
                f"| {policy} | {s['paid_jobs']}/{s['possible_jobs']} | {s['safety_denials']} "
                f"| {s['total_cash_change']:+d} | {s['worst_case_cash_change']:+d} | "
                f"{s.get('planning_ops', '—')} | "
                f"{routes.get('fast', '—')} / {routes.get('deep', '—')} |")
        lines.append("")
    if "criteria" in result:
        lines += ["## Prespecified criteria", "", "| Criterion | Status |", "|---|---|"]
        lines += [f"| {c['name']} | {c['status']} |" for c in result["criteria"]]
        lines.append("")
    controls = result["suites"]["memory_controls"]
    lines += ["## Memory negative controls (adaptive)", "",
              "| Memory | Paid jobs | Denied | Cash change | Planning ops | False familiarity |",
              "|---|---:|---:|---:|---:|---:|"]
    for name, s in controls.items():
        ff = s["false_familiarity"]
        lines.append(f"| {name} | {s['paid_jobs']}/{s['possible_jobs']} | "
                     f"{s['safety_denials']} | {s['total_cash_change']:+d} | "
                     f"{s['planning_ops']} | {ff['numerator']}/{ff['denominator']} |")
    repeat = result["suites"]["familiar_repeat"]
    lines += ["", "## Retention", "",
              f"First exposure {repeat['paid_jobs_first_exposure']}/{repeat['possible_jobs']} "
              f"paid with {repeat['planning_ops_first_exposure']} planning operations; "
              f"repeat {repeat['paid_jobs_repeat']}/{repeat['possible_jobs']} with "
              f"{repeat['planning_ops_repeat']}.", ""]
    if latency:
        lines += ["## Decision latency (this machine, not part of the replayed result)", "",
                  "| Mode | Decisions | p50 ms | p95 ms |", "|---|---:|---:|---:|"]
        lines += [f"| {n} | {v['decisions']} | {v['p50_ms']} | {v['p95_ms']} |"
                  for n, v in latency.items()]
        lines.append("")
    return "\n".join(lines) + "\n"


def write_run(out, protocol=None, limit=None) -> dict:
    root = Path(out)
    if root.exists() and any(root.iterdir()):
        raise FileExistsError("Do not overwrite evaluation artifacts")
    root.mkdir(parents=True, exist_ok=True)
    protocol = protocol or load_protocol()
    result, ledger, memory, latency = run_experiment(protocol, limit)
    (root / "result.json").write_text(json.dumps(result, sort_keys=True, indent=1) + "\n")
    ledger.write(root / "ledger.jsonl")
    (root / "review.md").write_text(markdown(result))
    (root / "memory.json").write_text(json.dumps(memory, sort_keys=True) + "\n")
    (root / "latency.json").write_text(json.dumps(latency, sort_keys=True, indent=1) + "\n")
    (root / "manifest.json").write_text(json.dumps({
        "schema": "GenesisAsilRunManifest/2.5", "limit": limit,
        "sha256": {name: sha256((root / name).read_bytes()).hexdigest() for name in FILES},
        "release_eligible": False, "secured_holdout": False}, sort_keys=True, indent=1) + "\n")
    return result


def verify_run(out, protocol=None) -> dict:
    root = Path(out)
    manifest = json.loads((root / "manifest.json").read_text())
    if manifest.get("secured_holdout") or manifest.get("release_eligible") or set(
            manifest.get("sha256", {})) != set(FILES):
        raise ValueError("Invalid restricted research manifest")
    for name, expected in manifest["sha256"].items():
        if sha256((root / name).read_bytes()).hexdigest() != expected:
            raise ValueError("Artifact hash verification failed: " + name)
    original = json.loads((root / "result.json").read_text())
    recorded = read_ledger(root / "ledger.jsonl")
    if verify_chain(recorded):
        raise ValueError("Hash chained experiment corrupted")
    protocol = protocol or load_protocol()
    if original["protocol_digest"] != _digest(protocol):
        raise ValueError("Result was produced under a different protocol")
    reproduced, replay, memory, _ = run_experiment(protocol, manifest.get("limit"))
    if reproduced != original or replay.records != recorded:
        raise ValueError("ASIL experiment is not reproducible from its protocol")
    if json.loads((root / "memory.json").read_text()) != memory:
        raise ValueError("Frozen memory snapshot does not match the replay")
    if (root / "review.md").read_text() != markdown(reproduced):
        raise ValueError("Review does not match independently scored receipts")
    return {"verified": True, "independent_replay": True, "status": original.get("status"),
            "protected_holdout_used": False, "real_model_calls": 0,
            "real_business_actions": 0, "promotion_authorized": False}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run")
    run.add_argument("--out", required=True)
    run.add_argument("--limit", type=int, help="smoke run: first N cases per cohort")
    check = sub.add_parser("verify")
    check.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    if args.command == "run":
        print(markdown(write_run(args.out, limit=args.limit)))
    else:
        print(json.dumps(verify_run(args.out), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
