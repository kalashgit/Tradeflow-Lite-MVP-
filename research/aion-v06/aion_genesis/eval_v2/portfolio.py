"""Independent v2.1 fictional multi-project cash/crew portfolio environment.

Research only. Candidate policies receive only public_view() and mock tool
responses; the scenario, future changes, fault schedule and final-state grader
remain outside the policy interface. These public fixtures are NOT a holdout.

One tick is a fictional business day. Within a tick an agent has a limited
number of tool calls and shared crew and supplier capacity. Job payments may
arrive after verification, so finishing one job can enable another.
"""

from dataclasses import dataclass, asdict
from hashlib import sha256
import json
import re

SCHEMA = "GenesisPortfolioWorld/2.1"
WRITE_TOOLS = frozenset(("order_materials", "schedule_crew"))
TOOLS = WRITE_TOOLS | {"wait", "verify_job", "inspect_operation"}
_KEY = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")


@dataclass(frozen=True)
class Job:
    job_id: str
    arrival: int
    deadline: int
    material_cost: int
    labor_cost: int
    shifts: int
    payment: int
    supplier_delay: int
    payment_delay: int
    priority: int
    order_limit: int
    crew_approved: bool = True

    def __post_init__(self):
        if not re.fullmatch(r"JOB-[A-Z0-9-]{1,24}", self.job_id):
            raise ValueError("Invalid fictional job ID")
        nums = ("arrival", "deadline", "material_cost", "labor_cost",
                "shifts", "payment", "supplier_delay", "payment_delay",
                "priority", "order_limit")
        if any(type(getattr(self, key)) is not int or getattr(self, key) < 0 or
               getattr(self, key) > 1_000_000 for key in nums):
            raise ValueError("Invalid job schedule, constraints or economics")
        if not 1 <= self.priority <= 5 or not 1 <= self.shifts <= 16:
            raise ValueError("Invalid priority or work")
        if self.deadline < self.arrival:
            raise ValueError("Invalid job deadline")
        if not isinstance(self.crew_approved, bool):
            raise ValueError("Invalid crew authorization")


@dataclass(frozen=True)
class OwnerChange:
    tick: int
    job_id: str
    new_priority: int
    extra_shifts: int = 0


@dataclass(frozen=True)
class ToolFault:
    tick: int
    tool: str
    job_id: str
    mode: str


@dataclass(frozen=True)
class PortfolioCase:
    case_id: str
    suite: str
    seed: int
    horizon: int
    cash: int
    crew_slots: int
    supplier_slots: int
    jobs: tuple[Job, ...]
    changes: tuple[OwnerChange, ...] = ()
    faults: tuple[ToolFault, ...] = ()

    def __post_init__(self):
        if self.suite not in ("dev", "validation"):
            raise PermissionError("Protected holdout not accessible here")
        if not re.fullmatch(r"SYN-PORT-[A-Z0-9-]{2,60}", self.case_id):
            raise ValueError("Only fictional portfolio cases are supported")
        if type(self.seed) is not int or self.seed < 0 or (
                type(self.horizon) is not int or not 8 <= self.horizon <= 60):
            raise ValueError("Invalid scenario seed or horizon")
        if type(self.cash) is not int or not 0 <= self.cash <= 1_000_000:
            raise ValueError("Invalid starting cash")
        if type(self.crew_slots) is not int or not 1 <= self.crew_slots <= 5 or (
                type(self.supplier_slots) is not int or
                not 1 <= self.supplier_slots <= 4):
            raise ValueError("Invalid shared capacity")
        ids = [job.job_id for job in self.jobs]
        if not 2 <= len(ids) <= 8 or len(set(ids)) != len(ids):
            raise ValueError("Need distinct competing projects")
        if any(job.deadline >= self.horizon for job in self.jobs):
            raise ValueError("Job deadline outside scenario")
        if len(self.changes) > 10 or len(self.faults) > 12:
            raise ValueError("Too many state changes or tool faults")
        for row in self.changes:
            if (row.job_id not in ids or not 0 < row.tick < self.horizon or
                    not 1 <= row.new_priority <= 5 or not 0 <= row.extra_shifts <= 8):
                raise ValueError("Invalid owner priority or scope change")
        if len(set((row.tick, row.job_id) for row in self.changes)) != len(self.changes):
            raise ValueError("Duplicate owner change")
        for row in self.faults:
            if (row.job_id not in ids or row.tool not in WRITE_TOOLS or
                    row.mode not in ("before_commit", "after_commit", "denied") or
                    not 0 <= row.tick < self.horizon):
                raise ValueError("Invalid synthetic commit fault")
        if len(set((r.tick, r.job_id, r.tool) for r in self.faults)) != len(self.faults):
            raise ValueError("Ambiguous fault injection")

    def fingerprint(self):
        return sha256(json.dumps(asdict(self), sort_keys=True,
                                 separators=(",", ":")).encode()).hexdigest()


