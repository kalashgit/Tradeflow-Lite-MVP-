"""Hidden world families. Planner-visible code must never import this module.

Each family has a ``nominal`` variant, where the public domain pack's declared
assumptions are roughly right, and a ``shifted`` variant, where a hidden rule
changes so that those declarations become systematically wrong. All numbers
are invented research units; none describe a real business or machine.
"""

from ...domains.dependency_dispatch import (
    EXPEDITE_SPEND, LATE_PENALTY, METRICS, OVERTIME_SPEND, DependencyDispatchPack,
    JobCase, sequence_progress,
)
from ...domains.electrical_strategy import ElectricalStrategyPack
from ...domains.equipment_maintenance import (
    FAILURE_LOSS, REPAIR_COST, SAFETY_LOSS, SAFETY_WEAR, SPEND, UNITS,
    EquipmentMaintenancePack, FleetCase, declared_failure_probability,
)
from ...domains.process_tuning import (
    DECLARED_LEVERS, STRONG_GAIN, STRONG_SPEND, ProcessTuningPack, TuningCase,
)
from ...strategic_evaluator import _case, hidden_actual_effects
from ..protocol import PublicStep
from .base import World, pick, uniform


class ElectricalProcurementWorld(World):
    """The existing v0.9 hidden procurement simulator, replayed as episodes.

    Step 0 of seed ``s`` is exactly v0.9 world ``s``; later steps are further
    cases for the same owner under the same persistent hidden regime.
    """

    family = "electrical_procurement"
    version = "1.0.0+evaluator-0.9"
    domain_id = "tradeflow_electrical_procurement"
    horizon = 6
    pack = ElectricalStrategyPack()
    baseline_decisions = pack.baseline_decisions

    def __init__(self, seed, variant, tenant_id):
        super().__init__(seed, variant, tenant_id)
        self.regime = "unexpected_failure" if self.shifted else "nominal"
        goals = _case(seed)[1]
        self.weights, self.max_spend = dict(goals.weights), float(goals.max_spend)
        self.risk_tolerance = round(1 - goals.uncertainty_aversion / 2, 6)

    def case_seed(self, step: int) -> int:
        return self.seed if step == 0 else 1_000_000 + self.seed * 16 + step

    def public_step(self, state, step):
        seed, at = self.case_seed(step), self.as_of(step)
        facts, scope = _case(seed)[0], f"BATCH-{seed}"
        emit = lambda event, subject, metric, value, department, **extra: self.fact(  # noqa: E731
            event, scope, subject, metric, value, extra.pop("revision", 1), at,
            department=department, **extra)
        observations = []
        if uniform(self.seed, step, "supplier_correction") < 0.3:
            # An earlier wrong reading that the supplier then corrects.
            early = f"{facts.supplier_event_id}-R1"
            observations.append(self.fact(
                early, scope, "SUPPLIER", "supplier_eta_slip_days",
                min(30, facts.supplier_delay_days + 2), 1, at - 1, department="procurement"))
            observations.append(emit(facts.supplier_event_id, "SUPPLIER",
                                     "supplier_eta_slip_days", facts.supplier_delay_days,
                                     "procurement", revision=2, corrects_event_id=early))
        else:
            observations.append(emit(facts.supplier_event_id, "SUPPLIER",
                                     "supplier_eta_slip_days", facts.supplier_delay_days,
                                     "procurement"))
        for project in facts.dependent_projects:
            observations.append(emit(project.evidence_id, project.identifier,
                                     "affected_work_days", project.affected_work_days,
                                     "projects"))
        observations += [
            emit(facts.crew_event_id, "TEAM", "crew_idle_hours", facts.crew_idle_hours,
                 "operations"),
            emit(facts.alternate_work_event_id, "READY-WORK", "ready_work_hours",
                 facts.alternate_work_hours, "operations"),
            emit(facts.substitute_event_id, "ALT-SUPPLIER", "qualified_substitute_available",
                 int(facts.qualified_substitute), "procurement"),
            emit(facts.expedite_event_id, "SUPPLIER", "expedite_available",
                 int(facts.expedite_available), "procurement"),
            emit(facts.customer_event_id, "CUSTOMER", "customer_notice_context", 1,
                 "customer_service"),
        ]
        return PublicStep(step, at, scope, f"CASE-EP-{self.seed}-{step}", tuple(observations))

    def admissible(self, state, step):
        return self._feasible(self.pack, _case(self.case_seed(step))[0])

    def transition(self, state, step, decisions):
        seed = self.case_seed(step)
        return hidden_actual_effects(seed, _case(seed)[0], decisions, regime=self.regime), None


