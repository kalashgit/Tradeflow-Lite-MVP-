"""Domain pack: abstract process tuning with declared lever mechanisms.

Unrelated to contracting. The pack publishes a *declared* mechanism card for
three levers; whether those declarations hold is decided by a hidden world the
pack never sees. All numbers are invented research units.
"""

from dataclasses import dataclass

from ..runtime.domain import CaseBuild
from ..strategic_planner import Axis, Choice

# lever -> (condition it is declared to depend on, gain if 1, gain if 0, spend)
DECLARED_LEVERS = {
    "lever_x": ("cond_a", 2.0, 0.5, 100.0),
    "lever_y": (None, 1.5, 1.5, 60.0),
    "lever_z": ("cond_c", 2.6, 0.0, 150.0),
}
STRONG_GAIN, STRONG_SPEND = 1.6, 1.5


@dataclass(frozen=True)
class TuningCase:
    cond_a: int | None
    cond_b: int | None
    cond_c: int | None
    load_level: int
    evidence: dict


class ProcessTuningPack:
    name = "synthetic_process_tuning"
    axes = (Axis("lever", ("hold", "lever_x", "lever_y", "lever_z")),
            Axis("dose", ("standard", "strong")))
    baseline_decisions = (("lever", "hold"), ("dose", "standard"))

    def assess(self, facts: TuningCase, decisions) -> Choice | None:
        chosen = dict(decisions)
        lever, strong = chosen["lever"], chosen["dose"] == "strong"
        evidence = [facts.evidence["load_level"]]
        if lever == "hold":
            if strong:
                return None
            effects = {"output": 0.0, "stability": 0.0, "cost": 0.0}
            uncertainty = {"output": 0.1, "stability": 0.0, "cost": 0.0}
            spend = 0.0
        else:
            condition, gain_on, gain_off, spend = DECLARED_LEVERS[lever]
            gain = gain_on
            if condition is not None:
                state = getattr(facts, condition)
                if state is None:
                    return None  # an unknown precondition is never guessed
                gain = gain_on if state else gain_off
                evidence.append(facts.evidence[condition])
            spend *= STRONG_SPEND if strong else 1.0
            effects = {"output": round(gain * (STRONG_GAIN if strong else 1.0), 4),
                       "stability": -1.0 if strong else -0.3,
                       "cost": round(-spend / 100, 4)}
            uncertainty = {"output": 0.9 if strong else 0.5,
                           "stability": 0.7 if strong else 0.2, "cost": 0.05}
        return Choice(
            identifier=f"{lever}|{chosen['dose']}", decisions=decisions,
            expected_effects=effects, uncertainty=uncertainty, estimated_spend=spend,
            evidence_ids=tuple(evidence),
            explanation=f"Review applying {lever} at {chosen['dose']} dose.",
            uncertainty_note="Declared lever gains are unverified research assumptions.",
        )


class ProcessTuningAdapter:
    domain_id = "synthetic_process_tuning"
    version = "1.0.0"
    objectives = ("output", "stability", "cost")
    default_freshness_ticks = 50
    freshness_ticks: dict[str, int] = {}
    decision_domain = ProcessTuningPack()

    def build_case(self, observations, tenant_id, scope_id) -> CaseBuild:
        facts = {item.metric: item for item in observations}
        if "load_level" not in facts:
            return CaseBuild(None, missing=("load_level",))
        conditions = {}
        for name in ("cond_a", "cond_b", "cond_c"):
            item = facts.get(name)
            if item is not None and item.value not in (0, 1):
                raise ValueError("Condition readings must be binary")
            conditions[name] = None if item is None else int(item.value)
        unknowns = tuple(f"{name}_blocks_{lever}" for lever, (name, *_)
                         in DECLARED_LEVERS.items()
                         if name is not None and conditions[name] is None)
        return CaseBuild(TuningCase(
            load_level=int(facts["load_level"].value),
            evidence={name: item.event_id for name, item in facts.items()},
            **conditions), unknowns=unknowns)

    def fixed_rule(self, facts):
        """Declared fixed heuristic: always apply the unconditional lever."""
        return (("lever", "lever_y"), ("dose", "standard"))
