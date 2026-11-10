"""Mock workflow research runner: deterministic trace, paired policies, replay.

Usage:
    python -m aion_genesis.eval_v2 run --suite dev --out /tmp/genesis-mock-dev
    python -m aion_genesis.eval_v2 verify --out /tmp/genesis-mock-dev

A new policy can be added through policies.make_policy without modifying the
frozen AION v1 grader or this mock-world judge. The suite admits no holdout.
"""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import os

from ..lab.ledger import Ledger, read_ledger, verify_chain
from .judge import evaluate, summarize
from .policies import POLICIES, make_policy
from .sandbox import MockContractorWorld
from .scenarios import VERSION, load_suite, manifest

SCHEMA = "GenesisMockToolLabRun/1.0"
BASELINES = ("no_action", "safe_rule", "eager_rule")


def _canonical(data):
    return json.dumps(data, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _filehash(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def run_suite(suite, policies=BASELINES):
    scenarios = load_suite(suite)  # This deliberately fails for 'holdout'.
    if not isinstance(policies, (list, tuple)) or not policies or len(set(policies)) != len(policies):
        raise ValueError("Invalid candidate/baseline selection")
    if "no_action" not in policies or "safe_rule" not in policies:
        raise ValueError("Non-gamable paired evaluation requires both controls")
    if any(p not in POLICIES for p in policies):
        raise ValueError("Unknown or unregistered candidate policy")
    ledger = Ledger()
    profile = manifest(suite)
    ledger.append({"type": "experiment_started", "schema": SCHEMA,
                   "suite": suite, "policies": list(policies),
                   "scenario_manifest": profile})
    per_policy = {name: [] for name in policies}
    case_matrix = []
    for scenario in scenarios:
        case_scores = {}
        for name in policies:
            world, agent = MockContractorWorld(scenario), make_policy(name)
            for _ in range(scenario.horizon):
                world.prepare_tick()
                public = world.public_view()
                error = None
                try:
                    call = agent.choose(dict(public))
                except Exception as exc:
                    error = type(exc).__name__
                    call = {"tool": "invalid_candidate_failure", "key": ""}
                event = world.step(call)
                try:
                    agent.observe(dict(call), dict(event["result"]))
                except Exception as exc:
                    error = type(exc).__name__
                ledger.append({
                    **event, "suite": suite, "family": scenario.family,
                    "scenario_id": scenario.scenario_id, "policy": name,
                    "policy_error": error,
                })
            scored = evaluate(scenario, world.judge_state())
            per_policy[name].append(scored)
            case_scores[name] = scored
            ledger.append({"type": "episode", "suite": suite,
                           "scenario_id": scenario.scenario_id,
                           "scenario_hash": scenario.fingerprint(),
                           "family": scenario.family, "policy": name,
                           "judged": scored, "final": world.judge_state()})
        case_matrix.append({"case_id": scenario.scenario_id,
                            "family": scenario.family,
                            "policies": case_scores})
    scores = {name: summarize(items) for name, items in per_policy.items()}
    # Every policy must face exactly the same authored scenarios; this is a
    # separate scorecard from the sealed old Genesis v1 scorer.
    report = {
        "schema": SCHEMA,
        "research_only": True,
        "suite": suite, "simulator_version": VERSION,
        "manifest": profile, "policies": list(policies),
        "evidence_tier": "fictional_synthetic_workflow",
        "model_inference_calls": 0,
        "external_business_actions": 0,
        "protected_holdout_evaluated": False,
        "real_world_quality_proven": False,
        "promotion": "blocked_without_independent_review",
        "scorecard": scores, "case_matrix": case_matrix,
        "candidate_eval_status": "diagnostic_only",
        "coverage": {
            "tested": ["mock_tool_auth", "material_procurement", "crew_scheduling",
                       "ambiguous_tool_commit", "idempotency", "workflow_recovery",
                       "multiweek_scope_changes", "budget_pressure",
                       "completed_work_verification"],
            "not_measured": ["real_integrations", "real_agent_memory",
                             "actual_llm_reasoning", "real_contractor_decisions",
                             "human_calibration", "secured_holdout",
                             "real_money_savings"],
        },
        "limitations": [
            "Synthetic fixture data are readable from this public repository; not hidden.",
            "No true randomized or causally valid real-world counterfactual oracle.",
            "The simulator is not a production business tool or an authorization server.",
            "An agent can potentially inspect repository source: this is no security boundary.",
            "The policy registry only includes deterministic test agents until a new candidate is integrated.",
        ],
    }
    ledger.append({"type": "experiment_completed", "summary_digest": sha256(
        _canonical({"scores": scores, "case_matrix": case_matrix}).encode()).hexdigest()})
    report["ledger_hash"] = ledger.head
    return report, ledger


def render_markdown(report):
    lines = [
        "# Genesis Mock Workflow Laboratory",
        "",
        f"**Suite:** {report['suite']} | **Evidence:** fictional synthetic workflows",
        "",
        "| Policy | Verified completion | Mean net value (incl. missed opportunity proxy) | Permission/tool violations | Unknown commits seen |",
        "|---|---:|---:|---:|---:|",
    ]
    for name in report["policies"]:
        p = report["scorecard"][name]
        good = p["verified_completion"]
        lines.append(f"| {name} | {good['numerator']}/{good['denominator']} | "
                     f"{p['mean_net_value_including_missed_opportunity_proxy']:.2f} | "
                     f"{p['safety_violation_attempts']} | "
                     f"{p['unknown_commit_faults_encountered']} |")
    lines += ["", "**Not a promotion verdict.** Human adjudication is not present, "
              "protected holdout is unavailable, and these are fictional outcomes.",
              "",
              "An always-idle policy pays a missed-opportunity proxy when a job "
              "was feasible. This proxy is not a counterfactual oracle.",
              ""]
    return "\n".join(lines)


def write_run(suite, out, policies=BASELINES):
    target = Path(out)
    if target.exists() and any(target.iterdir()):
        raise FileExistsError("Run destination must be empty: never overwrite evidence")
    target.mkdir(parents=True, exist_ok=True)
    result, ledger = run_suite(suite, policies)
    (target / "result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n")
    ledger.write(target / "ledger.jsonl")
    (target / "review.md").write_text(render_markdown(result))
    hashes = {name: _filehash(target / name)
              for name in ("result.json", "ledger.jsonl", "review.md")}
    (target / "manifest.json").write_text(json.dumps({
        "schema": "GenesisMockWorkflowRunManifest/1.0",
        "sha256": hashes, "source_sha": os.environ.get("GITHUB_SHA", "unrecorded"),
        "release_eligible": False,
        "heldout": False,
    }, indent=2, sort_keys=True) + "\n")
    return result


def verify_run(out):
    path = Path(out)
    files = ("result.json", "ledger.jsonl", "review.md", "manifest.json")
    if any(not (path / f).is_file() for f in files):
        raise ValueError("Incomplete synthetic evaluation artifacts")
    evidence = json.loads((path / "manifest.json").read_text())
    for fname, expected in evidence["sha256"].items():
        if _filehash(path / fname) != expected:
            raise ValueError("Artifact integrity failed: " + fname)
    result = json.loads((path / "result.json").read_text())
    if result.get("protected_holdout_evaluated") or result.get("promotion") != (
            "blocked_without_independent_review"):
        raise ValueError("Unexpected promotion/holdout status")
    records = read_ledger(path / "ledger.jsonl")
    if verify_chain(records):
        raise ValueError("Ledger hash chain failed")
    expected, replayed = run_suite(result["suite"], tuple(result["policies"]))
    if result != expected or records != replayed.records:
        raise ValueError("Deterministic replay does not match recorded experiment")
    if (path / "review.md").read_text() != render_markdown(result):
        raise ValueError("Review content differs from scored evidence")
    return {"schema": "GenesisMockWorkflowReplay/1.0",
            "valid": True, "reproduced": True,
            "suite": result["suite"], "ledger_hash": expected["ledger_hash"],
            "protected_holdout_evaluated": False}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run")
    run.add_argument("--suite", choices=("dev", "validation"), required=True)
    run.add_argument("--out", required=True)
    ver = sub.add_parser("verify")
    ver.add_argument("--out", required=True)
    args = p.parse_args(argv)
    if args.command == "run":
        report = write_run(args.suite, args.out)
        print(render_markdown(report))
    else:
        print(json.dumps(verify_run(args.out), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