class CausalRulesWorld(World):
    """Lever effects depend on hidden interaction rules among observed conditions.

    Shift: the unconditional lever becomes strongly antagonised (also by load),
    one conditional lever needs a conjunction, and strong doses destabilise.
    """

    family = "hidden_causal_rules"
    version = "1.0.0"
    domain_id = "synthetic_process_tuning"
    horizon = 6
    pack = ProcessTuningPack()
    baseline_decisions = pack.baseline_decisions

    def __init__(self, seed, variant, tenant_id):
        super().__init__(seed, variant, tenant_id)
        self._goals(({"output": 5, "stability": 2, "cost": 2},
                     {"output": 3, "stability": 5, "cost": 1},
                     {"output": 3, "stability": 1, "cost": 5}), (100, 160, 250))
        self.potency = {lever: 0.8 + 0.4 * uniform(seed, "potency", lever)
                        for lever in DECLARED_LEVERS}

    def _conditions(self, step):
        a, b, c = (int(uniform(self.seed, step, name) < 0.5) for name in "abc")
        return a, b, c, 1 + int(uniform(self.seed, step, "load") * 5)

    def public_step(self, state, step):
        a, b, c, load = self._conditions(step)
        at, scope = self.as_of(step), "LINE"
        hidden = {"cond_a": 0.1, "cond_b": 0.3, "cond_c": 0.1}  # partial observability
        observations = [self.fact(
            f"EV-CR-{self.seed}-{step}-{name}", scope, "LINE", name,
            None if uniform(self.seed, step, "unobserved", name) < hidden[name] else value,
            step + 1, at) for name, value in (("cond_a", a), ("cond_b", b), ("cond_c", c))]
        observations.append(self.fact(f"EV-CR-{self.seed}-{step}-load", scope, "LINE",
                                      "load_level", load, step + 1, at))
        return PublicStep(step, at, scope, f"CASE-CR-{self.seed}-{step}", tuple(observations))

    def admissible(self, state, step):
        a, b, c, load = self._conditions(step)
        return self._feasible(self.pack, TuningCase(a, b, c, load, {
            name: "TRUE" for name in ("cond_a", "cond_b", "cond_c", "load_level")}))

    def transition(self, state, step, decisions):
        chosen = dict(decisions)
        lever, strong = chosen["lever"], chosen["dose"] == "strong"
        if lever == "hold":
            return {"output": 0.0, "stability": 0.0, "cost": 0.0}, None
        a, b, c, load = self._conditions(step)
        if lever == "lever_x":
            gain = 2.0 if a else 0.5
        elif lever == "lever_y":
            gain = 1.5
            if b or (self.shifted and load >= 4):
                gain -= 4.0 if self.shifted else 1.0
        else:
            gain = 2.6 if c else 0.0
            if self.shifted and c and a:
                gain = -1.0
        gain = gain * self.potency[lever] + 0.8 * (
            uniform(self.seed, step, "noise", lever) - 0.5)
        stability = -0.3
        if strong:
            gain *= STRONG_GAIN
            unstable = uniform(self.seed, step, "instability") < (
                0.55 if self.shifted else 0.15)
            stability = -3.0 if unstable else -0.6
        spend = DECLARED_LEVERS[lever][3] * (STRONG_SPEND if strong else 1.0)
        return {"output": gain, "stability": stability, "cost": -spend / 100}, None


