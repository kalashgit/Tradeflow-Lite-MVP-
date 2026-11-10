"""Fictional electrical contractor decision generator for AION's generic search.

All costs/effects are invented for repeatable research, not contractor pricing.
"""

from dataclasses import dataclass

from ..situation_engine import Observation, SituationStore
from ..strategic_planner import Axis, Choice, Goals, StrategicPlanner


@dataclass(frozen=True)
class DependentProject:
    identifier: str
    affected_work_days: int
    evidence_id: str


@dataclass(frozen=True)
class ProcurementDecisionCase:
    supplier_delay_days: int
    supplier_event_id: str
    dependent_projects: tuple[DependentProject, ...]
    crew_event_id: str
    crew_idle_hours: int
    alternate_work_event_id: str
    alternate_work_hours: int
    qualified_substitute: bool
    substitute_event_id: str
    expedite_available: bool
    expedite_event_id: str
    customer_event_id: str

    def __post_init__(self):
        if (not 1 <= self.supplier_delay_days <= 30 or
                not 1 <= len(self.dependent_projects) <= 10 or
                not 0 <= self.crew_idle_hours <= 80 or
                not 0 <= self.alternate_work_hours <= 80):
            raise ValueError("Invalid synthetic portfolio conditions")

    def evidence(self) -> set[str]:
        return {self.supplier_event_id, self.crew_event_id,
                self.alternate_work_event_id, self.customer_event_id,
                self.substitute_event_id, self.expedite_event_id} | {
                    p.evidence_id for p in self.dependent_projects
                }


class ElectricalStrategyPack:
    name = "synthetic_electrical_contractor_procurement_strategy"
    axes = (
        Axis("supply", ("wait", "expedite", "qualified_substitute")),
        Axis("crew", ("hold", "reassign_to_ready_work")),
        Axis("customer", ("quiet", "prepare_notice")),
    )
    baseline_decisions = (("supply", "wait"), ("crew", "hold"),
                          ("customer", "quiet"))

    def assess(self, facts: ProcurementDecisionCase,
               decisions: tuple[tuple[str, str], ...]) -> Choice | None:
        d = dict(decisions)
        supply, crew, customer = d["supply"], d["crew"], d["customer"]
        if supply == "expedite" and not facts.expedite_available:
            return None
        if supply == "qualified_substitute" and not facts.qualified_substitute:
            return None
        if crew == "reassign_to_ready_work" and facts.alternate_work_hours <= 0:
            return None

        # All expected effects are provisional and disclosed as such. The
        # hidden outcome evaluator is in a separate module and is not imported.
        recovered = {"wait": 0.0, "expedite": 1.3,
                     "qualified_substitute": 2.6}[supply]
        recovered = min(recovered, facts.supplier_delay_days)
        required_days = sum(p.affected_work_days for p in facts.dependent_projects)
        schedule = recovered * min(len(facts.dependent_projects), 3)
        schedule = min(schedule, required_days)
        spend = {"wait": 0.0, "expedite": 180.0,
                 "qualified_substitute": 420.0}[supply]
        sigma_schedule = {"wait": 0.2, "expedite": 0.8,
                          "qualified_substitute": 1.1}[supply]
        crew_productivity = 0.0
        if crew == "reassign_to_ready_work":
            spend += 40.0
            crew_productivity = min(facts.crew_idle_hours,
                                    facts.alternate_work_hours) / 4
            schedule -= 0.2  # fictional coordination friction
        trust = 0.0
        if customer == "prepare_notice":
            spend += 15.0
            trust = 3.0
        evidence = [facts.supplier_event_id]
        evidence.extend(p.evidence_id for p in facts.dependent_projects)
        if supply == "qualified_substitute":
            evidence.append(facts.substitute_event_id)
        if supply == "expedite":
            evidence.append(facts.expedite_event_id)
        if crew == "reassign_to_ready_work":
            evidence.extend([facts.crew_event_id, facts.alternate_work_event_id])
        if customer == "prepare_notice":
            evidence.append(facts.customer_event_id)
        # Margin is normalized points for the synthetic objective, not money.
        effects = {
            "schedule": round(schedule, 4),
            "margin": round(-spend / 100 + crew_productivity * 0.7, 4),
            "crew_productivity": round(crew_productivity, 4),
            "customer_trust": trust,
        }
        uncertainty = {
            "schedule": sigma_schedule + (0.2 if crew != "hold" else 0),
            "margin": 0.3 + (0.6 if supply != "wait" else 0),
            "crew_productivity": 0.4 if crew != "hold" else 0.0,
            "customer_trust": 0.2 if customer != "quiet" else 0.0,
        }
        identifier = f"{supply}|{crew}|{customer}"
        projects = ", ".join(p.identifier for p in facts.dependent_projects)
        return Choice(
            identifier=identifier, decisions=decisions,
            expected_effects=effects, uncertainty=uncertainty,
            estimated_spend=spend, evidence_ids=tuple(evidence),
            explanation=f"Review {supply}, {crew}, and {customer} across dependent projects {projects}.",
            uncertainty_note="Effect sizes and costs are simulated estimates; verify alternatives before action.",
        )


