"""Offline, judge-side Genesis memory influence and resource failure diagnostics.

This module is NOT imported by any runtime policy. It observes each policy's
public decision proposal *before* the referee reports the realized outcome,
then joins that saved trace to the existing independently scored ledger. It
does not modify actions, hidden worlds, referee logic or promotion thresholds.
Run only on predeclared non-holdout synthetic cohorts.
"""

import argparse
from collections import defaultdict
from dataclasses import dataclass
import json
from pathlib import Path
from statistics import mean

from ..strategic_planner import Choice, Goals, _dominates, _value
from .hidden import make_world
from .policies import RuntimePolicy
from .referee import hindsight_oracle, run_episode

SCHEMA = "GenesisMemoryEffectDiagnostics/1.0"
BUDGETS = {"time_budget_ms": 5000, "compute_budget": 64}
POLICIES = ("v09_strategist", "aion_v1_memory", "aion_v12_contextual",
            "aion_v12_hybrid")
COHORTS = {"dev": (270000, 8), "validation": (280000, 16)}
FAMILIES = ("resource_allocation",)
VARIANTS = ("nominal", "shifted")


def _leader(cards, goals, *, use_raw):
    """Pareto-aware, *diagnostic* score leader, not a re-run of the policy."""
    feasible = []
    for c in cards:
        if c["estimated_spend"] > goals.max_spend:
            continue
        option = Choice(
            identifier=c["identifier"],
            decisions=tuple(tuple(pair) for pair in c["decisions"]),
            expected_effects=c["raw_expected_effects"] if use_raw
                             else c["expected_effects"],
            uncertainty=c["uncertainty"], estimated_spend=c["estimated_spend"],
            evidence_ids=tuple(c["evidence_ids"]), explanation="research-only",
            uncertainty_note="estimate", requires_human_approval=True)
        feasible.append(option)
    nondominated = [a for a in feasible if not any(
        _dominates(b, a) for b in feasible if b.identifier != a.identifier)]
    nondominated.sort(key=lambda c: (-_value(c, goals), c.estimated_spend, c.identifier))
    return nondominated[0].identifier if nondominated else None


def proposal_effect_snapshot(proposal, profile, public_facts):
    """Only policy-visible information; zero access to hidden outcomes."""
    if proposal is None:
        return {"has_proposal": False, "memory_available": False,
                "memory_applied": False, "ranking_flip": False}
    memory = proposal.memory or {}
    valid = not proposal.abstained and bool(proposal.candidate_options)
    facts = {f"{o['subject_id']}:{o['metric']}": o["value"]
             for o in public_facts if o["value"] is not None}
    key = lambda metric, subject: facts.get(f"{subject}:{metric}")
    wear = [key("wear_index", u) for u in ("unit_a", "unit_b", "unit_c")]
    wear = [w for w in wear if isinstance(w, (int, float))]
    public = {
        "technician_hours": key("technician_hours", "CREW"),
        "spare_kits": key("spare_kits", "CREW"),
        "max_wear_index": max(wear) if wear else None,
        "known_unknowns": len(proposal.known_unknowns),
        "current_numeric_facts": len(facts),
    }
    deltas = [abs(c["expected_effects"][obj] - raw)
              for c in proposal.candidate_options
              for obj, raw in c["raw_expected_effects"].items()
              if obj in c["expected_effects"]]
    changed = sum(any(abs(c["expected_effects"].get(k, v) - v) > 1e-8
                      for k, v in c["raw_expected_effects"].items())
                  for c in proposal.candidate_options)
    rank_raw = rank_with_memory = None
    if valid:
        goals = Goals(weights=dict(profile.goal_weights),
                      max_spend=profile.max_spend,
                      uncertainty_aversion=profile.uncertainty_aversion)
        rank_raw = _leader(proposal.candidate_options, goals, use_raw=True)
        rank_with_memory = _leader(proposal.candidate_options, goals, use_raw=False)
    return {
        "has_proposal": True,
        "memory_mode": memory.get("mode", "off"),
        "memory_available": memory.get("effect_model_version") is not None,
        "memory_applied": any(delta > 1e-8 for delta in deltas),
        "adjusted_options": changed,
        "total_options": len(proposal.candidate_options),
        "max_abs_effect_correction": round(max(deltas, default=0.0), 6),
        "ranking_flip": valid and rank_raw != rank_with_memory,
        "raw_score_leader": rank_raw,
        "corrected_score_leader": rank_with_memory,
        "actual_proposed": proposal.selected_option["identifier"]
                           if proposal.selected_option else None,
        "abstention": proposal.abstention_reason,
        "public_context": public,
    }