class ResourceAllocationWorld(World):
    """Scarce maintenance capacity across machines with hidden fragility.

    Shift: one machine's wear sensor under-reads, inspections help less and
    overhauls can themselves cause an early failure.
    """

    family = "resource_allocation"
    version = "1.0.0"
    domain_id = "synthetic_equipment_maintenance"
    horizon = 6
    pack = EquipmentMaintenancePack()
    baseline_decisions = pack.baseline_decisions

    def __init__(self, seed, variant, tenant_id):
        super().__init__(seed, variant, tenant_id)
        self._goals(({"uptime": 5, "budget": 2, "safety": 3},
                     {"uptime": 3, "budget": 5, "safety": 1},
                     {"uptime": 3, "budget": 1, "safety": 5}), (100, 250, 450))
        self.fragility = {unit: pick((0.7, 1.0, 1.5), seed, "fragility", unit)
                          for unit in UNITS}
        self.biased_unit = pick(UNITS, seed, "biased_sensor")

    def _fleet(self, step) -> FleetCase:
        return FleetCase(
            wear={u: 20 + int(uniform(self.seed, step, "wear", u) * 75) for u in UNITS},
            criticality={u: 1 + int(uniform(self.seed, step, "crit", u) * 3) for u in UNITS},
            technician_hours=pick((2, 4, 8, 12), self.seed, step, "hours"),
            spare_kits=int(uniform(self.seed, step, "kits") * 3), evidence={})

    def public_step(self, state, step):
        fleet, at, scope, observations = self._fleet(step), self.as_of(step), "FLEET", []
        for unit in UNITS:
            observations.append(self.fact(f"EV-RA-{self.seed}-{step}-wear-{unit}", scope, unit,
                                          "wear_index", fleet.wear[unit], step + 1, at))
            observations.append(self.fact(f"EV-RA-{self.seed}-{step}-crit-{unit}", scope, unit,
                                          "criticality", fleet.criticality[unit], step + 1, at))
        observations.append(self.fact(f"EV-RA-{self.seed}-{step}-kits", scope, "CREW",
                                      "spare_kits", fleet.spare_kits, step + 1, at))
        # Sometimes the crew roster is simply not re-reported: the last reading
        # goes stale and a careful system must not act on it.
        if step == 0 or uniform(self.seed, step, "roster_missing") >= 0.08:
            observations.append(self.fact(f"EV-RA-{self.seed}-{step}-hours", scope, "CREW",
                                          "technician_hours", fleet.technician_hours,
                                          step + 1, at))
        return PublicStep(step, at, scope, f"CASE-RA-{self.seed}-{step}", tuple(observations))

    def _true_case(self, step) -> FleetCase:
        fleet = self._fleet(step)
        keys = [f"{m}:{u}" for m in ("wear_index", "criticality") for u in UNITS]
        return FleetCase(fleet.wear, fleet.criticality, fleet.technician_hours,
                         fleet.spare_kits,
                         {key: "TRUE" for key in keys + ["technician_hours:CREW",
                                                         "spare_kits:CREW"]})

    def admissible(self, state, step):
        return self._feasible(self.pack, self._true_case(step))

    def transition(self, state, step, decisions):
        chosen, fleet = dict(decisions), self._fleet(step)
        depth = chosen["depth"]
        targets = [u for u in (chosen["first"], chosen["second"]) if u != "none"]
        factor = {"inspect": 0.85 if self.shifted else 0.6, "overhaul": 0.2}[depth]
        uptime = safety = 0.0
        failures = 0
        for unit in UNITS:
            wear = fleet.wear[unit] + (30 if self.shifted and unit == self.biased_unit else 0)
            risk = min(0.95, declared_failure_probability(wear) * self.fragility[unit])
            if unit in targets:
                risk *= factor
            failed = uniform(self.seed, step, "fail", unit) < risk
            if (self.shifted and unit in targets and depth == "overhaul"
                    and uniform(self.seed, step, "infant_mortality", unit) < 0.4):
                failed = True
            if failed:
                failures += 1
                uptime -= FAILURE_LOSS * fleet.criticality[unit]
                if wear >= SAFETY_WEAR:
                    safety -= SAFETY_LOSS
        spend = len(targets) * SPEND[depth]
        return {"uptime": uptime, "budget": -spend / 100 - failures * REPAIR_COST,
                "safety": safety}, None