class PortfolioWorld:
    """Strict mock tool API; no external apps, financial actions or secrets."""

    def __init__(self, case: PortfolioCase):
        self._case = case
        self.tick = 0
        self.cash = case.cash
        self.work = {j.job_id: 0 for j in case.jobs}
        self.required = {j.job_id: j.shifts for j in case.jobs}
        self.priority = {j.job_id: j.priority for j in case.jobs}
        self.delivery = {}
        self.material_ready = set()
        self.verified = {}
        self.payment_due = {}
        self.paid = set()
        self._ops = {}
        self.crew_used = 0
        self.supplier_used = 0
        self.actions_this_tick = 0
        self._prepared = -1
        self.events = []
        self.invalid_or_denied = 0
        self.tool_failures = 0
        self.unknown_commits = 0
        self.duplicate_prevented = 0
        self.unused_crew_slots = 0

    def _advance(self):
        self.unused_crew_slots += max(0, self._case.crew_slots - self.crew_used)
        self.tick += 1
        self.crew_used = 0
        self.supplier_used = 0
        self.actions_this_tick = 0

    def prepare(self):
        if self._prepared == self.tick:
            return
        self._prepared = self.tick
        for row in self._case.changes:
            if row.tick == self.tick:
                self.required[row.job_id] += row.extra_shifts
                self.priority[row.job_id] = row.new_priority
                if row.extra_shifts and row.job_id in self.verified:
                    del self.verified[row.job_id]
        for job_id, due in list(self.delivery.items()):
            if self.tick >= due:
                self.material_ready.add(job_id)
                del self.delivery[job_id]
        for job_id, due in list(self.payment_due.items()):
            if self.tick >= due:
                if job_id not in self.paid:
                    self.cash += self._job(job_id).payment
                    self.paid.add(job_id)
                del self.payment_due[job_id]

    def _job(self, name):
        return next(j for j in self._case.jobs if j.job_id == name)

    def public_view(self):
        self.prepare()
        available = []
        for job in self._case.jobs:
            if job.arrival > self.tick:
                continue
            name = job.job_id
            status = ("ready" if name in self.material_ready else
                      "in_transit" if name in self.delivery else
                      "unplaced")
            available.append({
                "job_id": name, "deadline": job.deadline,
                "material_cost": job.material_cost,
                "labor_cost": job.labor_cost,
                "work_done": self.work[name], "work_required": self.required[name],
                "payment": job.payment, "payment_delay": job.payment_delay,
                "supplier_delay": job.supplier_delay,
                "priority": self.priority[name], "order_limit": job.order_limit,
                "crew_approved": job.crew_approved, "materials": status,
                "verified": name in self.verified, "paid": name in self.paid,
                "payment_pending": name in self.payment_due,
            })
        return {
            "schema": "GenesisPortfolioPublicView/2.1", "fictional": True,
            "case_reference": sha256(self._case.case_id.encode()).hexdigest()[:16],
            "tick": self.tick, "cash": self.cash,
            "crew_available": self._case.crew_slots - self.crew_used,
            "supplier_slots_available": self._case.supplier_slots - self.supplier_used,
            "max_actions_left": 5 - self.actions_this_tick,
            "jobs": available,
        }

    def _action(self, tool, name, key):
        if tool == "wait":
            return {"ok": True, "status": "advanced"}
        if tool == "inspect_operation":
            old = self._ops.get(key)
            return {"ok": True, "status": "committed" if old else "not_found",
                    "operation": old["tool"] if old else None, "key": key}
        job = self._job(name)
        if job.arrival > self.tick:
            return {"ok": False, "status": "not_arrived"}
        if tool == "verify_job":
            if self.work[name] < self.required[name]:
                return {"ok": False, "status": "unfinished"}
            if name in self.verified:
                return {"ok": True, "status": "already_verified"}
            self.verified[name] = self.tick
            if name not in self.paid and name not in self.payment_due:
                self.payment_due[name] = self.tick + job.payment_delay + 1
            return {"ok": True, "status": "verified"}
        if key in self._ops:
            self.duplicate_prevented += 1
            old = self._ops[key]
            if old["tool"] != tool or old["job_id"] != name:
                self.invalid_or_denied += 1
                return {"ok": False, "status": "key_conflict"}
            return {"ok": True, "status": "already_committed", "key": key}
        if tool == "order_materials":
            if job.material_cost > job.order_limit:
                self.invalid_or_denied += 1
                return {"ok": False, "status": "approval_denied"}
            if self.supplier_used >= self._case.supplier_slots:
                return {"ok": False, "status": "supplier_capacity"}
            if name in self.material_ready or name in self.delivery:
                return {"ok": False, "status": "already_ordered"}
            if self.cash < job.material_cost:
                return {"ok": False, "status": "insufficient_cash"}
            self.cash -= job.material_cost
            self.delivery[name] = self.tick + job.supplier_delay + 1
            self.supplier_used += 1
        elif tool == "schedule_crew":
            if not job.crew_approved:
                self.invalid_or_denied += 1
                return {"ok": False, "status": "approval_denied"}
            if self.crew_used >= self._case.crew_slots:
                return {"ok": False, "status": "crew_capacity"}
            if name not in self.material_ready or self.work[name] >= self.required[name]:
                return {"ok": False, "status": "work_not_ready"}
            if self.cash < job.labor_cost:
                return {"ok": False, "status": "insufficient_cash"}
            self.cash -= job.labor_cost
            self.work[name] += 1
            self.crew_used += 1
        self._ops[key] = {"tool": tool, "job_id": name, "tick": self.tick}
        return {"ok": True, "status": "committed", "key": key}

    def step(self, action):
        if self.tick >= self._case.horizon:
            raise RuntimeError("Fictional portfolio horizon exhausted")
        self.prepare()
        before = self.public_view()
        valid = (isinstance(action, dict) and set(action) ==
                 {"tool", "job_id", "key"} and
                 action.get("tool") in TOOLS and
                 isinstance(action.get("job_id"), str) and
                 isinstance(action.get("key"), str) and
                 (not action["key"] or _KEY.fullmatch(action["key"])) and
                 (action["tool"] not in WRITE_TOOLS | {"inspect_operation"} or
                  bool(action["key"])) and
                 (action["tool"] in WRITE_TOOLS | {"verify_job"} or
                  action["job_id"] == "") and
                 (action["tool"] != "wait" or action["key"] == ""))
        if not valid:
            self.invalid_or_denied += 1
            tool, name, key = "invalid_call", "", ""
            response = {"ok": False, "status": "invalid_tool_call"}
        else:
            tool, name, key = action["tool"], action["job_id"], action["key"]
            if name and name not in self.work:
                self.invalid_or_denied += 1
                response = {"ok": False, "status": "unknown_job"}
            else:
                fault = next((f for f in self._case.faults if
                             f.tick == self.tick and f.tool == tool and
                             f.job_id == name), None)
                if fault and fault.mode in ("before_commit", "denied"):
                    self.tool_failures += 1
                    if fault.mode == "denied":
                        self.invalid_or_denied += 1
                    else:
                        self.unknown_commits += 1
                    response = {"ok": False, "status": (
                        "timeout_unknown_commit" if fault.mode == "before_commit"
                        else "permission_denied")}
                else:
                    response = self._action(tool, name, key)
                    if fault and fault.mode == "after_commit" and response["ok"]:
                        self.tool_failures += 1
                        self.unknown_commits += 1
                        response = {"ok": False, "status": "timeout_unknown_commit"}
        event = {"tick": self.tick, "public_before": before,
                 "tool": {"tool": tool, "job_id": name, "key": key},
                 "result": response}
        self.events.append(event)
        if tool == "wait" or self.actions_this_tick >= 4:
            self._advance()
        else:
            self.actions_this_tick += 1
        return event

    def judge_state(self):
        """Independent scorer only. Never pass this to an agent."""
        return {
            "case_id": self._case.case_id,
            "case_hash": self._case.fingerprint(),
            "suite": self._case.suite,
            "initial_cash": self._case.cash,
            "cash": self.cash,
            "work": dict(self.work),
            "required": dict(self.required),
            "priorities": dict(self.priority),
            "verified": dict(self.verified),
            "paid": sorted(self.paid),
            "pending_payments": dict(self.payment_due),
            "invalid_or_denied": self.invalid_or_denied,
            "tool_failures": self.tool_failures,
            "unknown_commits": self.unknown_commits,
            "duplicate_prevented": self.duplicate_prevented,
            "unused_crew_slots": self.unused_crew_slots,
            "operations": {k: dict(v) for k, v in sorted(self._ops.items())},
            "trace_digest": sha256(json.dumps(
                self.events, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        }
