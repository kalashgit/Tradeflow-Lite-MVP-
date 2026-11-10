"""Domain pack: multi-step dispatch of work with operational dependencies.

A job has upstream work, downstream work blocked by it, and a part with an
arrival time. Each period one bounded choice is proposed. Probabilities used
for estimates are *declared* assumptions; real dynamics are hidden elsewhere.
"""

from dataclasses import dataclass

from ..runtime.domain import CaseBuild
from ..strategic_planner import Axis, Choice

DECLARED_REWORK, DECLARED_EXPEDITE = 0.2, 0.8
OVERTIME_SPEND, EXPEDITE_SPEND, LATE_PENALTY = 60.0, 90.0, 2.0
METRICS = ("upstream_remaining", "downstream_remaining", "part_eta_periods",
           "crew_capacity_units", "periods_left")


def sequence_progress(upstream: int, downstream: int, part_eta: int,
                      capacity: int) -> tuple[int, int]:
    """Public plan physics: upstream first, downstream only once unblocked."""
    up = min(capacity, upstream)
    unblocked = upstream - up == 0 and part_eta == 0
    return up, min(capacity - up, downstream) if unblocked else 0


@dataclass(frozen=True)
class JobCase:
    upstream_remaining: int
    downstream_remaining: int
    part_eta: int
    capacity: int
    periods_left: int
    evidence: tuple


class DependencyDispatchPack:
    name = "synthetic_dependency_dispatch"
    axes = (Axis("focus", ("follow_sequence", "start_downstream_early", "expedite_part")),
            Axis("crew", ("standard", "overtime")))
    baseline_decisions = (("focus", "follow_sequence"), ("crew", "standard"))

    def assess(self, facts: JobCase, decisions) -> Choice | None:
        chosen = dict(decisions)
        focus, overtime = chosen["focus"], chosen["crew"] == "overtime"
        up_left, down_left = facts.upstream_remaining, facts.downstream_remaining
        blocked = up_left > 0 or facts.part_eta > 0
        if focus == "expedite_part" and facts.part_eta == 0:
            return None
        if focus == "start_downstream_early" and (not blocked or down_left == 0):
            return None
        capacity = facts.capacity + (1 if overtime else 0)
        spend = (OVERTIME_SPEND if overtime else 0.0) + (
            EXPEDITE_SPEND if focus == "expedite_part" else 0.0)
        quality = -0.1 if overtime else 0.0
        schedule_sigma, quality_sigma = 0.3, 0.2 if overtime else 0.05
        if focus == "start_downstream_early":
            attempt = min(capacity, down_left)
            work = attempt * (1 - DECLARED_REWORK)
            schedule = work
            quality -= DECLARED_REWORK * attempt
            schedule_sigma += 0.4 * attempt
            quality_sigma += 0.4 * attempt
        else:
            work = float(sum(sequence_progress(up_left, down_left, facts.part_eta, capacity)))
            schedule = work
            if focus == "expedite_part":
                schedule += DECLARED_EXPEDITE
                schedule_sigma += 0.4
        if facts.periods_left == 1:
            schedule -= LATE_PENALTY * (up_left + down_left - work)
        return Choice(
            identifier=f"{focus}|{chosen['crew']}", decisions=decisions,
            expected_effects={"schedule": round(schedule, 4),
                              "cost": round(-spend / 100, 4), "quality": round(quality, 4)},
            uncertainty={"schedule": round(schedule_sigma, 4), "cost": 0.05,
                         "quality": round(quality_sigma, 4)},
            estimated_spend=spend, evidence_ids=facts.evidence,
            explanation=f"Review {focus} with {chosen['crew']} crew for this period.",
            uncertainty_note="Rework and expedite odds are declared assumptions.",
        )


class DependencyDispatchAdapter:
    domain_id = "synthetic_dependency_dispatch"
    version = "1.0.0"
    objectives = ("schedule", "cost", "quality")
    default_freshness_ticks = 5
    freshness_ticks: dict[str, int] = {}
    decision_domain = DependencyDispatchPack()

    def build_case(self, observations, tenant_id, scope_id) -> CaseBuild:
        facts = {item.metric: item for item in observations}
        missing = tuple(metric for metric in METRICS if metric not in facts)
        if missing:
            return CaseBuild(None, missing=missing)
        return CaseBuild(JobCase(
            upstream_remaining=int(facts["upstream_remaining"].value),
            downstream_remaining=int(facts["downstream_remaining"].value),
            part_eta=int(facts["part_eta_periods"].value),
            capacity=int(facts["crew_capacity_units"].value),
            periods_left=int(facts["periods_left"].value),
            evidence=tuple(facts[metric].event_id for metric in METRICS)))

    def fixed_rule(self, facts):
        """Declared fixed heuristic: chase the missing part, otherwise follow the plan."""
        focus = "expedite_part" if facts.part_eta > 0 else "follow_sequence"
        return (("focus", focus), ("crew", "standard"))
