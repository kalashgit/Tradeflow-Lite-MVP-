"""AION v0.9: bounded, reusable multi-objective strategic decision search.

The planner knows declared choices and estimated effects only. It cannot call
the hidden-outcome evaluator, execute any action, or claim universal coverage.
"""

from dataclasses import asdict, dataclass
from itertools import product
import math
from time import perf_counter
from typing import Protocol


@dataclass(frozen=True)
class Axis:
    name: str
    choices: tuple[str, ...]


@dataclass(frozen=True)
class Choice:
    identifier: str
    decisions: tuple[tuple[str, str], ...]
    expected_effects: dict[str, float]
    uncertainty: dict[str, float]
    estimated_spend: float
    evidence_ids: tuple[str, ...]
    explanation: str
    uncertainty_note: str
    requires_human_approval: bool = True


@dataclass(frozen=True)
class Goals:
    weights: dict[str, int]
    max_spend: float
    uncertainty_aversion: float = 0.5

    def __post_init__(self):
        if not self.weights or any(type(v) is not int or not 0 <= v <= 5
                                   for v in self.weights.values()):
            raise ValueError("Owner priorities must have explicit 0–5 weights")
        if not math.isfinite(self.max_spend) or self.max_spend < 0:
            raise ValueError("Invalid owner spending bound")
        if not 0 <= self.uncertainty_aversion <= 2:
            raise ValueError("Invalid uncertainty tolerance")


class DecisionDomain(Protocol):
    name: str
    axes: tuple[Axis, ...]
    baseline_decisions: tuple[tuple[str, str], ...]

    def assess(self, facts: object, decisions: tuple[tuple[str, str], ...]) -> Choice | None: ...


def _dominates(a: Choice, b: Choice) -> bool:
    """Discard only choices no better in cost, expected effects, or uncertainty."""
    keys = set(a.expected_effects) | set(b.expected_effects)
    no_worse = a.estimated_spend <= b.estimated_spend and all(
        a.expected_effects.get(k, 0) >= b.expected_effects.get(k, 0) and
        a.uncertainty.get(k, 0) <= b.uncertainty.get(k, 0) for k in keys
    )
    strictly_better = a.estimated_spend < b.estimated_spend or any(
        a.expected_effects.get(k, 0) > b.expected_effects.get(k, 0) or
        a.uncertainty.get(k, 0) < b.uncertainty.get(k, 0) for k in keys
    )
    return no_worse and strictly_better


def _value(choice: Choice, goals: Goals) -> float:
    return sum(goals.weights.get(k, 0) * (
        choice.expected_effects.get(k, 0)
        - goals.uncertainty_aversion * choice.uncertainty.get(k, 0)
    ) for k in goals.weights)


class StrategicPlanner:
    def enumerate_and_rank(self, pack: DecisionDomain, facts: object,
                           evidence_ids: set[str], goals: Goals,
                           show_top: int = 3) -> dict:
        if not 1 <= show_top <= 10 or not 1 <= len(pack.axes) <= 8:
            raise ValueError("Invalid option search bounds")
        n = 1
        names = set()
        for axis in pack.axes:
            if not axis.name or axis.name in names or not 1 <= len(axis.choices) <= 10:
                raise ValueError("Invalid decision axis")
            if len(set(axis.choices)) != len(axis.choices):
                raise ValueError("Repeated axis choice")
            names.add(axis.name)
            n *= len(axis.choices)
        if n > 1000:
            raise ValueError("Unbounded option search rejected")
        started = perf_counter()
        feasible: list[Choice] = []
        excluded = 0
        found_ids = set()
        baseline: Choice | None = None
        for selections in product(*(axis.choices for axis in pack.axes)):
            decisions = tuple(zip((axis.name for axis in pack.axes), selections))
            option = pack.assess(facts, decisions)
            if option is None:
                excluded += 1
                continue
            if option.decisions != decisions or option.identifier in found_ids:
                raise ValueError("Domain pack returned inconsistent or duplicated option")
            found_ids.add(option.identifier)
            if (not option.requires_human_approval or not option.evidence_ids or
                    not set(option.evidence_ids).issubset(evidence_ids)):
                raise ValueError("Unsafe option or ungrounded decision evidence")
            if not option.explanation or not option.uncertainty_note:
                raise ValueError("Missing decision explanation or uncertainty")
            if (not math.isfinite(option.estimated_spend) or option.estimated_spend < 0 or
                    any(not math.isfinite(v) for v in option.expected_effects.values()) or
                    any(not math.isfinite(v) or v < 0 for v in option.uncertainty.values())):
                raise ValueError("Non-finite or unsupported option estimate")
            if set(option.expected_effects) - goals.weights.keys():
                raise ValueError("Domain option uses an unregistered owner objective")
            if option.decisions == pack.baseline_decisions:
                baseline = option
            if option.estimated_spend > goals.max_spend:
                excluded += 1
                continue
            feasible.append(option)
        if baseline is None or baseline.estimated_spend > goals.max_spend:
            raise ValueError("A feasible reference action is required")
        if not feasible:
            raise ValueError("No feasible decisions")
        nondominated = [a for a in feasible if not any(
            _dominates(b, a) for b in feasible if b.identifier != a.identifier)]
        nondominated.sort(key=lambda o: (-_value(o, goals), o.estimated_spend, o.identifier))
        best = nondominated[0]
        duration_ms = (perf_counter() - started) * 1000
        return {
            "version": "0.9.0", "domain": pack.name,
            "decision_space_is_bounded": True,
            "all_real_world_options_known": False,
            "declared_combinations": n,
            "feasible_options": len(feasible),
            "excluded_by_prerequisites_or_budget": excluded,
            "pareto_survivors": len(nondominated),
            "enumeration_coverage_within_declared_space": 1.0,
            "owner_goals": asdict(goals),
            "baseline_id": baseline.identifier,
            "baseline_expected_value": round(_value(baseline, goals), 4),
            "selected": self._card(best, goals),
            "alternatives": [self._card(o, goals) for o in nondominated[1:show_top]],
            "planning_ms": round(duration_ms, 3),
            "research_only": True,
            "external_actions": 0,
            "automatic_decisions_executed": 0,
            "learned_policy_verified": False,
        }

    @staticmethod
    def _card(option: Choice, goals: Goals) -> dict:
        return {
            **asdict(option),
            "priority_score_heuristic": round(_value(option, goals), 4),
            "approval_state": "pending_human_review",
            "effects_are_estimates_not_observed_results": True,
        }