class OperationalDependenciesWorld(World):
    """Multi-period jobs where today's choice changes tomorrow's state.

    Shift: early downstream work is usually scrapped, expediting mostly fails
    and overtime reliably fatigues the crew.
    """

    family = "operational_dependencies"
    version = "1.0.0"
    domain_id = "synthetic_dependency_dispatch"
    sequential = True
    jobs, periods = 2, 4
    horizon = jobs * periods
    pack = DependencyDispatchPack()
    baseline_decisions = pack.baseline_decisions

    def __init__(self, seed, variant, tenant_id):
        super().__init__(seed, variant, tenant_id)
        self._goals(({"schedule": 5, "cost": 2, "quality": 2},
                     {"schedule": 3, "cost": 5, "quality": 1},
                     {"schedule": 3, "cost": 1, "quality": 5}), (60, 100, 150))
        self.rework, self.expedite, self.fatigue = (
            (0.7, 0.3, 0.7) if self.shifted else (0.2, 0.8, 0.2))

    def _job_start(self, job: int):
        if job >= self.jobs:
            return ("done",)
        return (1 + int(uniform(self.seed, job, "upstream") * 3),
                2 + int(uniform(self.seed, job, "downstream") * 2),
                int(uniform(self.seed, job, "part_eta") * 4), 0)

    def initial_state(self):
        return self._job_start(0)

    def _case(self, state, step) -> JobCase:
        upstream, downstream, eta, fatigued = state
        return JobCase(upstream, downstream, eta, 1 if fatigued else 2,
                       self.periods - step % self.periods, ("TRUE",))

    def public_step(self, state, step):
        job, period = divmod(step, self.periods)
        case, at, scope = self._case(state, step), self.as_of(step), f"JOB-{self.seed}-{job}"
        values = (case.upstream_remaining, case.downstream_remaining, case.part_eta,
                  case.capacity, case.periods_left)
        observations = tuple(self.fact(
            f"EV-OD-{self.seed}-{step}-{index}", scope, "JOB", metric, value, period + 1, at)
            for index, (metric, value) in enumerate(zip(METRICS, values)))
        return PublicStep(step, at, scope, f"CASE-OD-{self.seed}-{step}", observations)

    def admissible(self, state, step):
        return self._feasible(self.pack, self._case(state, step))

    def transition(self, state, step, decisions):
        chosen = dict(decisions)
        focus, overtime = chosen["focus"], chosen["crew"] == "overtime"
        upstream, downstream, eta, fatigued = state
        job, period = divmod(step, self.periods)
        capacity = (1 if fatigued else 2) + (1 if overtime else 0)
        spend = (OVERTIME_SPEND if overtime else 0.0) + (
            EXPEDITE_SPEND if focus == "expedite_part" else 0.0)
        schedule = quality = 0.0
        if focus == "start_downstream_early":
            attempt = min(capacity, downstream)
            if uniform(self.seed, job, period, "rework") < self.rework:
                quality -= attempt       # scrapped: effort spent, no progress
            else:
                downstream -= attempt
                schedule += attempt
        else:
            up, down = sequence_progress(upstream, downstream, eta, capacity)
            upstream, downstream, schedule = upstream - up, downstream - down, float(up + down)
            if focus == "expedite_part" and uniform(
                    self.seed, job, period, "expedite") < self.expedite:
                eta, schedule = max(0, eta - 1), schedule + 1.0
        eta = max(0, eta - 1)
        tired = int(overtime and uniform(self.seed, job, period, "fatigue") < self.fatigue)
        quality -= 0.5 * tired
        if period == self.periods - 1:
            schedule -= LATE_PENALTY * (upstream + downstream)
            following = self._job_start(job + 1)
        else:
            following = (upstream, downstream, eta, tired)
        return {"schedule": schedule, "cost": -spend / 100, "quality": quality}, following


FAMILIES = {world.family: world for world in (
    ElectricalProcurementWorld, CausalRulesWorld, ResourceAllocationWorld,
    OperationalDependenciesWorld)}


def make_world(family: str, seed: int, variant: str) -> World:
    if family not in FAMILIES:
        raise ValueError("Unknown world family")
    short = "".join(part[0] for part in family.split("_")).upper()
    return FAMILIES[family](seed, variant, f"T-{short}-{variant[0].upper()}-{seed}")
