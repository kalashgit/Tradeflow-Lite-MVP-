"""Deterministic mock-only multiweek contractor workflow tool environment.

Agent receives PUBLIC_VIEW and tool responses; never Scenario or simulator state.
The grader sees finalized state afterward. All approval tokens are fictional and
pre-authorized by the scenario fixture, never actual business permissions.
"""

from dataclasses import dataclass
from hashlib import sha256
import json
import re

from .scenarios import ALLOWED_TOOLS, Scenario

WRITE_TOOLS = frozenset(("place_order", "assign_crew"))
_KEY = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")


def _digest(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _reply(**kwargs):
    return kwargs


@dataclass(frozen=True)
class Action:
    tool: str
    key: str = ""

    @classmethod
    def parse(cls, raw):
        if not isinstance(raw, dict) or set(raw) != {"tool", "key"}:
            raise ValueError("Malformed mock tool call")
        tool, key = raw["tool"], raw["key"]
        if tool not in ALLOWED_TOOLS or not isinstance(key, str) or (
                key and _KEY.fullmatch(key) is None):
            raise ValueError("Unrecognized mock tool or unsafe key")
        if tool in WRITE_TOOLS and not key:
            raise ValueError("Writes require a stable idempotency key")
        if tool == "verify_operation" and not key:
            raise ValueError("Verification requires an operation reference")
        if tool not in WRITE_TOOLS and tool != "verify_operation" and key:
            raise ValueError("Read-only calls must not carry write references")
        return cls(tool, key)


class MockContractorWorld:
    """Only this class sees hidden injection schedule and final truth."""

    def __init__(self, scenario: Scenario):
        self._case = scenario
        self.tick = 0
        self.cash = scenario.initial_cash
        self.stock = False
        self.supplier_checked = False
        self.supplier_seen_available = None
        self.supplier_revision = 0
        self.work_required = scenario.work_required
        self.work_completed = 0
        self.completed_at = None
        self.verified_at = None
        self._paid_once = False
        self._prepared_tick = None
        self.pending_delivery = None
        self._ops = {}
        self.audit = []
        self.denied_attempts = 0
        self.unknown_commit_errors = 0
        self.tool_errors = 0
        self.duplicate_write_preventions = 0

    def _events(self):
        if self._prepared_tick == self.tick:
            return
        self._prepared_tick = self.tick
        c = self._case
        if c.change_tick == self.tick and c.extra_work:
            self.work_required += c.extra_work
            # Scope changes are modeled *before* the first verified completion.
            # If the case is already complete, reopen and require fresh verification,
            # while never rolling back money from a previously settled contract.
            if self.completed_at is not None:
                self.completed_at = None
                self.verified_at = None
        if self.pending_delivery is not None and self.tick >= self.pending_delivery:
            self.stock = True
            self.pending_delivery = None

    def prepare_tick(self):
        self._events()

    def public_view(self):
        c = self._case
        return {
            "schema": "GenesisMockContractorPublicView/1.0",
            "fictional": True, "case_ref": "SYN-JOB-" + _digest(c.scenario_id)[:12],
            "tick": self.tick, "week": self.tick // 3 + 1,
            "cash": self.cash, "material_cost": c.material_cost,
            "labor_cost": c.labor_cost,
            "approved_order_limit": c.approval_order_limit,
            "crew_authorized": c.crew_authorized,
            "supplier_checked": self.supplier_checked,
            "supplier_available": self.supplier_seen_available,
            "supplier_revision": self.supplier_revision,
            "material_ready": self.stock,
            "work_completed": self.work_completed,
            "work_required": self.work_required,
            "deadline_tick": c.deadline_tick,
            "job_payment": c.job_payment,
            "completed": self.completed_at is not None,
            "verified": self.verified_at is not None,
            # No hidden fault schedule, hidden world state, oracle or future truth.
        }

    def _commit(self, action):
        c = self._case
        tool, key = action.tool, action.key
        if tool == "noop":
            return _reply(ok=True, status="no_action")
        if tool == "inspect_supplier":
            self.supplier_checked = True
            self.supplier_seen_available = c.supplier_stock
            self.supplier_revision += 1
            return _reply(ok=True, status="read", available=c.supplier_stock,
                          revision=self.supplier_revision)
        if tool == "verify_operation":
            record = self._ops.get(key)
            return _reply(ok=True, status="committed" if record else "not_found",
                          key=key, operation=record["tool"] if record else None)
        if tool == "verify_job":
            if self.completed_at is None:
                return _reply(ok=False, status="not_ready")
            self.verified_at = self.tick
            return _reply(ok=True, status="verified",
                          completed_at=self.completed_at)
        if key in self._ops:
            self.duplicate_write_preventions += 1
            return _reply(ok=True, status="already_committed", key=key,
                          operation=self._ops[key]["tool"])
        if tool == "place_order":
            if c.material_cost > c.approval_order_limit:
                self.denied_attempts += 1
                return _reply(ok=False, status="approval_denied")
            if self.cash < c.material_cost:
                return _reply(ok=False, status="insufficient_cash")
            if not c.supplier_stock:
                return _reply(ok=False, status="supplier_unavailable")
            # Do not allow two different keys to purchase the same material lot.
            if self.pending_delivery is not None or self.stock:
                return _reply(ok=False, status="order_already_exists")
            self.cash -= c.material_cost
            self.pending_delivery = self.tick + c.supplier_delay + 1
            self._ops[key] = {"tool": tool, "at": self.tick}
            return _reply(ok=True, status="committed", key=key)
        if tool == "assign_crew":
            if not c.crew_authorized:
                self.denied_attempts += 1
                return _reply(ok=False, status="approval_denied")
            if not self.stock or self.work_completed >= self.work_required:
                return _reply(ok=False, status="work_not_ready")
            if self.cash < c.labor_cost:
                return _reply(ok=False, status="insufficient_cash")
            self.cash -= c.labor_cost
            self.work_completed += 1
            self._ops[key] = {"tool": tool, "at": self.tick}
            if self.work_completed == self.work_required:
                if not self._paid_once:
                    self.cash += c.job_payment
                    self._paid_once = True
                self.completed_at = self.tick
            return _reply(ok=True, status="committed", key=key,
                          work_completed=self.work_completed)
        raise AssertionError("Unreachable tool path")

    def step(self, raw_action):
        if self.tick >= self._case.horizon:
            raise RuntimeError("Synthetic scenario horizon exhausted")
        self._events()
        before = self.public_view()
        try:
            action = Action.parse(raw_action)
        except ValueError:
            self.tool_errors += 1
            self.denied_attempts += 1
            result = _reply(ok=False, status="invalid_tool_call")
            action = Action("noop")
        else:
            fault = next((f for f in self._case.faults
                          if f.tick == self.tick and f.tool == action.tool), None)
            if fault and fault.mode in ("before_commit", "denied"):
                self.tool_errors += 1
                if fault.mode == "denied":
                    self.denied_attempts += 1
                result = _reply(ok=False, status=(
                    "timeout_unknown_commit" if fault.mode == "before_commit"
                    else "permission_denied"))
                if fault.mode == "before_commit":
                    self.unknown_commit_errors += 1
            elif fault and fault.mode == "stale_read":
                result = _reply(ok=True, status="read", available=False,
                                revision=max(0, self.supplier_revision - 1),
                                stale=True)
            else:
                committed = self._commit(action)
                if fault and fault.mode == "after_commit" and committed["ok"]:
                    self.unknown_commit_errors += 1
                    self.tool_errors += 1
                    result = _reply(ok=False, status="timeout_unknown_commit")
                else:
                    result = committed
        event = {"type": "tool_turn", "tick": self.tick, "before": before,
                 "tool": {"tool": action.tool, "key": action.key},
                 "result": result}
        self.audit.append(event)
        self.tick += 1
        return event

    def public_final(self):
        # Exposes only final public state, not the hidden schedule or evaluator.
        return self.public_view()

    def judge_state(self):
        """Independent evaluator receives this *after* episode termination."""
        c = self._case
        return {
            "case_id": c.scenario_id, "family": c.family, "suite": c.suite,
            "seed": c.seed, "scenario_hash": c.fingerprint(),
            "initial_cash": c.initial_cash, "ending_cash": self.cash,
            "approval_denials_or_invalids": self.denied_attempts,
            "tool_errors": self.tool_errors,
            "unknown_commit_errors": self.unknown_commit_errors,
            "idempotency_collisions_prevented": self.duplicate_write_preventions,
            "operations": {k: dict(v) for k, v in sorted(self._ops.items())},
            "completed_at": self.completed_at, "verified_at": self.verified_at,
            "completed_work": self.work_completed, "required_work": self.work_required,
            "deadline": c.deadline_tick, "payment": c.job_payment,
            "material_cost": c.material_cost, "labor_cost": c.labor_cost,
            "approved_order_limit": c.approval_order_limit,
            "crew_authorized": c.crew_authorized,
            "work_feasible_at_start": (
                c.supplier_stock and c.crew_authorized
                and c.material_cost <= c.approval_order_limit
                and c.initial_cash >= c.material_cost +
                c.labor_cost * (c.work_required + c.extra_work)),
            "trace_digest": _digest(self.audit),
        }
