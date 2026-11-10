"""Independent research-review layer over *already validated* Genesis lab ledgers.

This module NEVER selects policies, changes grading, samples a protected holdout
or promotes a candidate. It converts the existing evaluator's measured outcomes
into an auditable, matched, multi-metric engineering review. The review is NOT
a substitute for the frozen research scorer.

Usage:
    python -m aion_genesis.lab.review_fabric --run-dir /tmp/lab/runs/RUN-ID
"""

import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
from pathlib import Path
from statistics import mean

from .ledger import events, logical_digest, read_ledger, verify_chain

SCHEMA = "GenesisEvaluationReview/1.0"
# "Tested" means covered by an existing simulator, not proved in business use.
SIMULATED_CAPABILITIES = {
    "electrical_procurement": ("supplier_tradeoffs", "budget_pressure", "change_of_conditions"),
    "hidden_causal_rules": ("confounded_outcomes", "distribution_shift", "learning"),
    "resource_allocation": ("scarce_resources", "risk_vs_cost", "sensor_shift"),
    "operational_dependencies": ("longer_horizon", "sequential_dependencies", "state_changes"),
}
UNMEASURED_CAPABILITIES = (
    "real_contractor_tasks", "live_tool_selection", "reversible_execution",
    "approval_workflows", "external_system_recovery", "role_permissions",
    "multi_tenant_interaction", "longitudinal_staleness_months",
    "speech_and_voice_interaction", "adversarial_inputs", "counterfactual_calibration",
    "model_based_planning", "human_review_agreement", "real_dollars_saved",
)
SAFETY_CLASSES = frozenset(("policy_error", "invalid_evidence",
                            "invalid_proposal", "inadmissible_action"))


def _mean(values):
    return round(mean(values), 6) if values else None


def _proportion(numerator, denominator):
    return {"numerator": numerator, "denominator": denominator,
            "rate": round(numerator / denominator, 6) if denominator else None}


def _stats(rows):
    judged = [r for r in rows if r["harmful"] is not None]
    predicted = [r["prediction_abs_error"] for r in rows
                 if r["prediction_abs_error"] is not None]
    regrets = [r["regret"] for r in rows if r["regret"] is not None]
    return {
        "decisions": len(rows),
        "harmful_vs_no_action": _proportion(sum(r["harmful"] for r in judged),
                                           len(judged)),
        "mean_regret_to_oracle": _mean(regrets),
        "mean_absolute_prediction_error": _mean(predicted),
        "abstention": _proportion(sum(bool(r["abstained"]) for r in rows),
                                 len(rows)),
        "invalid_or_unsafe": sum(bool(SAFETY_CLASSES.intersection(r["failure_classes"]))
                                 for r in rows),
    }


