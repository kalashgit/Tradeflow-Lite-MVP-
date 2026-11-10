"""Independent policies and matched-cohort evaluation for TradeFlow World V1."""

from collections import deque
from dataclasses import dataclass
from math import log
from statistics import mean

from .worlds.tradeflow import Decision, Job, Result, TradeFlowWorld


class CostFirst:
    name = "cost_first"

    def choose(self, job: Job) -> Decision:
        return Decision("economy", False)

    def observe(self, job: Job, decision: Decision, outcome: Result):
        pass


class StaticRiskRule:
    name = "static_risk_rule"

    def choose(self, job: Job) -> Decision:
        return Decision(
            "priority" if job.urgent else "economy",
            job.urgent and job.high_crew_load,
        )

    def observe(self, job: Job, decision: Decision, outcome: Result):
        pass


class AdaptiveRiskLearner:
    """Small interpretable baseline, not Qwen and not a learned neural model."""

    name = "adaptive_risk"

    def __init__(self, memory_window: int = 16, probe_period: int = 9):
        if memory_window < 2 or probe_period < 2:
            raise ValueError("Memory window and probe period must be at least two")
        self.material = {s: deque(maxlen=memory_window) for s in ("economy", "priority")}
        self.crew = {(high, reserve): deque(maxlen=memory_window)
                     for high in (False, True) for reserve in (False, True)}
        self.probe_period = probe_period
        self.decisions = 0
        self.probes = 0

    @staticmethod
    def _probability(history, prior: float, prior_weight: float = 3.0) -> float:
        return (prior * prior_weight + sum(history)) / (prior_weight + len(history))

    def estimated_material_delay(self, supplier: str) -> float:
        return self._probability(self.material[supplier], 0.15 if supplier == "economy" else 0.05)

    def estimated_crew_delay(self, high: bool, reserve: bool) -> float:
        prior = 0.10 if reserve and high else 0.04 if reserve else 0.50 if high else 0.07
        return self._probability(self.crew[(high, reserve)], prior)

    def choose(self, job: Job) -> Decision:
        self.decisions += 1
        candidates = []
        penalty = 45_000 if job.urgent else 20_000
        for supplier in ("economy", "priority"):
            for reserve in (False, True):
                material = self.estimated_material_delay(supplier)
                crew = self.estimated_crew_delay(job.high_crew_load, reserve)
                late_probability = 1 - (1 - material) * (1 - crew)
                procurement = job.material_units * (16_500 if supplier == "priority" else 12_000)
                reserve_cost = 8_500 if reserve else 0
                expected_cost = procurement + reserve_cost + late_probability * penalty
                candidates.append((expected_cost, supplier, reserve))
        _, supplier, reserve = min(candidates)
        # Occasional low-urgency probe prevents supplier avoidance from making
        # its status impossible to update. This is safe only inside simulation.
        if not job.urgent and self.decisions % self.probe_period == 0:
            supplier = "economy"
            self.probes += 1
        return Decision(supplier, reserve)

    def observe(self, job: Job, decision: Decision, outcome: Result):
        self.material[decision.supplier].append(int(outcome.material_delayed))
        self.crew[(job.high_crew_load, decision.reserve_crew)].append(int(outcome.crew_delayed))


class DriftAwareRiskLearner(AdaptiveRiskLearner):
    """Separate hypothesis: a sharp economy-supplier change merits re-learning."""

    name = "drift_aware_risk"

    def __init__(self, memory_window: int = 16, probe_period: int = 9):
        super().__init__(memory_window=memory_window, probe_period=probe_period)
        self.shift_detected = False
        self.detection_at: int | None = None
        self.change_score = 0.0

    def observe(self, job: Job, decision: Decision, outcome: Result):
        super().observe(job, decision, outcome)
        # A cumulative likelihood-ratio detector (CUSUM), comparing a modest
        # initial delay rate with a sustained degradation hypothesis. It does
        # not know the true hidden supplier probability or the change time.
        if not self.shift_detected and decision.supplier == "economy":
            x = int(outcome.material_delayed)
            evidence = log(0.65 / 0.12) if x else log(0.35 / 0.88)
            self.change_score = max(0.0, self.change_score + evidence)
        if not self.shift_detected and self.change_score > 6.0:
            self.shift_detected = True
            self.detection_at = job.index
            # Old evidence is no longer treated as current-regime evidence.
            # A conservative prior is retained until new evidence accumulates.
            self.material["economy"].clear()
            self.material["economy"].extend((1, 1, 1))

    def estimated_material_delay(self, supplier: str) -> float:
        probability = super().estimated_material_delay(supplier)
        if supplier == "economy" and self.shift_detected:
            return max(probability, 0.55)
        return probability


