"""Independent hidden-outcome scoring of AION's synthetic strategy choices.

Never import this into the planner or domain estimator. Oracle hindsight is
available only to the evaluator. It represents a hypothetical simulation.
"""

from hashlib import sha256
from itertools import product
import random
from statistics import mean

from .domains.electrical_strategy import (
    DependentProject, ElectricalStrategyPack, ProcurementDecisionCase,
)
from .strategic_planner import Goals, StrategicPlanner


def _uniform(seed: int, event: str) -> float:
    digest = sha256(f"{seed}/{event}".encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def hidden_actual_effects(seed: int, facts: ProcurementDecisionCase,
                          decisions: tuple[tuple[str, str], ...],
                          regime: str = "nominal") -> dict[str, float]:
    """Counterfactual outcome, hidden from the strategist."""
    if regime not in ("nominal", "unexpected_failure"):
        raise ValueError("Unknown synthetic outcome regime")
    selections = dict(decisions)
    supply, crew, customer = (selections[x] for x in ("supply", "crew", "customer"))
    spend = {"wait": 0, "expedite": 180, "qualified_substitute": 420}[supply]
    recovery = 0.0
    unexpected_penalty = 0.0
    if supply == "expedite":
        recovery = (0.2 + 0.75 * _uniform(seed, "expedite_arrival")
                    if regime == "unexpected_failure" else
                    0.45 + 1.8 * _uniform(seed, "expedite_arrival"))
    elif supply == "qualified_substitute":
        recovery = 1.0 + 2.5 * _uniform(seed, "substitute_arrival")
        failure_rate = 0.80 if regime == "unexpected_failure" else 0.22
        if _uniform(seed, "substitute_rework") < failure_rate:
            recovery = (0.0 if regime == "unexpected_failure"
                        else max(0.0, recovery - 1.2))
            unexpected_penalty = 4.0 if regime == "unexpected_failure" else 1.6
    recovery = min(recovery, facts.supplier_delay_days)
    schedule = min(recovery * min(len(facts.dependent_projects), 3),
                   sum(p.affected_work_days for p in facts.dependent_projects))
    crew_productivity = 0.0
    if crew == "reassign_to_ready_work":
        spend += 40
        crew_productivity = min(facts.crew_idle_hours,
                                facts.alternate_work_hours) / 4 * (
                                    (0.15 if regime == "unexpected_failure" else 0.5)
                                    + (0.3 if regime == "unexpected_failure" else 1.0)
                                    * _uniform(seed, "ready_work_productivity")
                                )
        schedule -= (0.7 if regime == "unexpected_failure" else 0.1) + (
            0.65 if regime == "unexpected_failure" else 0.45
        ) * _uniform(seed, "crew_coordination")
    trust = 0.0
    if customer == "prepare_notice":
        spend += 15
        trust = 2.0 + 2.0 * _uniform(seed, "notice_helpfulness")
    return {
        "schedule": schedule,
        "margin": -spend / 100 + crew_productivity * 0.7 - unexpected_penalty,
        "crew_productivity": crew_productivity,
        "customer_trust": trust,
    }


def _actual_value(effects: dict[str, float], goals: Goals) -> float:
    return sum(goals.weights.get(key, 0) * effects.get(key, 0) for key in goals.weights)


def _case(seed: int) -> tuple[ProcurementDecisionCase, Goals]:
    rng = random.Random(seed + 87_031)
    projects = tuple(DependentProject(
        identifier=f"PROJECT-{seed}-{i}", affected_work_days=rng.randint(2, 4),
        evidence_id=f"EV-DEP-{seed}-{i}",
    ) for i in range(rng.randint(1, 3)))
    facts = ProcurementDecisionCase(
        supplier_delay_days=rng.randint(2, 5),
        supplier_event_id=f"EV-SUP-{seed}", dependent_projects=projects,
        crew_event_id=f"EV-CREW-{seed}", crew_idle_hours=rng.randint(4, 24),
        alternate_work_event_id=f"EV-ALT-{seed}",
        alternate_work_hours=rng.choice((0, 8, 16, 24)),
        qualified_substitute=rng.random() > 0.2,
        substitute_event_id=f"EV-SUB-{seed}",
        expedite_available=rng.random() > 0.1,
        expedite_event_id=f"EV-EXP-{seed}",
        customer_event_id=f"EV-CUST-{seed}",
    )
    profiles = (
        {"schedule": 5, "margin": 2, "crew_productivity": 2, "customer_trust": 1},
        {"schedule": 2, "margin": 5, "crew_productivity": 3, "customer_trust": 1},
        {"schedule": 2, "margin": 2, "crew_productivity": 1, "customer_trust": 5},
    )
    goals = Goals(weights=rng.choice(profiles), max_spend=rng.choice((200, 300, 500)),
                  uncertainty_aversion=rng.choice((0.2, 0.6, 1.0)))
    return facts, goals


def evaluate_strategy(*, start_seed: int = 8000, worlds: int = 100,
                      regime: str = "nominal") -> dict:
    if not 10 <= worlds <= 1000 or start_seed < 0:
        raise ValueError("Synthetic strategy benchmark must be bounded")
    if regime not in ("nominal", "unexpected_failure"):
        raise ValueError("Invalid evaluation regime")
    planner = StrategicPlanner()
    pack = ElectricalStrategyPack()
    rows = []
    for seed in range(start_seed, start_seed + worlds):
        facts, goals = _case(seed)
        plan = planner.enumerate_and_rank(pack, facts, facts.evidence(), goals)
        all_feasible = []
        for selections in product(*(a.choices for a in pack.axes)):
            d = tuple(zip((a.name for a in pack.axes), selections))
            candidate = pack.assess(facts, d)
            if candidate is not None and candidate.estimated_spend <= goals.max_spend:
                all_feasible.append(candidate)
        observed = {o.identifier: _actual_value(hidden_actual_effects(seed, facts, o.decisions,
                                                                     regime=regime),
                                                goals) for o in all_feasible}
        chosen = plan["selected"]["identifier"]
        baseline = plan["baseline_id"]
        oracle_value = max(observed.values())
        rows.append({
            "seed": seed,
            "selected": chosen,
            "baseline": baseline,
            "feasible": len(all_feasible),
            "selected_actual_value": round(observed[chosen], 5),
            "baseline_actual_value": round(observed[baseline], 5),
            "oracle_hindsight_value": round(oracle_value, 5),
            "selected_regret": round(max(0.0, oracle_value - observed[chosen]), 5),
            "selection_improved_over_baseline": observed[chosen] > observed[baseline],
            "planning_ms": plan["planning_ms"],
        })
    def avg(k):
        return round(mean(r[k] for r in rows), 4)
    latencies = sorted(r["planning_ms"] for r in rows)
    return {
        "version": "0.9.0", "benchmark": "held_out_synthetic_strategy_evaluation",
        "start_seed": start_seed, "worlds": worlds, "hidden_regime": regime,
        "model_inference_calls": 0,
        "baseline": "hold_crew_wait_supplier_no_notice",
        "mean_planner_actual_value": avg("selected_actual_value"),
        "mean_baseline_actual_value": avg("baseline_actual_value"),
        "mean_oracle_hindsight_value": avg("oracle_hindsight_value"),
        "mean_planner_regret_to_hindsight_oracle": avg("selected_regret"),
        "fraction_planner_strictly_better_than_baseline": avg("selection_improved_over_baseline"),
        "fraction_planner_worse_than_baseline": round(mean(
            row["selected_actual_value"] < row["baseline_actual_value"] for row in rows
        ), 4),
        "p95_planning_ms": latencies[int(0.95 * (worlds - 1))],
        "sample_rows": rows[:10],
        "real_world_improvement_proven": False,
        "autonomous_learning_proven": False,
        "limitations": [
            "Ground truth is a designed simulator, not contractor operations",
            "Option coverage is complete only for the declared finite action grammar",
            "The hindsight oracle can see hidden outcomes unavailable to the planner",
            "Effect estimates and owner utility units are provisional research assumptions",
            "This baseline uses no language model and changes no model weights",
        ],
    }
