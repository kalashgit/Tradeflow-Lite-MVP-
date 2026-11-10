"""TradeFlow World V1: a simulated electrical contractor operating environment.

Everything in this module is synthetic. It never reads or writes customer data,
never invokes TradeFlow APIs, and cannot make real purchasing/staffing decisions.
Hidden mechanisms belong to the simulator; decision policies see job records and
observed outcomes only.
"""

from dataclasses import dataclass
import hashlib
import random


@dataclass(frozen=True)
class Job:
    job_id: str
    index: int
    urgent: bool
    high_crew_load: bool
    material_units: int
    quoted_revenue: int  # Integer cents, fictional currency independent of exchange rates.


@dataclass(frozen=True)
class Decision:
    supplier: str  # economy | priority
    reserve_crew: bool

    def __post_init__(self):
        if self.supplier not in ("economy", "priority"):
            raise ValueError("Supplier must be economy or priority")
        if not isinstance(self.reserve_crew, bool):
            raise ValueError("reserve_crew must be a boolean")


@dataclass(frozen=True)
class Result:
    job_id: str
    material_delayed: bool
    crew_delayed: bool
    late: bool
    gross_margin: int
    delay_cost: int
    net_contribution: int


class TradeFlowWorld:
    """Seeded jobs and hidden procurement/crew rules with a regime change."""

    def __init__(self, seed: int, jobs: int = 80, shift_at: int | None = 30):
        if jobs < 5:
            raise ValueError("At least five jobs are needed")
        if shift_at is not None and not 0 < shift_at < jobs:
            raise ValueError("Shift must be strictly inside episode")
        self.seed = seed
        self.shift_at = shift_at
        generator = random.Random(seed + 44_991)
        self._jobs = tuple(self._generate_job(i, generator) for i in range(jobs))
        self._economy_before = 0.85 + 0.02 * (seed % 5)
        self._economy_after = 0.30 + 0.05 * (seed % 4)
        self._priority = 0.93 + 0.01 * (seed % 5)

    @staticmethod
    def _generate_job(index: int, rng: random.Random) -> Job:
        urgent = rng.random() < 0.43
        load = rng.random() < 0.49
        units = rng.randint(1, 3)
        # Simplified hypothetical quote; no customer price or real market data.
        revenue = 54_000 + 24_000 * units + (12_000 if urgent else 0)
        return Job(
            job_id=f"SYN-JOB-{index+1:04d}", index=index, urgent=urgent,
            high_crew_load=load, material_units=units, quoted_revenue=revenue,
        )

    def jobs(self) -> tuple[Job, ...]:
        return self._jobs

    def public_description(self) -> dict:
        return {
            "domain": "fictional electrical contractor operations",
            "jobs": len(self._jobs),
            "choices": ["economy/priority supplier", "standard/reserve crew"],
            "observations": ["material_delayed", "crew_delayed", "late", "net_contribution"],
            "hidden_rules_disclosed": False,
            "real_business_data": False,
            "external_side_effects": False,
        }

    def _uniform(self, index: int, event: str) -> float:
        # Common random numbers: competing policies experience the same
        # underlying job-level shock, independent of their chosen intervention.
        digest = hashlib.sha256(f"{self.seed}:{index}:{event}".encode()).digest()
        return int.from_bytes(digest[:8], "big") / 2**64

    def _material_ontime_probability(self, job: Job, supplier: str) -> float:
        if supplier == "priority":
            return self._priority
        if self.shift_at is not None and job.index >= self.shift_at:
            return self._economy_after
        return self._economy_before

    @staticmethod
    def _crew_delay_probability(job: Job, reserve: bool) -> float:
        if job.high_crew_load:
            return 0.10 if reserve else 0.53
        return 0.04 if reserve else 0.07

    def execute(self, job: Job, decision: Decision) -> Result:
        if job not in self._jobs:
            raise ValueError("Job does not belong to this simulated company")
        material_delayed = self._uniform(job.index, "material") >= (
            self._material_ontime_probability(job, decision.supplier)
        )
        crew_delayed = self._uniform(job.index, "crew") < self._crew_delay_probability(
            job, decision.reserve_crew
        )
        late = material_delayed or crew_delayed
        material_cost = job.material_units * (16_500 if decision.supplier == "priority" else 12_000)
        labor_cost = 20_000 + 3_500 * job.material_units + (8_500 if decision.reserve_crew else 0)
        gross_margin = job.quoted_revenue - material_cost - labor_cost
        delay_cost = (45_000 if job.urgent else 20_000) if late else 0
        return Result(
            job_id=job.job_id, material_delayed=material_delayed,
            crew_delayed=crew_delayed, late=late, gross_margin=gross_margin,
            delay_cost=delay_cost, net_contribution=gross_margin - delay_cost,
        )
