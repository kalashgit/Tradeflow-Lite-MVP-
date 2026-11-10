"""Domain pack: equipment maintenance as constrained resource allocation.

Unrelated to contracting. Scarce technician hours, spare kits and budget are
allocated across three machines. Failure curves are *declared* assumptions in
invented units; true hazards live in a hidden world the pack never sees.
"""

from dataclasses import dataclass
from math import sqrt

from ..runtime.domain import CaseBuild
from ..strategic_planner import Axis, Choice

UNITS = ("unit_a", "unit_b", "unit_c")
HOURS = {"inspect": 2, "overhaul": 6}
SPEND = {"inspect": 40.0, "overhaul": 220.0}
DECLARED_RISK_FACTOR = {"inspect": 0.6, "overhaul": 0.2}
FAILURE_LOSS, REPAIR_COST, SAFETY_WEAR, SAFETY_LOSS = 2.0, 1.0, 75, 3.0


def declared_failure_probability(wear: float) -> float:
    return min(0.75, max(0.03, (wear - 25) / 100))


@dataclass(frozen=True)
class FleetCase:
    wear: dict
    criticality: dict
    technician_hours: int
    spare_kits: int
    evidence: dict


class EquipmentMaintenancePack:
    name = "synthetic_equipment_maintenance_allocation"
    axes = (Axis("first", ("none", *UNITS)), Axis("second", ("none", *UNITS)),
            Axis("depth", ("inspect", "overhaul")))
    baseline_decisions = (("first", "none"), ("second", "none"), ("depth", "inspect"))

    def assess(self, facts: FleetCase, decisions) -> Choice | None:
        chosen = dict(decisions)
        first, second, depth = chosen["first"], chosen["second"], chosen["depth"]
        if first == "none":
            if second != "none" or depth != "inspect":
                return None
        elif second != "none" and UNITS.index(second) <= UNITS.index(first):
            return None  # one canonical ordering per pair of machines
        targets = [unit for unit in (first, second) if unit != "none"]
        if len(targets) * HOURS[depth] > facts.technician_hours:
            return None
        if depth == "overhaul" and len(targets) > facts.spare_kits:
            return None
        spend = len(targets) * SPEND[depth]
        uptime = variance = repairs = safety = 0.0
        for unit in UNITS:
            risk = declared_failure_probability(facts.wear[unit])
            if unit in targets:
                risk *= DECLARED_RISK_FACTOR[depth]
            loss = FAILURE_LOSS * facts.criticality[unit]
            uptime -= risk * loss
            variance += risk * (1 - risk) * loss ** 2
            repairs += risk * REPAIR_COST
            if facts.wear[unit] >= SAFETY_WEAR:
                safety -= risk * SAFETY_LOSS
        evidence = [facts.evidence[f"wear_index:{unit}"] for unit in UNITS]
        evidence += [facts.evidence[f"criticality:{unit}"] for unit in UNITS]
        evidence.append(facts.evidence["technician_hours:CREW"])
        if depth == "overhaul":
            evidence.append(facts.evidence["spare_kits:CREW"])
        return Choice(
            identifier=f"{first}|{second}|{depth}", decisions=decisions,
            expected_effects={"uptime": round(uptime, 4),
                              "budget": round(-spend / 100 - repairs, 4),
                              "safety": round(safety, 4)},
            uncertainty={"uptime": round(sqrt(variance), 4), "budget": 0.3, "safety": 0.4},
            estimated_spend=spend, evidence_ids=tuple(evidence),
            explanation=f"Review {depth} of {', '.join(targets) or 'no machine'} this cycle.",
            uncertainty_note="Failure curves are declared assumptions, not measured hazards.",
        )


class EquipmentMaintenanceAdapter:
    domain_id = "synthetic_equipment_maintenance"
    version = "1.0.0"
    objectives = ("uptime", "budget", "safety")
    default_freshness_ticks = 50
    freshness_ticks = {"technician_hours": 5}
    decision_domain = EquipmentMaintenancePack()
    # Public domain semantics, reviewed separately from the independent grader.
    # Only the selected maintenance targets and scarce shared resources are
    # relevant to reusing a previous intervention's outcome.
    memory_relevance_schema = {
        "target_axes": ("first", "second"),
        "target_metrics": {"wear_index": 75.0, "criticality": 3.0},
        "global_keys": {
            "CREW:technician_hours": 10.0,
            "CREW:spare_kits": 2.0,
        },
    }

    def build_case(self, observations, tenant_id, scope_id) -> CaseBuild:
        facts = {f"{item.metric}:{item.subject_id}": item for item in observations}
        required = [f"{metric}:{unit}" for metric in ("wear_index", "criticality")
                    for unit in UNITS] + ["technician_hours:CREW", "spare_kits:CREW"]
        missing = tuple(key for key in required if key not in facts)
        if missing:
            return CaseBuild(None, missing=missing)
        return CaseBuild(FleetCase(
            wear={unit: facts[f"wear_index:{unit}"].value for unit in UNITS},
            criticality={unit: facts[f"criticality:{unit}"].value for unit in UNITS},
            technician_hours=int(facts["technician_hours:CREW"].value),
            spare_kits=int(facts["spare_kits:CREW"].value),
            evidence={key: facts[key].event_id for key in required}))

    def fixed_rule(self, facts):
        """Declared fixed heuristic: inspect the single most worn machine."""
        worst = max(UNITS, key=lambda unit: (facts.wear[unit], unit))
        return (("first", worst), ("second", "none"), ("depth", "inspect"))