class TracedRuntimePolicy(RuntimePolicy):
    """A research observer that cannot change the inherited decision method."""

    def __init__(self, name, budgets):
        super().__init__(name, budgets)
        self.snapshots = []

    def decide(self, step):
        proposal = super().decide(step)
        current = self.runtime.situation(
            self.tenant_id, self.domain_id, step.scope_id, step.as_of)
        profile = self.store.goal_profile(self.tenant_id, self.domain_id)
        self.snapshots.append({
            "case_id": step.case_id,
            **proposal_effect_snapshot(proposal, profile, current["usable_facts"]),
        })
        return proposal


def _ratio(num, den):
    return {"numerator": num, "denominator": den,
            "rate": round(num / den, 6) if den else None}


def _state_groups(row):
    context = row["instrumentation"].get("public_context") or {}
    groups = []
    hours = context.get("technician_hours")
    kits = context.get("spare_kits")
    wear = context.get("max_wear_index")
    if hours is None:
        groups.append("technician_hours_unknown")
    elif hours <= 4:
        groups.append("technician_hours_4_or_less")
    else:
        groups.append("technician_hours_above_4")
    if kits is None:
        groups.append("spare_kits_unknown")
    elif kits == 0:
        groups.append("spare_kits_zero")
    else:
        groups.append("spare_kits_available")
    if wear is not None:
        groups.append("wear_75_or_more" if wear >= 75 else "wear_below_75")
    if row["instrumentation"].get("abstention"):
        groups.append("abstained")
    elif row["applied"] and row["applied"] != "none|none|inspect":
        groups.append("active_maintenance")
        if row["applied"].endswith("|overhaul"):
            groups.append("overhaul")
        if row["applied"].endswith("|inspect"):
            groups.append("inspection")
    else:
        groups.append("no_maintenance")
    return groups


