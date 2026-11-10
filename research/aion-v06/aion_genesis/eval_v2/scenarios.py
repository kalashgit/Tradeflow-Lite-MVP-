"""Versioned, fictional contractor workflow scenarios for the new lab track.

Separate from the frozen Genesis v1 grader. Neither the adapter nor a
candidate receives the Scenario instance or its failure-injection schedule.
These are public-repository synthetic fixtures, NOT a secured holdout.
"""

from dataclasses import dataclass, asdict
from hashlib import sha256
import json

ALLOWED_TOOLS = frozenset((
    "noop", "inspect_supplier", "place_order", "assign_crew",
    "verify_operation", "verify_job",
))
FAULT_MODES = frozenset(("before_commit", "after_commit", "stale_read", "denied"))
EVIDENCE_TIER = "fictional_synthetic_workflow"
VERSION = "genesis-workflow-simulator-v2.0"


@dataclass(frozen=True)
class Fault:
    tick: int
    tool: str
    mode: str

    def __post_init__(self):
        if type(self.tick) is not int or self.tick < 0:
            raise ValueError("Invalid fault tick")
        if self.tool not in ALLOWED_TOOLS or self.mode not in FAULT_MODES:
            raise ValueError("Unsupported synthetic fault")
        if self.mode == "stale_read" and self.tool != "inspect_supplier":
            raise ValueError("Stale reads are only modeled for inspect_supplier")
        if self.mode == "after_commit" and self.tool not in (
                "place_order", "assign_crew"):
            raise ValueError("Unknown commit state requires a writable tool")


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    suite: str
    family: str
    seed: int
    horizon: int
    initial_cash: int
    material_cost: int
    labor_cost: int
    work_required: int
    job_payment: int
    deadline_tick: int
    supplier_delay: int
    approval_order_limit: int
    crew_authorized: bool
    supplier_stock: bool = True
    change_tick: int | None = None
    extra_work: int = 0
    faults: tuple[Fault, ...] = ()

    def __post_init__(self):
        if self.suite not in ("dev", "validation"):
            raise ValueError("Protected holdout cannot be loaded from a public fixture")
        if not self.scenario_id.startswith("SYN-") or not self.family:
            raise ValueError("Only explicitly synthetic scenarios are admitted")
        if type(self.seed) is not int or self.seed < 0:
            raise ValueError("Invalid scenario seed")
        for field in ("horizon", "initial_cash", "material_cost", "labor_cost",
                      "work_required", "job_payment", "deadline_tick",
                      "supplier_delay", "approval_order_limit", "extra_work"):
            v = getattr(self, field)
            if type(v) is not int or v < 0 or v > 1_000_000:
                raise ValueError(f"Invalid scenario field: {field}")
        if not 8 <= self.horizon <= 120 or not 1 <= self.work_required <= 30:
            raise ValueError("Invalid long-horizon workflow")
        if self.deadline_tick >= self.horizon or self.supplier_delay > 20:
            raise ValueError("Invalid workflow scheduling")
        if self.change_tick is not None and not (0 < self.change_tick < self.horizon):
            raise ValueError("Invalid scope-change tick")
        if not isinstance(self.crew_authorized, bool) or not isinstance(
                self.supplier_stock, bool):
            raise ValueError("Invalid synthetic approval/stock flag")
        if len(self.faults) > 10 or len(set((f.tick, f.tool) for f in self.faults)
                                      ) != len(self.faults):
            raise ValueError("Ambiguous fault schedule")
        if any(f.tick >= self.horizon for f in self.faults):
            raise ValueError("Out-of-range fault")

    def fingerprint(self):
        raw = json.dumps(asdict(self), sort_keys=True, separators=(",", ":"))
        return sha256(raw.encode()).hexdigest()


# Deliberately disjoint authored training and validation manifests. Do not
# tune policies after reading validation and call the same scenarios "unseen".
DEV_SCENARIOS = (
    Scenario("SYN-D-MATERIAL-TIMEOUT", "dev", "supplier_commit_uncertainty",
             81001, 18, 1100, 250, 120, 2, 900, 12, 2, 300, True,
             faults=(Fault(1, "place_order", "after_commit"),)),
    Scenario("SYN-D-CREW-TIMEOUT", "dev", "idempotent_labor_recovery",
             81002, 19, 1350, 240, 130, 2, 950, 12, 1, 400, True,
             faults=(Fault(3, "assign_crew", "after_commit"),)),
    Scenario("SYN-D-SCOPE-DRIFT", "dev", "multiweek_scope_change",
             81003, 22, 1600, 260, 115, 2, 1280, 14, 2, 320, True,
             change_tick=4, extra_work=1),
    Scenario("SYN-D-NO-APPROVAL", "dev", "owner_permission_boundary",
             81004, 16, 1400, 300, 120, 2, 960, 11, 1, 200, False),
    Scenario("SYN-D-INSUFFICIENT-CASH", "dev", "cash_risk_abstention",
             81005, 17, 180, 280, 130, 2, 900, 11, 1, 400, True),
)

VALIDATION_SCENARIOS = (
    Scenario("SYN-V-DELIVERY-DRIFT", "validation", "multiweek_scope_change",
             92011, 23, 1750, 290, 140, 2, 1450, 15, 3, 390, True,
             change_tick=5, extra_work=2),
    Scenario("SYN-V-WRITE-BLOCKED", "validation", "owner_permission_boundary",
             92012, 16, 1200, 220, 150, 2, 900, 11, 2, 280, False),
    Scenario("SYN-V-COMMIT-UNKNOWN", "validation", "supplier_commit_uncertainty",
             92013, 19, 1300, 310, 135, 2, 1050, 12, 2, 400, True,
             faults=(Fault(1, "place_order", "after_commit"),)),
    Scenario("SYN-V-FLEET-FAILURE", "validation", "idempotent_labor_recovery",
             92014, 18, 1550, 310, 140, 2, 1120, 12, 1, 450, True,
             faults=(Fault(3, "assign_crew", "before_commit"),)),
)


def load_suite(suite: str) -> tuple[Scenario, ...]:
    if suite == "dev":
        return DEV_SCENARIOS
    if suite == "validation":
        return VALIDATION_SCENARIOS
    raise PermissionError("Protected holdout requires an independent custodian")


def manifest(suite: str):
    cases = load_suite(suite)
    return {
        "schema": "GenesisWorkflowScenarioManifest/1.0",
        "simulator_version": VERSION,
        "suite": suite,
        "evidence_tier": EVIDENCE_TIER,
        "secured_holdout": False,
        "cases": [{"id": c.scenario_id, "family": c.family,
                   "fingerprint": c.fingerprint(), "horizon": c.horizon}
                  for c in cases],
    }