@dataclass(frozen=True)
class CompanyResult:
    seed: int
    policy: str
    jobs: int
    net_contribution: int
    after_shift_contribution: int
    ontime_rate: float
    late_jobs: int
    priority_choices: int
    reserve_choices: int
    research_probes: int
    drift_alarm_at: int | None

    def as_dict(self):
        return {
            "seed": self.seed, "policy": self.policy, "jobs": self.jobs,
            "net_contribution": self.net_contribution,
            "after_shift_contribution": self.after_shift_contribution,
            "ontime_rate": round(self.ontime_rate, 6),
            "late_jobs": self.late_jobs,
            "priority_choices": self.priority_choices,
            "reserve_choices": self.reserve_choices,
            "research_probes": self.research_probes,
            "drift_alarm_at": self.drift_alarm_at,
        }


def run_company(seed: int, policy, jobs: int = 80,
                shift_at: int | None = 30) -> CompanyResult:
    world = TradeFlowWorld(seed, jobs=jobs, shift_at=shift_at)
    outcomes: list[Result] = []
    decisions = []
    for job in world.jobs():
        decision = policy.choose(job)
        outcome = world.execute(job, decision)
        policy.observe(job, decision, outcome)
        decisions.append(decision)
        outcomes.append(outcome)
    return CompanyResult(
        seed=seed, policy=policy.name, jobs=jobs,
        net_contribution=sum(result.net_contribution for result in outcomes),
        after_shift_contribution=sum(result.net_contribution for result in outcomes[
            shift_at if shift_at is not None else 0:]),
        ontime_rate=mean(not result.late for result in outcomes),
        late_jobs=sum(result.late for result in outcomes),
        priority_choices=sum(d.supplier == "priority" for d in decisions),
        reserve_choices=sum(d.reserve_crew for d in decisions),
        research_probes=getattr(policy, "probes", 0),
        drift_alarm_at=getattr(policy, "detection_at", None),
    )


def benchmark_tradeflow_world(start_seed: int = 100, companies: int = 50,
                              jobs: int = 80, shift_at: int = 30) -> dict:
    if not 1 <= companies <= 500 or jobs < 5 or not 0 < shift_at < jobs:
        raise ValueError("Invalid simulation bounds")
    factories = (CostFirst, StaticRiskRule, AdaptiveRiskLearner, DriftAwareRiskLearner)
    cohort = {factory.name: [run_company(s, factory(), jobs=jobs, shift_at=shift_at)
                             for s in range(start_seed, start_seed + companies)]
              for factory in factories}
    summaries = {}
    for name, results in cohort.items():
        summaries[name] = {
            "mean_net_contribution": round(mean(r.net_contribution for r in results), 2),
            "mean_after_shift_contribution": round(mean(r.after_shift_contribution for r in results), 2),
            "mean_ontime_rate": round(mean(r.ontime_rate for r in results), 4),
            "mean_late_jobs": round(mean(r.late_jobs for r in results), 2),
            "mean_priority_choices": round(mean(r.priority_choices for r in results), 2),
            "mean_reserve_choices": round(mean(r.reserve_choices for r in results), 2),
        }
    drift_results = cohort[DriftAwareRiskLearner.name]
    unchanged_controls = [run_company(s, DriftAwareRiskLearner(), jobs=jobs, shift_at=None)
                          for s in range(start_seed, start_seed + companies)]
    controls_summary = {
        "drift_detection_rate_after_change": round(sum(
            r.drift_alarm_at is not None and r.drift_alarm_at >= shift_at
            for r in drift_results) / companies, 4),
        "false_alarms_before_change": sum(
            r.drift_alarm_at is not None and r.drift_alarm_at < shift_at
            for r in drift_results),
        "false_alarms_in_unchanged_worlds": sum(
            r.drift_alarm_at is not None for r in unchanged_controls),
        "unchanged_control_companies": companies,
    }
    return {
        "world": "TradeFlow World V1 — fully synthetic electrical contractor",
        "cohort": {"start_seed": start_seed, "companies": companies,
                   "jobs_per_company": jobs, "hidden_shift_after_job": shift_at},
        "results": summaries,
        "sample_company": {name: results[0].as_dict() for name, results in cohort.items()},
        "shift_detection": controls_summary,
        "controls": {
            "same_jobs_for_policies": True,
            "same_underlying_shocks_for_policies": True,
            "all_effects_are_simulated": True,
            "real_business_record_access": False,
            "real_tradeflow_actions": False,
            "qwen_inference_used": False,
            "reward": "synthetic net contribution after lateness cost, integer cents",
        },
        "limitations": [
            "Hand-designed utility structure and procurement/crew mechanisms",
            "Small and partially observable business world, not a real contractor digital twin",
            "Adaptive policy is conventional Bayesian-style updating, not open-ended AI",
            "One supplier reliability shift; no multi-step customer/crew scheduling workflows yet",
        ],
    }