DEMO_CASE = ProcurementDecisionCase(
    supplier_delay_days=3, supplier_event_id="E-SUPPLIER-1",
    dependent_projects=(
        DependentProject("PROJECT-17", 3, "E-DEPENDENCY-17"),
        DependentProject("PROJECT-42", 2, "E-DEPENDENCY-42"),
    ),
    crew_event_id="E-CREW-2", crew_idle_hours=16,
    alternate_work_event_id="E-READY-WORK-99", alternate_work_hours=12,
    qualified_substitute=True, substitute_event_id="E-SUBSTITUTE-2",
    expedite_available=True, expedite_event_id="E-EXPEDITE-1",
    customer_event_id="E-CUSTOMER-17",
)


def case_from_situation(current: list[Observation], tenant_id: str,
                        scope_id: str) -> ProcurementDecisionCase:
    """Map v0.8 evidence into a v0.9 portfolio decision, never inventing facts."""
    if any(e.tenant_id != tenant_id for e in current):
        raise ValueError("Mixed-tenant evidence must not reach a strategy planner")
    scoped = [e for e in current if e.scope_id == scope_id]
    by_metric: dict[str, list[Observation]] = {}
    for event in scoped:
        by_metric.setdefault(event.metric, []).append(event)

    def single(metric: str) -> Observation:
        candidates = by_metric.get(metric, [])
        if len(candidates) != 1:
            raise ValueError(f"Decision case needs exactly one current {metric} observation")
        return candidates[0]

    projects = by_metric.get("affected_work_days", [])
    if not 1 <= len(projects) <= 10:
        raise ValueError("A decision case needs grounded project dependencies")
    supplier = single("supplier_eta_slip_days")
    crew = single("crew_idle_hours")
    alternate = single("ready_work_hours")
    customer = single("customer_notice_context")
    substitute = single("qualified_substitute_available")
    expedite = single("expedite_available")
    if (type(substitute.value) is not int or substitute.value not in (0, 1)
            or type(expedite.value) is not int or expedite.value not in (0, 1)):
        raise ValueError("Availability evidence must be binary")
    return ProcurementDecisionCase(
        supplier_delay_days=supplier.value, supplier_event_id=supplier.event_id,
        dependent_projects=tuple(DependentProject(e.subject_id, e.value, e.event_id)
                                 for e in sorted(projects, key=lambda p: p.subject_id)),
        crew_event_id=crew.event_id, crew_idle_hours=crew.value,
        alternate_work_event_id=alternate.event_id,
        alternate_work_hours=alternate.value,
        qualified_substitute=bool(substitute.value),
        substitute_event_id=substitute.event_id,
        expedite_available=bool(expedite.value),
        expedite_event_id=expedite.event_id,
        customer_event_id=customer.event_id,
    )


STRATEGY_DEMO_OBSERVATIONS = (
    Observation("OWNER-1", "SRC-1", 1, "MATERIAL-BATCH-7", "SUPPLIER-1",
                "procurement", "supplier_eta_slip_days", 3),
    Observation("OWNER-1", "PROJECT-1", 1, "MATERIAL-BATCH-7", "PROJECT-17",
                "projects", "affected_work_days", 3),
    Observation("OWNER-1", "PROJECT-2", 1, "MATERIAL-BATCH-7", "PROJECT-42",
                "projects", "affected_work_days", 2),
    Observation("OWNER-1", "CREW-1", 1, "MATERIAL-BATCH-7", "TEAM-2",
                "operations", "crew_idle_hours", 16),
    Observation("OWNER-1", "READY-1", 1, "MATERIAL-BATCH-7", "PROJECT-99",
                "operations", "ready_work_hours", 12),
    Observation("OWNER-1", "SUB-1", 1, "MATERIAL-BATCH-7", "SUPPLIER-2",
                "procurement", "qualified_substitute_available", 1),
    Observation("OWNER-1", "EXP-1", 1, "MATERIAL-BATCH-7", "SUPPLIER-1",
                "procurement", "expedite_available", 1),
    Observation("OWNER-1", "CUS-1", 1, "MATERIAL-BATCH-7", "CUSTOMER-17",
                "customer_service", "customer_notice_context", 1),
)


def plan_for_electrical_situation(store: SituationStore, tenant_id: str,
                                  scope_id: str, max_spend: float,
                                  uncertainty_aversion: float = 0.5) -> dict:
    """Read a business's current evidence/goals, then plan without executing."""
    current = store.current(tenant_id)
    facts = case_from_situation(current, tenant_id, scope_id)
    weights = store.owner_goals(tenant_id)
    dimensions = ("schedule", "margin", "crew_productivity", "customer_trust")
    if set(weights) != set(dimensions):
        raise ValueError("Four explicit owner priorities are required before ranking")
    report = StrategicPlanner().enumerate_and_rank(
        ElectricalStrategyPack(), facts, {event.event_id for event in current},
        Goals(weights=weights, max_spend=max_spend,
              uncertainty_aversion=uncertainty_aversion),
    )
    report["case_source"] = "v0.8_current_situation_observations"
    report["scope_id"] = scope_id
    report["tenant_id"] = tenant_id
    report["evidence_records_in_scope"] = len([e for e in current if e.scope_id == scope_id])
    return report