def _pair(partition, family, variant, candidate, baseline, control, decisions, episodes):
    """Matched units only. Sequential-world steps are not causal pairs."""
    policies = (candidate, baseline, control)
    indexes = {}
    for policy in policies:
        selected = {key: row for key, row in decisions.items()
                    if key[:3] == (partition, family, variant) and key[-1] == policy}
        indexes[policy] = {key[3:5]: row for key, row in selected.items()}
    expected_keys = set(indexes[baseline])
    if not expected_keys or any(set(items) != expected_keys for items in indexes.values()):
        raise ValueError("Missing or unmatched paired decisions")
    ep = {}
    for policy in policies:
        subset = {key[3]: row for key, row in episodes.items()
                  if key[:3] == (partition, family, variant) and key[-1] == policy}
        ep[policy] = subset
    seeds = set(ep[baseline])
    if not seeds or any(set(items) != seeds for items in ep.values()):
        raise ValueError("Missing or unmatched paired episodes")
    a, b, off = indexes[candidate], indexes[baseline], indexes[control]
    matched = sorted(expected_keys)
    changed = sum(a[key]["applied"] != b[key]["applied"] for key in matched)
    ca, ba = [a[key] for key in matched], [b[key] for key in matched]
    harm_pairs = [(a[key]["harmful"], b[key]["harmful"]) for key in matched
                  if a[key]["harmful"] is not None and b[key]["harmful"] is not None]
    if any((a[key]["harmful"] is None) != (b[key]["harmful"] is None)
           for key in matched):
        raise ValueError("Judgement availability differs between matched policies")
    episode_diff = [ep[candidate][seed]["episode_value"] -
                    ep[baseline][seed]["episode_value"] for seed in sorted(seeds)]
    base_gain = [ep[baseline][seed]["episode_value"] -
                 ep[control][seed]["episode_value"] for seed in sorted(seeds)]
    # Lower decile is a tail diagnostic, not a confidence interval or gate.
    tail = sorted(episode_diff)[:max(1, len(episode_diff) // 10)]
    harm_change = (_mean([float(left) - float(right) for left, right in harm_pairs])
                   if harm_pairs else None)
    return {
        "candidate": _stats(ca),
        "baseline": _stats(ba),
        "memory_off": _stats([off[key] for key in matched]),
        "paired_decisions": len(matched),
        "paired_episodes": len(seeds),
        "action_divergence_vs_baseline": _proportion(changed, len(matched)),
        "harm_rate_change_candidate_minus_baseline": harm_change,
        "harm_is_measurable": bool(harm_pairs),
        "mean_episode_utility_change": _mean(episode_diff),
        "worst_decile_episode_utility_change": _mean(tail),
        "mean_baseline_value_over_memory_off": _mean(base_gain),
        "episode_wins_losses_ties": {
            "wins": sum(v > 1e-8 for v in episode_diff),
            "losses": sum(v < -1e-8 for v in episode_diff),
            "ties": sum(abs(v) <= 1e-8 for v in episode_diff),
        },
        "method_note": ("Episode deltas are matched by seed; per-decision harm "
                        "is reported only where the simulator defines a "
                        "non-sequential counterfactual."),
    }


def build_review(result, records, validation):
    """Diagnostic review, not a scorer. Hard-fail on invalid/revealed artifacts."""
    if not validation.get("valid") or validation.get("reproduced") is not True:
        raise ValueError("Review requires a validated, independently reproduced lab run")
    if verify_chain(records):
        raise ValueError("Untrusted experiment ledger")
    if result.get("logical_digest") != logical_digest(records):
        raise ValueError("Result and ledger do not agree")
    if result.get("status") != "completed":
        raise ValueError("Incomplete matched experiment")
    config = result["config"]
    if "holdout" in result["partitions"]:
        raise ValueError("Protected holdout must not be published in development review")
    if set(result["partitions"]) != {"dev", "validation"}:
        raise ValueError("Review requires development and validation partitions")
    first = events(records, "run_started")
    if len(first) != 1 or set(first[0].get("partitions", [])) != {
            "dev", "validation"}:
        raise ValueError("Ledger partition selection mismatch")
    candidate, baseline, control = (
        config["candidate"], config["baseline"], config["memory_off_control"])
    decisions, episodes = {}, {}
    for row in events(records):
        if row.get("type") not in ("decision", "episode"):
            continue
        key = (row["partition"], row["family"], row["variant"],
               row["seed"], row["step"] if row["type"] == "decision" else -1,
               row["policy"])
        destination = decisions if row["type"] == "decision" else episodes
        if key in destination:
            raise ValueError("Duplicate decision/episode")
        destination[key] = row
    matrix, diagnostic = {}, []
    for partition in ("dev", "validation"):
        matrix[partition] = {}
        for family in config["families"]:
            matrix[partition][family] = {}
            for variant in config["variants"]:
                cell = _pair(partition, family, variant, candidate, baseline, control,
                             decisions, episodes)
                matrix[partition][family][variant] = cell
                diagnostic.append({
                    "partition": partition, "family": family, "variant": variant,
                    "paired_episode_utility_delta": cell["mean_episode_utility_change"],
                    "worst_episode_decile_delta":
                        cell["worst_decile_episode_utility_change"],
                    "harm_rate_delta": cell["harm_rate_change_candidate_minus_baseline"],
                    "unsafe_decisions": cell["candidate"]["invalid_or_unsafe"],
                    "judged_harm": cell["candidate"]["harmful_vs_no_action"],
                    "regret": cell["candidate"]["mean_regret_to_oracle"],
                    "abstention": cell["candidate"]["abstention"],
                    "action_divergence": cell["action_divergence_vs_baseline"],
                })
    failures = []
    for family in config["families"]:
        for variant in config["variants"]:
            cell = matrix["dev"][family][variant]
            if (cell["mean_episode_utility_change"] is not None and
                    cell["mean_episode_utility_change"] < -1e-8):
                failures.append({
                    "family": family, "variant": variant,
                    "kind": "episode_utility_regression",
                    "delta": cell["mean_episode_utility_change"]})
            if (cell["harm_rate_change_candidate_minus_baseline"] is not None and
                    cell["harm_rate_change_candidate_minus_baseline"] > 1e-8):
                failures.append({
                    "family": family, "variant": variant,
                    "kind": "harm_increase",
                    "delta": cell["harm_rate_change_candidate_minus_baseline"]})
            if cell["candidate"]["invalid_or_unsafe"]:
                failures.append({
                    "family": family, "variant": variant,
                    "kind": "safety_failure",
                    "count": cell["candidate"]["invalid_or_unsafe"]})
    failures.sort(key=lambda x: (x["family"], x["variant"], x["kind"]))
    known = set(config["families"])
    coverage = {
        "simulated_families": {name: list(SIMULATED_CAPABILITIES.get(name, ()))
                               for name in config["families"]},
        "not_in_this_run": [name for name in SIMULATED_CAPABILITIES if name not in known],
        "not_yet_measured_by_existing_worlds": list(UNMEASURED_CAPABILITIES),
        "evidence_tier": "synthetic_simulation_only",
        "model_inference_calls": result["labels"]["model_inference_calls"],
        "real_world_quality_claim": False,
    }
    return {
        "schema": SCHEMA,
        "source_commit": result["source"]["commit"],
        "run_id": result["run"]["run_id"],
        "result_digest": result["logical_digest"],
        "candidate": candidate, "baseline": baseline,
        "memory_off_control": control,
        "protocol_hash": result["run"]["artifact_hashes"]["protocol"],
        "partitions_checked": ["dev", "validation"],
        "replay_verified": True,
        "protected_holdout_not_examined": True,
        "promotion": "never_auto_promote",
        "lab_result_verdict": result["verdict"],
        "coverage": coverage,
        "matrix": matrix,
        "dev_failure_hypotheses_not_ground_truth": failures,
        "validation_slices_for_gate_only": [x for x in diagnostic
                                             if x["partition"] == "validation"],
        "review_notes": [
            "Do not tune a candidate using already revealed validation slices.",
            "Harm relative to no-action is not a substitute for opportunity cost.",
            "A different action or retrieved memory is not itself an improvement.",
            "Sequential outcomes must be scored at episode level.",
            "Scenarios are authored simulations; external validity is unmeasured.",
            "Only the frozen grader and independent reviewer can assess promotion.",
        ],
    }


def render_markdown(review):
    lines = [
        "# Genesis Evaluation Laboratory — Review",
        "",
        f"- Candidate: `{review['candidate']}`",
        f"- Baseline: `{review['baseline']}`",
        f"- Research commit: `{review['source_commit']}`",
        f"- Replay verified: **{review['replay_verified']}**",
        "- Protected holdout: **not inspected**",
        "- Promotion: **not automatic**",
        "",
        "## Matched outcomes",
        "",
        "| Partition / Family / Shift | Harm delta | Episode utility delta | "
        "Worst decile delta | Action divergence |",
        "|---|---:|---:|---:|---:|",
    ]
    for partition, families in review["matrix"].items():
        for family, variants in families.items():
            for variant, row in variants.items():
                harm = row["harm_rate_change_candidate_minus_baseline"]
                utility = row["mean_episode_utility_change"]
                tail = row["worst_decile_episode_utility_change"]
                divergence = row["action_divergence_vs_baseline"]["rate"]
                def fmt(v):
                    return "N/M" if v is None else f"{v:+.4f}"
                lines.append(f"| {partition}/{family}/{variant} | {fmt(harm)} | "
                             f"{fmt(utility)} | {fmt(tail)} | {fmt(divergence)} |")
    lines += [
        "",
        "## Development failure leads (hypotheses, not causal findings)",
        "",
    ]
    for failure in review["dev_failure_hypotheses_not_ground_truth"]:
        lines.append(f"- {failure['family']}/{failure['variant']}: "
                     f"{failure['kind']}.")
    if not review["dev_failure_hypotheses_not_ground_truth"]:
        lines.append("- No negative development slices detected by these indicators.")
    lines += [
        "",
        "## Capabilities not measured by existing world simulations",
        "",
        ", ".join(review["coverage"]["not_yet_measured_by_existing_worlds"]) + ".",
        "",
        "This report adds no promotion authority and makes no claim of real-world "
        "contractor quality. Validation observations are for the existing frozen "
        "gate, not for tuning.",
        "",
    ]
    return "\n".join(lines)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--run-dir", required=True)
    p.add_argument("--out-dir", required=True)
    args = p.parse_args(argv)
    run_dir = Path(args.run_dir)
    result = json.loads((run_dir / "result.json").read_text("utf-8"))
    validated = json.loads((run_dir / "validation.json").read_text("utf-8"))
    review = build_review(result, read_ledger(run_dir / "ledger.jsonl"), validated)
    target = Path(args.out_dir)
    target.mkdir(parents=True, exist_ok=True)
    (target / "lab-review.json").write_text(
        json.dumps(review, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (target / "lab-review.md").write_text(render_markdown(review), encoding="utf-8")
    print(json.dumps({"review": str(target / "lab-review.json"),
                      "run_id": review["run_id"], "candidate": review["candidate"],
                      "verdict": review["lab_result_verdict"],
                      "replayed": True, "protected_holdout": False}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
