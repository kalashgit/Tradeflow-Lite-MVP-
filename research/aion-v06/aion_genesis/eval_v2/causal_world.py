"""Fictional causal business world: source truth, handoffs, economics and receipts.

Unlike the v2.2 scripted event-network factory, these events are consequences
of accepted mock actions and external business shocks. The policy sees only its
role-scoped, delivered messages and own receipts, not future shocks or judge
state. No production tools, customer records, real permissions or LLM grading.
"""

from dataclasses import dataclass, asdict
from hashlib import sha256
import json
import random
import re

SCHEMA = "GenesisCausalWorld/2.3"
FAMILIES = ("supplier_shock", "field_blocker", "scope_approval",
            "invoice_dispute", "working_capital", "compound")
SPLITS = {"dev": 830000, "validation": 930000}
WRITES = {"order_material", "assign_crew", "escalate_blocker",
          "request_change_approval", "request_invoice", "resolve_invoice_dispute"}
TOOLS = WRITES | {"verify_operation", "wait"}
ROLES = {"owner", "office", "project_manager", "foreman", "supplier",
         "customer", "finance"}
_KEY = re.compile(r"^[A-Za-z0-9_.:-]{1,72}$")


def digest(x):
    return sha256(json.dumps(x, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


@dataclass(frozen=True)
class Job:
    name: str
    material_cost: int
    crew_cost: int
    shifts: int
    payment: int
    deadline: int
    supplier_delay: int
    payment_delay: int
    priority: int
    order_limit: int

    def __post_init__(self):
        if not re.fullmatch(r"JOB-[A-Z0-9-]{1,40}", self.name):
            raise ValueError("Invalid fictional job identifier")
        for k in ("material_cost", "crew_cost", "shifts", "payment", "deadline",
                  "supplier_delay", "payment_delay", "priority", "order_limit"):
            if type(getattr(self, k)) is not int or not 0 <= getattr(self, k) <= 100000:
                raise ValueError("Invalid fictional job economics")
        if not 1 <= self.shifts <= 12 or not 1 <= self.priority <= 5:
            raise ValueError("Invalid job requirement/priority")


@dataclass(frozen=True)
class Shock:
    tick: int
    job_id: str
    kind: str
    magnitude: int

    def __post_init__(self):
        if self.kind not in ("supplier_delay", "field_blocker", "scope_change",
                             "invoice_dispute", "permission_revoke"):
            raise ValueError("Invalid synthetic causal shock")
        if type(self.tick) is not int or self.tick < 0 or (
                type(self.magnitude) is not int or not 1 <= self.magnitude <= 12):
            raise ValueError("Invalid shock magnitude or schedule")


@dataclass(frozen=True)
class Case:
    case_id: str
    split: str
    seed: int
    family: str
    difficulty: int
    novelty: int
    horizon: int
    initial_cash: int
    crew_slots: int
    message_lag: int
    jobs: tuple[Job, ...]
    shocks: tuple[Shock, ...]

    def __post_init__(self):
        if self.split not in SPLITS:
            raise PermissionError("Protected holdout must have separate custody")
        if self.family not in FAMILIES or not self.case_id.startswith("SYN-CAUSAL-"):
            raise ValueError("Invalid public synthetic case")
        if not 1 <= self.difficulty <= 5 or not 0 <= self.novelty <= 5:
            raise ValueError("Invalid challenge vector")
        if not 20 <= self.horizon <= 90 or not 1 <= self.crew_slots <= 3 or (
                not 0 <= self.message_lag <= 5 or not 0 <= self.initial_cash <= 20000):
            raise ValueError("Invalid world capacity/timescale")
        if not 2 <= len(self.jobs) <= 5 or len({
                job.name for job in self.jobs}) != len(self.jobs):
            raise ValueError("Invalid causal project roster")
        ids = {job.name for job in self.jobs}
        if any(s.job_id not in ids or s.tick >= self.horizon for s in self.shocks):
            raise ValueError("Invalid shock job or horizon")

    def fingerprint(self):
        return digest(asdict(self))


def generate(split: str, index: int, *, family: str | None = None,
             difficulty: int = 2, novelty: int = 0, seed_override: int | None = None):
    if split not in SPLITS:
        raise PermissionError("Cannot generate protected holdout in development")
    if type(index) is not int or not 0 <= index <= 100000:
        raise ValueError("Invalid public dev case index")
    if family is None:
        family = FAMILIES[index % len(FAMILIES)]
    if family not in FAMILIES or not 1 <= difficulty <= 5 or not 0 <= novelty <= 5:
        raise ValueError("Unknown predeclared scenario vector")
    if seed_override is not None and (
            type(seed_override) is not int or not 0 <= seed_override <= 2000000000):
        raise ValueError("Invalid paired case seed")
    seed = (SPLITS[split] + index if seed_override is None else seed_override)
    rng = random.Random(seed)
    count = 2 + ((index + novelty) % 3)
    jobs = []
    for i in range(count):
        material = 80 + rng.randrange(140) + difficulty * 12
        crew = 30 + rng.randrange(45) + difficulty * 5
        shifts = 1 + rng.randrange(2 + (difficulty > 3))
        pay = material + shifts * crew + 125 + rng.randrange(170)
        jobs.append(Job(f"JOB-{seed}-{i+1}", material, crew, shifts,
                        pay, 11 + i * 5 + difficulty, rng.randrange(1, 3),
                        1 + rng.randrange(3) + (difficulty // 3),
                        1 + rng.randrange(5), material + 10))
    # Explicit trade-offs: enough cash for some work, not necessarily all.
    cash = max(170, int(sum(j.material_cost + j.crew_cost * j.shifts
                            for j in jobs) * (0.56 + 0.07 * novelty
                                              - 0.035 * difficulty)))
    focus = jobs[0]
    shocks = []
    if family in ("supplier_shock", "compound"):
        shocks.append(Shock(2, focus.name, "supplier_delay", 2 + difficulty))
    if family in ("field_blocker", "compound"):
        shocks.append(Shock(5, focus.name, "field_blocker", 1 + difficulty))
    if family in ("scope_approval", "compound"):
        shocks.append(Shock(6, focus.name, "scope_change", 1 + difficulty // 2))
    if family in ("invoice_dispute", "compound"):
        shocks.append(Shock(10, focus.name, "invoice_dispute", 1 + difficulty))
    if novelty >= 3 and family not in ("working_capital", "compound"):
        shocks.append(Shock(7, jobs[-1].name, "permission_revoke", 1))
    return Case(f"SYN-CAUSAL-{split.upper()}-{seed}-{family.upper()}-{difficulty}-{novelty}",
                split, seed, family, difficulty, novelty, 30 + count * 7 + difficulty * 2,
                cash, 1 if difficulty > 2 else 2, min(5, difficulty // 2),
                tuple(jobs), tuple(shocks))


class World:
    """All economic consequences and source truth live on the simulator side."""

    def __init__(self, case: Case):
        self._c = case
        self.tick = 0
        self.cash = case.initial_cash
        self.jobs = {j.name: {
            "material": "unplaced", "delivery_due": None, "work_done": 0,
            "required": j.shifts, "blocked": False, "blocker_due": None,
            "scope_pending": False, "approval_due": None,
            "approved": False, "revoked": False,
            "invoice": "none", "invoice_due": None, "payment_due": None,
            "paid": False, "disputed": False, "dispute_due": None,
        } for j in case.jobs}
        self._job_specs = {j.name: j for j in case.jobs}
        self._operations = {}
        self._events = []
        self._messages = []
        self._revisions = {}
        self._prepared = -1
        self.denials = 0
        self.unknown = 0
        self.duplicate_preventions = 0
        self.idle_crew = 0
        self._crew_used = 0
        self._sequence = 0
        self._extra_delivery_delay = {j.name: 0 for j in case.jobs}

    def _publish(self, role, recipients, job_id, stream, status, *, amount=0,
                 lag=None, origin="state_transition"):
        key = (job_id, stream)
        rev = self._revisions.get(key, 0) + 1
        self._revisions[key] = rev
        self._sequence += 1
        event = {"source_ref": f"SYN-RECEIPT-{self._sequence:05d}",
                 "job_id": job_id, "stream": stream, "status": status,
                 "actor": role, "revision": rev, "tick": self.tick,
                 "amount": amount, "origin": origin}
        self._events.append(event)
        for receiver in sorted(set((*recipients, role))):
            if receiver not in ROLES:
                raise ValueError("Unrecognized recipient")
            self._messages.append({
                "receiver": receiver, "event_id": event["source_ref"],
                "delivered": self.tick + (self._c.message_lag if lag is None else lag),
            })
        return event

    def _receive_latest(self, role):
        events = {e["source_ref"]: e for e in self._events}
        latest = {}
        for item in self._messages:
            if item["receiver"] != role or item["delivered"] > self.tick:
                continue
            event = events[item["event_id"]]
            key = (event["job_id"], event["stream"])
            if key not in latest or latest[key]["revision"] < event["revision"]:
                latest[key] = event
        return [dict(event) for event in sorted(
            latest.values(), key=lambda e: (e["job_id"], e["stream"]))]

    def _refresh(self):
        if self.tick == self._prepared:
            return
        self._prepared = self.tick
        for shock in self._c.shocks:
            if shock.tick != self.tick:
                continue
            s = self.jobs[shock.job_id]
            if shock.kind == "supplier_delay":
                self._extra_delivery_delay[shock.job_id] += shock.magnitude
                if s["delivery_due"] is not None:
                    s["delivery_due"] += shock.magnitude
                self._publish("supplier", ("project_manager",), shock.job_id,
                              "materials", "delivery_delayed")
            if shock.kind == "field_blocker":
                s["blocked"] = True
                self._publish("foreman", ("project_manager",), shock.job_id,
                              "blocker", "active")
            if shock.kind == "scope_change":
                s["scope_pending"] = True
                self._publish("foreman", ("project_manager", "owner"),
                              shock.job_id, "change", "approval_required",
                              amount=shock.magnitude)
            if shock.kind == "invoice_dispute":
                s["disputed"] = True
                if s["payment_due"] is not None:
                    s["payment_due"] += shock.magnitude
                self._publish("customer", ("finance", "project_manager"),
                              shock.job_id, "invoice", "disputed")
            if shock.kind == "permission_revoke":
                s["revoked"] = True
                self._publish("owner", ("project_manager",),
                              shock.job_id, "authority", "revoked")
        for name, s in self.jobs.items():
            if s["delivery_due"] is not None and self.tick >= s["delivery_due"]:
                s["delivery_due"] = None
                s["material"] = "ready"
                self._publish("supplier", ("foreman", "project_manager"),
                              name, "materials", "delivered")
            if s["blocker_due"] is not None and self.tick >= s["blocker_due"]:
                s["blocked"] = False
                s["blocker_due"] = None
                self._publish("foreman", ("project_manager",), name, "blocker", "resolved")
            if s["approval_due"] is not None and self.tick >= s["approval_due"]:
                s["approval_due"] = None
                if not s["revoked"]:
                    extra = next((shock.magnitude for shock in self._c.shocks
                                  if shock.kind == "scope_change" and
                                  shock.job_id == name), 0)
                    s["required"] += extra
                    s["approved"] = True
                    s["scope_pending"] = False
                    self._publish("owner", ("project_manager", "foreman"),
                                  name, "change", "approved", amount=extra)
                else:
                    self._publish("owner", ("project_manager",),
                                  name, "change", "denied")
            if s["invoice_due"] is not None and self.tick >= s["invoice_due"]:
                s["invoice_due"] = None
                s["invoice"] = "verified"
                j = self._job_specs[name]
                s["payment_due"] = self.tick + j.payment_delay + 1
                self._publish("finance", ("project_manager", "owner"),
                              name, "invoice", "verified", amount=j.payment)
            if s["payment_due"] is not None and self.tick >= s["payment_due"]:
                if not s["paid"] and not s["disputed"]:
                    s["paid"] = True
                    self.cash += self._job_specs[name].payment
                    self._publish("finance", ("owner", "project_manager"),
                                  name, "payment", "reconciled",
                                  amount=self._job_specs[name].payment)
                    s["payment_due"] = None
            if s["disputed"] and s["dispute_due"] is not None and (
                    self.tick >= s["dispute_due"]):
                s["disputed"] = False
                s["dispute_due"] = None
                self._publish("finance", ("project_manager",),
                              name, "invoice", "dispute_resolved")

    def public_view(self, role="project_manager", tenant=None):
        if tenant is not None and tenant != "SYN-TENANT-" + str(self._c.seed):
            raise PermissionError("Cross-tenant read denied")
        if role not in ROLES:
            raise PermissionError("Invalid stakeholder")
        self._refresh()
        if role != "project_manager":
            # Only route explicitly received, permitted facts to other
            # stakeholders; no global budget, command handles or source truth.
            return {"role": role, "tick": self.tick,
                    "messages": self._receive_latest(role),
                    "fictional": True, "global_truth": False}
        jobs = []
        messages = self._receive_latest(role)
        seen = {(e["job_id"], e["stream"]): e for e in messages}
        for j in self._c.jobs:
            s = self.jobs[j.name]
            delivery = seen.get((j.name, "materials"))
            blocker = seen.get((j.name, "blocker"))
            change = seen.get((j.name, "change"))
            authority = seen.get((j.name, "authority"))
            invoice = seen.get((j.name, "invoice"))
            # Past committed work and orders are own operation receipts.
            jobs.append({
                "job_id": j.name, "priority": j.priority,
                "deadline": j.deadline,
                "material_cost": j.material_cost,
                "crew_cost": j.crew_cost, "payment": j.payment,
                "order_limit": j.order_limit, "shifts_initial": j.shifts,
                "materials_seen": delivery["status"] if delivery else "unknown",
                "blocker_seen": blocker["status"] if blocker else "unknown",
                "change_seen": change["status"] if change else "unknown",
                "authority_seen": authority["status"] if authority else "unknown",
                "invoice_seen": invoice["status"] if invoice else "unknown",
                "work_receipted": s["work_done"],  # already committed own action
                "required_known": j.shifts + (
                    next((sh.magnitude for sh in self._c.shocks
                          if sh.job_id == j.name and sh.kind == "scope_change"), 0)
                    if change and change["status"] == "approved" else 0),
                "paid_receipted": bool(s["paid"] and
                                      (j.name, "payment") in seen),
            })
        return {
            "schema": "GenesisCausalRoleView/2.3", "role": role,
            "fictional": True, "global_truth": False,
            "tick": self.tick, "cash_budget": self.cash,
            "crew_slots": self._c.crew_slots, "jobs": jobs,
            "messages": messages,
        }

    def _commit(self, tool, name, key):
        s, job = self.jobs[name], self._job_specs[name]
        if key in self._operations:
            previous = self._operations[key]
            if previous["tool"] != tool or previous["job"] != name:
                self.denials += 1
                return {"status": "key_conflict", "ok": False}
            self.duplicate_preventions += 1
            return {"status": "already_committed", "ok": True}
        if s["revoked"]:
            self.denials += 1
            return {"status": "authority_revoked", "ok": False}
        if tool == "order_material":
            if job.material_cost > job.order_limit:
                self.denials += 1
                return {"status": "approval_denied", "ok": False}
            if s["material"] != "unplaced":
                return {"status": "already_ordered", "ok": False}
            if self.cash < job.material_cost:
                return {"status": "insufficient_cash", "ok": False}
            self.cash -= job.material_cost
            s["material"] = "in_transit"
            s["delivery_due"] = (self.tick + job.supplier_delay + 1 +
                                  self._extra_delivery_delay[name])
            self._publish("project_manager", ("supplier", "office"), name,
                          "purchase", "committed", amount=job.material_cost, lag=0)
        elif tool == "assign_crew":
            if self._crew_used >= self._c.crew_slots:
                return {"status": "crew_capacity", "ok": False}
            if s["material"] != "ready" or s["blocked"] or s["scope_pending"] or (
                    s["work_done"] >= s["required"]):
                return {"status": "work_unavailable", "ok": False}
            if self.cash < job.crew_cost:
                return {"status": "insufficient_cash", "ok": False}
            self.cash -= job.crew_cost
            self._crew_used += 1
            s["work_done"] += 1
            self._publish("foreman", ("project_manager",), name, "work",
                          "shift_verified", amount=job.crew_cost, lag=0)
        elif tool == "escalate_blocker":
            if not s["blocked"] or s["blocker_due"] is not None:
                return {"status": "no_active_blocker", "ok": False}
            delay = next(sh.magnitude for sh in self._c.shocks
                         if sh.job_id == name and sh.kind == "field_blocker")
            s["blocker_due"] = self.tick + delay + 1
            self._publish("project_manager", ("foreman",), name, "blocker",
                          "resolution_requested", lag=0)
        elif tool == "request_change_approval":
            if not s["scope_pending"] or s["approval_due"] is not None:
                return {"status": "no_pending_change", "ok": False}
            s["approval_due"] = self.tick + 2
            self._publish("project_manager", ("owner",), name, "change",
                          "approval_requested", lag=0)
        elif tool == "resolve_invoice_dispute":
            if not s["disputed"] or s["dispute_due"] is not None:
                return {"status": "no_active_dispute", "ok": False}
            s["dispute_due"] = self.tick + 2
            self._publish("project_manager", ("finance", "customer"), name,
                          "invoice", "dispute_review_requested", lag=0)
        elif tool == "request_invoice":
            if (s["material"] != "ready" or s["blocked"] or s["scope_pending"] or
                    s["work_done"] < s["required"] or s["invoice"] != "none"):
                return {"status": "invoice_not_ready", "ok": False}
            s["invoice"] = "pending"
            s["invoice_due"] = self.tick + 2
            self._publish("project_manager", ("finance",), name, "invoice",
                          "review_requested", lag=0)
        self._operations[key] = {"tool": tool, "job": name, "tick": self.tick}
        return {"status": "committed", "ok": True, "operation_key": key}

    def step(self, raw):
        if self.tick >= self._c.horizon:
            raise RuntimeError("Episode ended")
        self._refresh()
        before = self.public_view()
        valid = (isinstance(raw, dict) and set(raw) == {"tool", "job_id", "key"}
                 and raw.get("tool") in TOOLS and isinstance(raw.get("job_id"), str)
                 and isinstance(raw.get("key"), str) and
                 (not raw["key"] or _KEY.fullmatch(raw["key"])) and
                 (raw["tool"] not in WRITES | {"verify_operation"} or raw["key"]) and
                 (raw["tool"] not in WRITES or raw["job_id"] in self.jobs) and
                 (raw["tool"] in WRITES or raw["job_id"] == "") and
                 (raw["tool"] != "wait" or raw["key"] == ""))
        if not valid:
            self.denials += 1
            tool, name, key = "invalid", "", ""
            response = {"status": "invalid_tool_call", "ok": False}
        else:
            tool, name, key = raw["tool"], raw["job_id"], raw["key"]
            if tool == "wait":
                response = {"status": "waited", "ok": True}
            elif tool == "verify_operation":
                op = self._operations.get(key)
                response = {"status": "committed" if op else "not_found",
                            "ok": True, "operation": op["tool"] if op else None}
            else:
                response = self._commit(tool, name, key)
        event = {"tick": self.tick, "view": before,
                 "action": {"tool": tool, "job_id": name, "key": key},
                 "result": response}
        self.idle_crew += max(0, self._c.crew_slots - self._crew_used)
        self._crew_used = 0
        self._events.append({"source_ref": "SYN-TURN-" + str(self.tick),
                             "tick": self.tick, "tool": tool,
                             "job_id": name, "status": response["status"],
                             "revision": 0, "stream": "tool_turn",
                             "amount": 0, "actor": "project_manager",
                             "origin": "mock_action"})
        self.tick += 1
        return event

    def final_truth(self):
        """Independent evaluator ONLY, never fed back to a candidate policy."""
        jobs = {}
        for name, s in self.jobs.items():
            jobs[name] = {k: v for k, v in s.items()}
        return {
            "case_id": self._c.case_id, "split": self._c.split,
            "case_hash": self._c.fingerprint(),
            "initial_cash": self._c.initial_cash, "ending_cash": self.cash,
            "jobs": jobs, "denials": self.denials,
            "unknown_commit_events": self.unknown,
            "duplicate_preventions": self.duplicate_preventions,
            "idle_crew": self.idle_crew,
            "operations": dict(self._operations),
            "event_digest": digest(self._events),
            "messages_digest": digest(self._messages),
        }