def _summarize(rows, reference="v09_strategist"):
    """Compute descriptive diagnostics from *joined* referee and public-side data."""
    bypolicy = defaultdict(list)
    for row in rows:
        bypolicy[(row["variant"], row["policy"])].append(row)
    index = {(r["variant"], r["policy"], r["seed"], r["step"]): r
             for r in rows}
    summary = {}
    for (variant, policy), cases in sorted(bypolicy.items()):
        judged = [c for c in cases if c["harmful"] is not None]
        used = [c for c in cases if c["instrumentation"].get("has_proposal")]
        available = sum(c["instrumentation"]["memory_available"] for c in used)
        applied = sum(c["instrumentation"]["memory_applied"] for c in used)
        corrected = [c for c in used if c["instrumentation"]["memory_applied"]]
        divergence = []
        improvements = degradations = ties = 0
        for c in cases:
            twin = index.get((variant, reference, c["seed"], c["step"]))
            if twin is None or policy == reference or c["applied"] == twin["applied"]:
                continue
            divergence.append(c)
            delta = c["realized_value"] - twin["realized_value"]
            improvements += delta > 1e-8
            degradations += delta < -1e-8
            ties += abs(delta) <= 1e-8
        breakdown = {}
        if policy != "v09_strategist":
            segments = defaultdict(list)
            for c in judged:
                for group in _state_groups(c):
                    segments[group].append(c)
            breakdown = {key: _ratio(sum(c["harmful"] for c in sub), len(sub))
                         for key, sub in sorted(segments.items())}
        summary[f"{variant}/{policy}"] = {
            "decisions": len(cases), "judged_decisions": len(judged),
            "harmful_choice": _ratio(sum(c["harmful"] for c in judged), len(judged)),
            "mean_prediction_abs_error": round(mean(
                c["prediction_abs_error"] for c in cases
                if c["prediction_abs_error"] is not None), 6)
                if any(c["prediction_abs_error"] is not None for c in cases) else None,
            "mean_regret": round(mean(
                c["regret"] for c in cases if c["regret"] is not None), 6)
                if any(c["regret"] is not None for c in cases) else None,
            "memory_version_present": _ratio(available, len(used)),
            "memory_changed_any_estimate": _ratio(applied, len(used)),
            "memory_changed_score_leader": _ratio(sum(
                c["instrumentation"]["ranking_flip"] for c in used), len(used)),
            "mean_max_abs_effect_correction_when_applied": round(mean(
                c["instrumentation"]["max_abs_effect_correction"]
                for c in corrected), 6) if corrected else 0.0,
            "different_actions_than_memory_off": _ratio(len(divergence), len(cases)),
            "divergence_realized_better": improvements,
            "divergence_realized_worse": degradations,
            "divergence_realized_equal": ties,
            "public_condition_harm": breakdown,
        }
    return summary


def build_report(partition: str, start_seed: int, episodes: int):
    """Run predeclared non-holdout cases. Evaluator is not changed or bypassed."""
    if partition not in COHORTS or (start_seed, episodes) != COHORTS[partition]:
        raise ValueError("Only predeclared disjoint dev/validation cohorts are allowed")
    cases = []
    for variant in VARIANTS:
        for seed in range(start_seed, start_seed + episodes):
            world = make_world("resource_allocation", seed, variant)
            oracle = hindsight_oracle(world)
            for policy_name in POLICIES:
                observer = TracedRuntimePolicy(policy_name, BUDGETS)
                rows, _ = run_episode(world, observer, partition, oracle)
                if len(rows) != len(observer.snapshots):
                    raise RuntimeError("Proposal trace is incomplete")
                for row, snapshot in zip(rows, observer.snapshots):
                    if row["case_id"] != snapshot["case_id"]:
                        raise RuntimeError("Proposal/independent referee trace mismatch")
                    if set(row["failure_classes"]) & {
                            "policy_error", "inadmissible_action", "invalid_evidence",
                            "invalid_proposal"}:
                        raise RuntimeError("Invalid policy in memory diagnosis")
                    cases.append({**row, "instrumentation": snapshot})
    return {
        "schema": SCHEMA,
        "research_only": True,
        "protected_holdout_evaluated": False,
        "real_world_improvement_proven": False,
        "policy_actions_modified_by_instrumentation": False,
        "hidden_truth_exposed_to_policy": False,
        "partition": partition, "seed_range": [start_seed, start_seed + episodes],
        "families": list(FAMILIES), "variants": list(VARIANTS),
        "policies": list(POLICIES),
        "comparisons": _summarize(cases),
        "cases": cases,
        "limitations": [
            "Public context is a reduced set of visible measurements, not causal proof.",
            "A modeled score-leader flip is not proof the final policy selection changed.",
            "Harm and regret are computed by the unchanged synthetic referee.",
            "Diagnostic correlations do not identify causes of resource-allocation failures.",
            "No access to live business data, model inference or protected holdout.",
        ],
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--partition", choices=sorted(COHORTS), required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    start, count = COHORTS[args.partition]
    report = build_report(args.partition, start, count)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", "utf-8")
    print(json.dumps({"file": str(target), "partition": args.partition,
                      "cases": len(report["cases"]),
                      "comparisons": report["comparisons"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
