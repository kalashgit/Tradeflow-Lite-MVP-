"""Independent scorecard and replay for the public multi-project lab track.

It is NOT the frozen Genesis v1 judge, and no score here is evidence of real
business outcomes or causal counterfactual accuracy.
"""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from statistics import mean

from ..lab.ledger import Ledger, read_ledger, verify_chain
from .portfolio_agents import BASELINES, make_policy
from .portfolio_cases import load_suite, manifest
from .portfolio import PortfolioWorld

SCHEMA = "GenesisPortfolioEvaluation/2.1"
CONTROLS = ("no_action", "deadline_first", "cash_aware")


def _hash(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def score(case, final):
    """Score state after completion; no hidden data is passed to candidates."""
    by_id = {j.job_id: j for j in case.jobs}
    completed, verified, paid, on_time, weight = 0, 0, 0, 0, 0
    profit_proxy = 0
    for job in case.jobs:
        name = job.job_id
        done = final["work"][name] >= final["required"][name]
        was_verified = name in final["verified"]
        completed += bool(done)
        verified += bool(done and was_verified)
        paid += name in final["paid"]
        on_time += bool(was_verified and final["verified"][name] <= job.deadline)
        if was_verified:
            weight += final["priorities"][name]
        # Simple authored opportunity proxy (not a counterfactual oracle).
        if (job.crew_approved and job.material_cost <= job.order_limit and
                case.cash >= job.material_cost + job.labor_cost):
            profit_proxy += max(0, job.payment - job.material_cost -
                                job.labor_cost * job.shifts)
    missed = round(profit_proxy * (1 - verified / len(case.jobs)))
    cash_delta = final["cash"] - case.cash
    # Multi-metric reporting matters more than this descriptive composite.
    composite = cash_delta + 20 * weight - missed
    return {
        "case_id": case.case_id,
        "verified_jobs": verified, "completed_jobs": completed,
        "paid_jobs": paid, "on_time_jobs": on_time,
        "total_jobs": len(case.jobs),
        "priority_weight_verified": weight,
        "ending_cash": final["cash"], "cash_delta": cash_delta,
        "unused_crew_slots": final["unused_crew_slots"],
        "safety_denied_or_invalid": final["invalid_or_denied"],
        "mock_tool_failures": final["tool_failures"],
        "unknown_write_outcomes": final["unknown_commits"],
        "idempotency_duplicate_preventions": final["duplicate_prevented"],
        "missed_opportunity_proxy": missed,
        "descriptive_composite_not_a_promotion_gate": composite,
        "real_world_performance_proven": False,
    }


def summarize(cases):
    if not cases:
        raise ValueError("Cannot summarize an empty fictional portfolio cohort")
    return {
        "cases": len(cases),
        "verified_jobs": sum(s["verified_jobs"] for s in cases),
        "possible_jobs": sum(s["total_jobs"] for s in cases),
        "paid_jobs": sum(s["paid_jobs"] for s in cases),
        "on_time_jobs": sum(s["on_time_jobs"] for s in cases),
        "mean_cash_delta": round(mean(s["cash_delta"] for s in cases), 4),
        "mean_descriptive_composite": round(mean(
            s["descriptive_composite_not_a_promotion_gate"] for s in cases), 4),
        "owner_priority_weight_verified": sum(
            s["priority_weight_verified"] for s in cases),
        "safety_denied_or_invalid": sum(s["safety_denied_or_invalid"]
                                       for s in cases),
        "unknown_write_outcomes": sum(s["unknown_write_outcomes"] for s in cases),
        "missed_opportunity_proxy_total": sum(
            s["missed_opportunity_proxy"] for s in cases),
        "unused_crew_slots": sum(s["unused_crew_slots"] for s in cases),
    }


def evaluate_suite(suite, policies=CONTROLS):
    cases = load_suite(suite)  # Reject holdout, independently of candidate.
    if not isinstance(policies, (tuple, list)) or not policies:
        raise ValueError("Missing policy cohort")
    if (len(set(policies)) != len(policies) or
            any(name not in BASELINES for name in policies) or
            not {"no_action", "deadline_first", "cash_aware"} <= set(policies)):
        raise ValueError("Matched controls cannot be removed or replaced")
    ledger = Ledger()
    roster = manifest(suite)
    ledger.append({"type": "portfolio_started", "suite": suite,
                   "schema": SCHEMA, "manifest": roster,
                   "policies": list(policies)})
    all_scores = {name: [] for name in policies}
    paired = []
    for case in cases:
        comparison = {}
        for name in policies:
            world, policy = PortfolioWorld(case), make_policy(name)
            # Exact action/cost budgets. Each world tick allows up to 5 calls.
            while world.tick < case.horizon:
                public = world.public_view()
                exception = None
                try:
                    action = policy.choose(dict(public))
                except Exception as exc:
                    exception = type(exc).__name__
                    action = {"tool": "invalid_candidate_failure",
                              "job_id": "", "key": ""}
                entry = world.step(action)
                try:
                    policy.observe(dict(action), dict(entry["result"]))
                except Exception as exc:
                    exception = type(exc).__name__
                ledger.append({
                    "type": "portfolio_tool_step", "suite": suite,
                    "case_id": case.case_id, "policy": name,
                    "public_event": entry, "policy_error": exception,
                })
            final = world.judge_state()
            values = score(case, final)
            all_scores[name].append(values)
            comparison[name] = values
            ledger.append({"type": "portfolio_episode", "suite": suite,
                           "case_id": case.case_id, "policy": name,
                           "score": values, "state": final})
        paired.append({"case_id": case.case_id, "policies": comparison})
    digest = sha256(json.dumps(paired, sort_keys=True,
                               separators=(",", ":")).encode()).hexdigest()
    ledger.append({"type": "portfolio_completed", "paired_digest": digest})
    result = {
        "schema": SCHEMA, "suite": suite, "manifest": roster,
        "policy_names": list(policies), "scorecards": {
            name: summarize(scores) for name, scores in all_scores.items()},
        "paired_cases": paired,
        "ledger_hash": ledger.head,
        "research_only": True, "protected_holdout_evaluated": False,
        "real_world_improvement_proven": False,
        "autonomous_business_actions": 0,
        "promotion": "not_authorized",
        "capabilities_tested": [
            "shared_cash", "shared_crew_capacity", "shared_supplier_capacity",
            "payment_delay", "owner_priority_updates", "scope_expansion",
            "mock_tool_uncertainty", "verified_completion"],
        "limitations": [
            "Public authored synthetic fixtures, not hidden validation.",
            "No actual Genesis planner or LLM policy is registered in this cohort.",
            "A projected opportunity cost is not an independent causal oracle.",
            "No actual employees, finances, customer data or tool calls.",
            "Do not select or retune a candidate after viewing validation results.",
        ],
    }
    return result, ledger


def render(result):
    lines = [
        "# Genesis v2.1 Mock Portfolio Benchmark",
        "",
        f"Research suite: {result['suite']} (public synthetic; no secured holdout).",
        "",
        "| Policy | Verified jobs | Paid jobs | Cash delta mean | "
        "Safety denials | Idle crew slots |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for policy in result["policy_names"]:
        s = result["scorecards"][policy]
        lines.append(f"| {policy} | {s['verified_jobs']}/{s['possible_jobs']} | "
                     f"{s['paid_jobs']} | {s['mean_cash_delta']:+.2f} | "
                     f"{s['safety_denied_or_invalid']} | {s['unused_crew_slots']} |")
    lines += ["", "No candidate promotion, secured holdout or real business "
              "improvement has been established.", ""]
    return "\n".join(lines)


def write_run(suite, out):
    target = Path(out)
    if target.exists() and any(target.iterdir()):
        raise FileExistsError("Never overwrite an existing evidence directory")
    target.mkdir(parents=True, exist_ok=True)
    result, ledger = evaluate_suite(suite)
    (target / "result.json").write_text(
        json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n")
    ledger.write(target / "ledger.jsonl")
    (target / "review.md").write_text(render(result))
    files = ("result.json", "ledger.jsonl", "review.md")
    (target / "manifest.json").write_text(json.dumps({
        "schema": "GenesisPortfolioArtifactManifest/2.1",
        "sha256": {file: _hash(target / file) for file in files},
        "promotion": "not_authorized", "sealed_holdout": False,
    }, indent=2, sort_keys=True) + "\n")
    return result


def verify_run(path):
    target = Path(path)
    metadata = json.loads((target / "manifest.json").read_text())
    if metadata.get("sealed_holdout") or metadata.get("promotion") != "not_authorized":
        raise ValueError("Invalid evaluation custody or promotion status")
    for filename, digest in metadata["sha256"].items():
        if _hash(target / filename) != digest:
            raise ValueError("Portfolio artifact tampering detected")
    result = json.loads((target / "result.json").read_text())
    records = read_ledger(target / "ledger.jsonl")
    if verify_chain(records):
        raise ValueError("Hash-chained evaluation ledger invalid")
    expected, reproduced = evaluate_suite(result["suite"], tuple(result["policy_names"]))
    if expected != result or reproduced.records != records:
        raise ValueError("Portfolio evaluation reproducibility failed")
    if (target / "review.md").read_text() != render(expected):
        raise ValueError("Review/scorecard mismatch")
    return {"valid": True, "reproduced": True, "suite": result["suite"],
            "candidate_promoted": False, "protected_holdout_evaluated": False}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    cmd = p.add_subparsers(dest="command", required=True)
    run = cmd.add_parser("run")
    run.add_argument("--suite", choices=("dev", "validation"), required=True)
    run.add_argument("--out", required=True)
    verify = cmd.add_parser("verify")
    verify.add_argument("--out", required=True)
    args = p.parse_args(argv)
    if args.command == "run":
        print(render(write_run(args.suite, args.out)))
    else:
        print(json.dumps(verify_run(args.out), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
