"""ASIL research adapter for the v2.3/v2.4 synthetic causal business world.

Opt-in candidate behind the same review-only contracts as the v2.4 bridge:
the real ``AionRuntime`` validates every option and issues a
``pending_human_review`` proposal; ASIL only chooses *among those validated
options*, and the only executor is the fictional ``World``. The policy sees
the project-manager public view and its own receipts, nothing else.

Domain pieces live here (context features, a public process model and the
bounded forward simulator). The reusable intelligence is ``aion_genesis.asil``.
"""

from dataclasses import dataclass, field
from itertools import permutations
from time import perf_counter

from ..asil.core import (
    ABSTAIN, DEEP, FAST, REFLEX, AdaptiveStrategyLearner, CausalOutcomeVerifier,
    IntuitionMemory, MetacognitiveRouter, Option, RouterConfig,
    StrategicContextRecognizer,
)
from ..runtime import (
    PENDING_HUMAN_REVIEW, AionRuntime, CaseBuild, DecisionRequestV1, GoalProfileV1,
    ObservationV1, RuntimeStore,
)
from ..strategic_planner import Axis, Choice
from .genesis_policy import ACTIONS, FALLBACK, OBJECTIVES, STATUSES, LabFacts, _id

DOMAIN = "synthetic_causal_business_v25_asil"
OWN = ("ordered", "invoice_requested")
METRICS = (
    "priority", "deadline", "material_cost", "crew_cost", "payment", "order_limit",
    "work_receipted", "required_known", "materials_seen", "blocker_seen",
    "change_seen", "invoice_seen", "authority_seen", "paid_receipted", *OWN,
)
MODES = ("adaptive", "fast_only", "deep_only", "memory_off", "planner_only")
CORE_FEATURES = ("stage", "funding", "phase")
_PRIORITY = {"request_invoice": 7.0, "resolve_invoice_dispute": 6.0,
             "request_change_approval": 5.0, "escalate_blocker": 5.0,
             "assign_crew": 4.0, "order_material": 2.0}


class AsilStrategyDomain:
    """Admissible options from observed state and the policy's own receipts.

    Repairs two blind spots of the v2.4 pack, which could never order after a
    supplier-delay notice nor invoice after a resolved dispute. Estimates are
    the v2.4 heuristics; ASIL does not rely on them.
    """

    name = DOMAIN

    def __init__(self, job_ids):
        self.axes = (Axis("job", ("NONE", *tuple(job_ids))), Axis("action", ACTIONS))
        self.baseline_decisions = (("job", "NONE"), ("action", "wait"))

    def assess(self, facts: LabFacts, decisions):
        picked = dict(decisions)
        job_id, action = picked["job"], picked["action"]
        if action == "wait":
            if job_id != "NONE":
                return None
            return Choice("ACT:WAIT", decisions, {k: 0.0 for k in OBJECTIVES},
                          {k: 0.0 for k in OBJECTIVES}, 0,
                          tuple(facts.citations["company"]),
                          "Wait without business effects",
                          "Future messages may be delayed.")
        if job_id not in facts.jobs:
            return None
        j = facts.jobs[job_id]
        mat, block, change, invoice = (j["materials_seen"], j["blocker_seen"],
                                       j["change_seen"], j["invoice_seen"])
        if j["authority_seen"] == STATUSES["revoked"] or j["paid_receipted"]:
            return None
        workable = mat == 2 and block not in (1, 2) and change not in (1, 2)
        spent, progress, collection = 0, 0.0, 0.0
        if action == "order_material":
            if (j["ordered"] or mat == 2 or facts.cash < j["material_cost"]
                    or j["material_cost"] > j["order_limit"]):
                return None
            spent, progress = j["material_cost"], 1.4
        elif action == "assign_crew":
            if (not workable or j["work_receipted"] >= j["required_known"]
                    or facts.cash < j["crew_cost"]):
                return None
            spent, progress = j["crew_cost"], 2.4
        elif action == "escalate_blocker":
            if block != 1:
                return None
            progress = 2.7
        elif action == "request_change_approval":
            if change != 1:
                return None
            progress = 2.6
        elif action == "request_invoice":
            if (not workable or j["work_receipted"] < j["required_known"]
                    or j["invoice_requested"] or invoice == 1):
                return None
            progress, collection = 1.9, 4.0
        elif action == "resolve_invoice_dispute":
            if invoice != 2:
                return None
            progress, collection = 1.6, 3.7
        else:
            return None
        return Choice(
            "ACT:" + action.upper() + ":" + job_id, decisions,
            {"progress": round(progress * (1.0 + 0.05 * j["priority"]), 4),
             "liquidity": round(-spent / 100.0, 4), "collection": collection},
            {"progress": 0.4, "liquidity": 0.1, "collection": 0.6 if collection else 0.0},
            spent, tuple(sorted({*facts.citations["company"], *facts.citations[job_id]})),
            "Bounded review-only simulation option grounded in observed state",
            "Estimates omit unknown shocks and delayed external effects.")


class AsilDomainAdapter:
    domain_id = DOMAIN
    version = "2.5.0-asil"
    objectives = OBJECTIVES
    default_freshness_ticks = 1
    freshness_ticks: dict = {}

    def __init__(self, job_ids):
        self.job_ids = tuple(job_ids)
        if not 2 <= len(self.job_ids) <= 5 or len(set(self.job_ids)) != len(self.job_ids):
            raise ValueError("Invalid public job roster")
        self.decision_domain = AsilStrategyDomain(self.job_ids)

    def build_case(self, observations, tenant_id, scope_id):
        rows = {(o.subject_id, o.metric): o for o in observations}
        company, current = rows.get(("COMPANY", "cash_budget")), rows.get(("COMPANY", "tick"))
        if company is None or current is None:
            return CaseBuild(None, missing=("cash_budget", "tick"))
        jobs, citations = {}, {"company": [company.event_id, current.event_id]}
        for job_id in self.job_ids:
            present = {metric: rows.get((job_id, metric)) for metric in METRICS}
            if any(value is None for value in present.values()):
                return CaseBuild(None, missing=(job_id + ":observed_metrics",))
            jobs[job_id] = {name: record.value for name, record in present.items()}
            citations[job_id] = [record.event_id for record in present.values()]
        return CaseBuild(LabFacts(cash=int(company.value), tick=int(current.value),
                                  jobs=jobs, citations=citations))

    def fixed_rule(self, facts):
        return self.decision_domain.baseline_decisions


@dataclass
class TransitionModel:
    """Public process timings: declared priors, revised from verified receipts.

    A belief about lags, never simulator truth. ``horizon`` is the shortest
    episode length yet observed for a portfolio size (a conservative estimate).
    """

    priors: dict = field(default_factory=lambda: {
        "delivery": 3.0, "blocker": 4.0, "approval": 3.0, "dispute": 3.0,
        "invoice": 3.0, "payment": 4.0})
    samples: dict = field(default_factory=dict)
    horizons: dict = field(default_factory=dict)
    frozen: bool = False

    def observe(self, kind: str, lag: int) -> None:
        if not self.frozen and kind in self.priors and 0 < lag <= 40:
            self.samples.setdefault(kind, []).append(int(lag))

    def observe_horizon(self, jobs: int, length: int) -> None:
        if not self.frozen:
            key = str(jobs)
            self.horizons[key] = min(self.horizons.get(key, length), length)

    def lag(self, kind: str, slow: bool = False) -> int:
        seen = sorted(self.samples.get(kind, ()))
        if len(seen) < 3:
            base = self.priors[kind]
        else:  # typical case: median; adverse case: 90th percentile
            base = seen[int((0.9 if slow else 0.5) * (len(seen) - 1))]
        return int(round(base + (2 if slow and len(seen) < 3 else 0)))

    def horizon(self, jobs: int):
        return self.horizons.get(str(jobs))

    def to_json(self) -> dict:
        return {"schema": "AsilTransitionModel/1", "priors": dict(self.priors),
                "samples": {k: list(v) for k, v in sorted(self.samples.items())},
                "horizons": dict(sorted(self.horizons.items()))}

    @classmethod
    def from_json(cls, payload: dict):
        return cls(dict(payload["priors"]),
                   {k: list(v) for k, v in payload["samples"].items()},
                   dict(payload["horizons"]))


def _state(view: dict, tracks: dict, model: TransitionModel, slow: bool) -> dict:
    """Believed job states from public statuses and own receipts."""
    tick, jobs = view["tick"], {}
    for j in view["jobs"]:
        name, track = j["job_id"], tracks[j["job_id"]]
        job = {"material_cost": j["material_cost"], "crew_cost": j["crew_cost"],
               "payment": j["payment"], "limit_ok": j["material_cost"] <= j["order_limit"],
               "required": j["required_known"], "work": j["work_receipted"],
               "dead": j["authority_seen"] == "revoked", "paid": bool(j["paid_receipted"]),
               "material": "unplaced", "eta": None, "blocked": False, "block_eta": None,
               "change": False, "change_eta": None, "dispute": False, "dispute_eta": None,
               "invoice": "none", "inv_eta": None, "pay_eta": None}
        if j["materials_seen"] == "delivered":
            job["material"] = "ready"
        elif track["ordered"] is not None:
            late = 3 if j["materials_seen"] == "delivery_delayed" else 0
            job["material"] = "transit"
            job["eta"] = max(tick + 1, track["ordered"] + model.lag("delivery", slow) + late)
        if j["blocker_seen"] == "active":
            job["blocked"] = True
        elif j["blocker_seen"] == "resolution_requested":
            job["blocked"] = True
            job["block_eta"] = max(tick + 1, (track["escalated"] or tick)
                                   + model.lag("blocker", slow))
        if j["change_seen"] == "approval_required":
            job["change"] = True
        elif j["change_seen"] == "approval_requested":
            job["change"] = True
            job["change_eta"] = max(tick + 1, (track["approval"] or tick)
                                    + model.lag("approval", slow))
        if j["invoice_seen"] == "disputed":
            job["dispute"] = True
        elif j["invoice_seen"] == "dispute_review_requested":
            job["dispute"] = True
            job["dispute_eta"] = max(tick + 1, (track["dispute"] or tick)
                                     + model.lag("dispute", slow))
        if j["invoice_seen"] == "verified" or track["verified"] is not None:
            job["invoice"] = "verified"
            job["pay_eta"] = max(tick + 1, (track["verified"] or tick)
                                 + model.lag("payment", slow))
        elif track["invoice"] is not None:
            job["invoice"] = "pending"
            job["inv_eta"] = max(tick + 1, track["invoice"] + model.lag("invoice", slow))
        jobs[name] = job
    return jobs


def _commitments(jobs: dict, skip: str | None = None) -> int:
    """Crew cash still needed to finish every job whose materials are bought."""
    return sum(j["crew_cost"] * max(0, j["required"] - j["work"]) for name, j in jobs.items()
               if name != skip and j["material"] != "unplaced" and not j["dead"]
               and not j["paid"] and j["invoice"] == "none")


def _next_action(jobs: dict, cash: int, order: tuple, reserve: str):
    """Rollout policy inside the simulator (one action per tick)."""
    for name, j in jobs.items():
        if j["dead"] or j["paid"]:
            continue
        if j["dispute"] and j["dispute_eta"] is None:
            return "resolve_invoice_dispute", name
        if j["change"] and j["change_eta"] is None:
            return "request_change_approval", name
        if j["blocked"] and j["block_eta"] is None:
            return "escalate_blocker", name
    workable = [(name, j) for name, j in jobs.items() if not j["dead"] and not j["paid"]
                and j["material"] == "ready" and not j["blocked"] and not j["change"]]
    for name, j in workable:
        if j["work"] >= j["required"] and j["invoice"] == "none":
            return "request_invoice", name
    crew = [(j["required"] - j["work"], name) for name, j in workable
            if j["work"] < j["required"] and cash >= j["crew_cost"]]
    if crew:
        return "assign_crew", min(crew)[1]
    for name in order:
        j = jobs[name]
        if j["material"] != "unplaced" or j["dead"] or j["paid"] or not j["limit_ok"]:
            continue
        needed = j["material_cost"] + (j["crew_cost"] if reserve == "one_shift" else
                                       j["crew_cost"] * j["required"] + _commitments(jobs))
        if cash >= needed:
            return "order_material", name
        if reserve == "full":
            break   # keep the declared order; do not skip ahead to a cheaper job
    return "wait", None


def _apply(jobs: dict, cash: int, action: str, name, tick: int, model, slow: bool) -> int:
    if name is None:
        return cash
    j = jobs[name]
    if action == "order_material":
        j["material"], j["eta"] = "transit", tick + model.lag("delivery", slow)
        return cash - j["material_cost"]
    if action == "assign_crew":
        j["work"] += 1
        return cash - j["crew_cost"]
    if action == "escalate_blocker":
        j["block_eta"] = tick + model.lag("blocker", slow)
    elif action == "request_change_approval":
        j["change_eta"] = tick + model.lag("approval", slow)
    elif action == "resolve_invoice_dispute":
        j["dispute_eta"] = tick + model.lag("dispute", slow)
    elif action == "request_invoice":
        j["invoice"], j["inv_eta"] = "pending", tick + model.lag("invoice", slow)
    return cash


def simulate(view, tracks, model, order, reserve, *, slow=False, first=None, until=None):
    """Bounded forward simulation of the believed process. Returns outcome + ops."""
    jobs = _state(view, tracks, model, slow)
    cash, start = view["cash_budget"], view["tick"]
    end = until if until is not None else start + 45
    opening, ops = ("wait", None), 0
    for tick in range(start, end):
        ops += 1
        for j in jobs.values():
            if j["eta"] is not None and tick >= j["eta"]:
                j["material"], j["eta"] = "ready", None
            if j["block_eta"] is not None and tick >= j["block_eta"]:
                j["blocked"], j["block_eta"] = False, None
            if j["change_eta"] is not None and tick >= j["change_eta"]:
                j["change"], j["change_eta"] = False, None
            if j["dispute_eta"] is not None and tick >= j["dispute_eta"]:
                j["dispute"], j["dispute_eta"] = False, None
            if j["inv_eta"] is not None and tick >= j["inv_eta"]:
                j["invoice"], j["inv_eta"] = "verified", None
                j["pay_eta"] = tick + model.lag("payment", slow)
            if (j["pay_eta"] is not None and tick >= j["pay_eta"] and not j["dispute"]
                    and not j["paid"]):
                j["paid"], j["pay_eta"] = True, None
                cash += j["payment"]
        if all(j["paid"] or j["dead"] for j in jobs.values()):
            break
        action, name = first if (tick == start and first is not None) else _next_action(
            jobs, cash, order, reserve)
        if tick == start:
            opening = (action, name)
        cash = _apply(jobs, cash, action, name, tick, model, slow)
    paid = {name for name, j in jobs.items() if j["paid"]}
    return {"paid": paid, "cash": cash, "opening": opening, "ops": ops,
            "value": 1000 * len(paid) + cash}


class DeepStrategyPlanner:
    """Bounded investigation: alternatives, forward simulation, risk weighting."""

    MAX_ORDERINGS = 6

    def __init__(self, model: TransitionModel):
        self.model = model

    def _orderings(self, view, tracks) -> list[tuple]:
        open_jobs = [j for j in view["jobs"] if tracks[j["job_id"]]["ordered"] is None
                     and j["materials_seen"] != "delivered"]
        cost = lambda j: j["material_cost"] + j["crew_cost"] * j["required_known"]  # noqa: E731
        keys = (lambda j: (-(j["payment"] - cost(j)) / cost(j), j["job_id"]),
                lambda j: (cost(j), j["job_id"]),
                lambda j: (-j["payment"], j["job_id"]))
        found = []
        for key in keys:
            ordering = tuple(j["job_id"] for j in sorted(open_jobs, key=key))
            if ordering not in found:
                found.append(ordering)
        for ordering in permutations(sorted(j["job_id"] for j in open_jobs)):
            if len(found) >= self.MAX_ORDERINGS:
                break
            if ordering not in found:
                found.append(ordering)
        return found or [()]

    def plan(self, view, tracks, admissible: dict) -> dict:
        """Pick the opening move of the best risk-weighted plan, or abstain."""
        horizon = self.model.horizon(len(view["jobs"]))
        ops, plans = 0, []
        for ordering in self._orderings(view, tracks):
            for reserve in ("full", "one_shift"):
                nominal = simulate(view, tracks, self.model, ordering, reserve, until=horizon)
                adverse = simulate(view, tracks, self.model, ordering, reserve, slow=True,
                                   until=horizon)
                ops += nominal["ops"] + adverse["ops"]
                plans.append((0.6 * nominal["value"] + 0.4 * adverse["value"],
                              nominal, adverse, ordering, reserve))
        plans.sort(key=lambda p: (-p[0], p[3], p[4]))
        idle = simulate(view, tracks, self.model, (), "full", first=("wait", None),
                        until=view["tick"] + 1)
        missing = sorted(
            f"{j['job_id']}:{name}" for j in view["jobs"]
            for name in ("materials_seen", "blocker_seen", "change_seen", "invoice_seen")
            if j[name] == "unknown" and tracks[j["job_id"]]["ordered"] is not None
            and name == "materials_seen")
        for value, nominal, adverse, ordering, reserve in plans:
            action, name = nominal["opening"]
            identifier = "ACT:WAIT" if name is None else f"ACT:{action.upper()}:{name}"
            if name is not None and identifier not in admissible:
                continue   # the plan's opening is not a validated option
            if name is None:
                break
            if value <= idle["cash"] + 1000 * len(idle["paid"]):
                break      # acting is not expected to beat doing nothing
            sure = name in nominal["paid"] and name in adverse["paid"]
            likely = name in nominal["paid"]
            return {"selected": identifier, "ops": ops, "missing_information": missing,
                    "confidence": 0.9 if sure else 0.6 if likely else 0.2,
                    "why": f"plan {reserve}/{len(ordering)} jobs queued: expects "
                           f"{len(nominal['paid'])} paid (adverse {len(adverse['paid'])})",
                    "alternatives": len(plans)}
        return {"selected": None, "ops": ops, "missing_information": missing,
                "confidence": 0.5, "alternatives": len(plans),
                "why": "no validated action is expected to beat waiting"}


class AsilCausalPolicy:
    """ASIL over the real review-only runtime, for one fictional company episode."""

    def __init__(self, case, *, mode="adaptive", memory: IntuitionMemory | None = None,
                 model: TransitionModel | None = None, config: RouterConfig | None = None,
                 episode_index=0):
        if mode not in MODES:
            raise ValueError("Unknown ASIL mode")
        if case.split not in ("dev", "validation"):
            raise PermissionError("No holdout or production Genesis policy")
        self.case, self.mode, self.episode_index = case, mode, episode_index
        self.config = config or RouterConfig()
        self.memory = None if mode in ("memory_off", "deep_only", "planner_only") else memory
        self.model = TransitionModel() if mode == "memory_off" or model is None else model
        self.tenant = "SYN-TENANT-" + str(case.seed)
        self.scope = "SYN-SCOPE-" + str(case.seed)
        self.domain = AsilDomainAdapter([j.name for j in case.jobs])
        self.store = RuntimeStore(":memory:")
        self.runtime = AionRuntime(self.store, [self.domain])
        self.runtime.set_goal_profile(GoalProfileV1(
            tenant_id=self.tenant, domain_id=DOMAIN,
            goal_weights={"progress": 5, "liquidity": 1, "collection": 3},
            hard_constraints={"max_spend": 100000, "forbidden_choices": []},
            risk_tolerance=0.25, decision_deadline=None, owner_preference_version=1))
        self.recognizer = StrategicContextRecognizer(CORE_FEATURES)
        self.router = MetacognitiveRouter(
            self.config, allow_fast=mode in ("adaptive", "fast_only"),
            allow_deep=mode in ("adaptive", "deep_only", "memory_off"))
        self.planner = DeepStrategyPlanner(self.model)
        self.verifier = CausalOutcomeVerifier()
        self.learner = AdaptiveStrategyLearner(self.memory)
        self.tracks = {j.name: {"ordered": None, "invoice": None, "escalated": None,
                                "approval": None, "dispute": None, "verified": None,
                                "delivered": None, "paid": None, "shocks": set()}
                       for j in case.jobs}
        self.decisions: list[dict] = []
        self.proposals = 0
        self.planning_ops = 0
        self.deep_budget = self.config.deep_budget_per_episode
        self.last_view = None

    def close(self):
        self.store.close()

    # -- perception ------------------------------------------------------
    def _observe(self, view):
        if view.get("role") != "project_manager" or view.get("global_truth") is not False:
            raise PermissionError("ASIL accepts only its scoped public PM observation")
        if view.get("fictional") is not True or not isinstance(view.get("jobs"), list):
            raise PermissionError("Non-synthetic or incomplete input is forbidden")
        if {j.get("job_id") for j in view["jobs"]} != set(self.domain.job_ids):
            raise PermissionError("Unrecognized or missing synthetic job")
        tick = view["tick"]
        rows = [("COMPANY", "cash_budget", view["cash_budget"]), ("COMPANY", "tick", tick)]
        for job in view["jobs"]:
            name, track = job["job_id"], self.tracks[job["job_id"]]
            for stream, status in (("materials_seen", "delivery_delayed"),
                                   ("blocker_seen", "active"),
                                   ("change_seen", "approval_required"),
                                   ("invoice_seen", "disputed"),
                                   ("authority_seen", "revoked")):
                if job[stream] == status and status not in track["shocks"]:
                    track["shocks"].add(status)          # an external event, not ours
                    self.verifier.note_confounder(name, status)
            if job["materials_seen"] == "delivered" and track["delivered"] is None:
                track["delivered"] = tick
                if track["ordered"] is not None and "delivery_delayed" not in track["shocks"]:
                    self.model.observe("delivery", tick - track["ordered"])
            if job["invoice_seen"] == "verified" and track["verified"] is None:
                track["verified"] = tick
                if track["invoice"] is not None:
                    self.model.observe("invoice", tick - track["invoice"])
            if job["paid_receipted"] and track["paid"] is None:
                track["paid"] = tick
                if track["verified"] is not None and "disputed" not in track["shocks"]:
                    self.model.observe("payment", tick - track["verified"])
            for key in METRICS:
                if key == "ordered":
                    value = int(track["ordered"] is not None)
                elif key == "invoice_requested":
                    value = int(track["invoice"] is not None)
                elif key == "authority_seen" and track.get("denied"):
                    value = STATUSES["revoked"]
                elif key.endswith("_seen"):
                    value = STATUSES.get(job.get(key, "unknown"), 0)
                else:
                    value = int(job[key])
                rows.append((name, key, value))
        for subject, metric, number in rows:
            self.runtime.observe(ObservationV1(
                event_id="EV-" + _id(self.case.seed, tick, subject, metric),
                tenant_id=self.tenant, domain_id=DOMAIN, scope_id=self.scope,
                subject_id=subject, metric=metric, value=number, source_revision=tick + 1,
                observed_at=tick, provenance="synthetic"))

    def _features(self, view, job, action) -> tuple[dict, float]:
        track, cash = self.tracks[job["job_id"]], view["cash_budget"]
        remaining = max(0, job["required_known"] - job["work_receipted"])
        stage = ("invoiced" if track["invoice"] is not None else
                 "done" if remaining == 0 and job["materials_seen"] == "delivered" else
                 "ready" if job["materials_seen"] == "delivered" else
                 "transit" if track["ordered"] is not None else "unplaced")
        spend = (job["material_cost"] if action == "order_material" else
                 job["crew_cost"] if action == "assign_crew" else 0)
        funding = "na"
        if spend:
            believed = _state(view, self.tracks, self.model, False)
            after = cash - spend
            own = job["crew_cost"] * (remaining if action == "order_material"
                                      else max(0, remaining - 1))
            others = _commitments(believed, skip=job["job_id"])
            funding = ("full" if after >= own + others else
                       "partial" if after >= own else "thin")
        horizon, phase = self.model.horizon(len(view["jobs"])), "unknown"
        if horizon is not None:
            need = self.model.lag("invoice") + self.model.lag("payment") + remaining + 1
            if stage == "unplaced":
                need += self.model.lag("delivery") + 1
            left = horizon - view["tick"]
            phase = "ok" if left >= need + 4 else "tight" if left >= need else "late"
        flag = lambda value, table: table.get(value, "none")  # noqa: E731
        features = {
            "stage": stage, "funding": funding, "phase": phase,
            "blocker": flag(job["blocker_seen"], {"active": "active",
                                                  "resolution_requested": "requested"}),
            "change": flag(job["change_seen"], {"approval_required": "required",
                                                "approval_requested": "requested"}),
            "dispute": flag(job["invoice_seen"], {"disputed": "active",
                                                  "dispute_review_requested": "requested"}),
            "supply": "delayed" if "delivery_delayed" in track["shocks"] else "normal",
        }
        return features, spend / max(1, cash)

    # -- decision --------------------------------------------------------
    def choose(self, view):
        started = perf_counter()
        self._observe(view)
        self.last_view = view
        tick = view["tick"]
        proposal = self.runtime.investigate(DecisionRequestV1(
            request_id="REQ-" + _id(self.case.case_id, tick),
            case_id="CASE-" + _id(self.case.case_id), tenant_id=self.tenant,
            domain_id=DOMAIN, scope_id=self.scope, as_of=tick,
            available_capabilities=("bounded_search",), compute_budget=100,
            time_budget_ms=3000, model_call_budget=0))
        self.proposals += 1
        log = {"tick": tick, "route": ABSTAIN, "selected": "ACT:WAIT", "confidence": 0.5,
               "ops": 0, "reason": "runtime abstained or issued no reviewable proposal"}
        action = dict(FALLBACK)
        if proposal.approval_state == PENDING_HUMAN_REVIEW and not proposal.abstained:
            cards = {c["identifier"]: c for c in proposal.candidate_options
                     if c["identifier"] != "ACT:WAIT" and c["within_spend_bound"]}
            jobs = {j["job_id"]: j for j in view["jobs"]}
            options, contexts = [], {}
            for identifier, card in sorted(cards.items()):
                picked = dict(tuple(pair) for pair in card["decisions"])
                kind, job_id = picked["action"], picked["job"]
                if kind not in ACTIONS or job_id not in jobs:
                    continue
                features, stake = self._features(view, jobs[job_id], kind)
                context = self.recognizer.recognise(kind, features)
                contexts[identifier] = (context, job_id, kind)
                done = jobs[job_id]["work_receipted"] / max(1, jobs[job_id]["required_known"])
                options.append(Option(identifier, context, stake, stake == 0,
                                      _PRIORITY[kind] + done))
            if self.mode == "planner_only":
                chosen = proposal.selected_option["identifier"]
                log.update(route="planner", selected=chosen, confidence=0.5,
                           reason="runtime bounded-search selection (no ASIL)")
            else:
                routing = self.router.route(options, self.memory, self.episode_index,
                                            self.deep_budget)
                chosen, log["route"] = routing.selected, routing.route
                log.update(confidence=routing.confidence, reason=routing.reason)
                if routing.route == DEEP:
                    plan = self.planner.plan(view, self.tracks, cards)
                    self.deep_budget -= 1
                    self.planning_ops += plan["ops"]
                    chosen = plan["selected"]
                    log.update(ops=plan["ops"], confidence=plan["confidence"],
                               reason=plan["why"],
                               missing_information=plan["missing_information"])
                    if chosen is None:
                        log["route"] = "deep_abstain"
                elif routing.route == ABSTAIN and self.mode == "fast_only" and any(
                        c["state"] == "uncertain" for c in routing.considered):
                    # Fast-only control: no investigation exists, so fall back
                    # to the runtime's own heuristic ranking.
                    chosen = proposal.selected_option["identifier"]
                    log.update(route="fallback_planner",
                               reason="no trusted experience; runtime heuristic used")
            if chosen in contexts:
                context, job_id, kind = contexts[chosen]
                # Selection must be a validated card citing only current evidence.
                if all(self.store.event_state(self.tenant, ref) == "current"
                       for ref in cards[chosen]["evidence_ids"]):
                    action = {"tool": kind, "job_id": job_id,
                              "key": "ASIL-" + _id(self.case.seed, tick, kind, job_id)}
                    log["selected"] = chosen
                    self._pending = (context, job_id, kind, log["route"], log["confidence"],
                                     proposal.proposal_id)
        log["latency_ms"] = round((perf_counter() - started) * 1000, 3)
        self.decisions.append(log)
        return action

    def observe(self, action, response):
        pending, self._pending = getattr(self, "_pending", None), None
        if pending is None or action.get("tool") == "wait":
            return
        context, job_id, kind, route, confidence, proposal_id = pending
        if response.get("status") not in ("committed", "already_committed"):
            self.decisions[-1]["rejected"] = response.get("status")
            if response.get("status") in ("authority_revoked", "approval_denied"):
                # A denial is itself a receipt: never retry on this job.
                self.tracks[job_id]["denied"] = True
            return
        tick, track = self.decisions[-1]["tick"], self.tracks[job_id]
        slot = {"order_material": "ordered", "request_invoice": "invoice",
                "escalate_blocker": "escalated", "request_change_approval": "approval",
                "resolve_invoice_dispute": "dispute"}.get(kind)
        if slot:
            track[slot] = tick
        # The receipt proves the operation happened, not that it worked. The
        # decision stays open until the job's business outcome is verified.
        self.verifier.expect(subject=job_id, context=context, route=route,
                             expected=confidence, tick=tick,
                             evidence_ref="SYN-PROPOSAL-" + _id(proposal_id))

    def finish(self):
        """Episode end: settle on verified paid/unpaid receipts, then learn."""
        view = self.last_view
        outcome = {j["job_id"]: bool(j["paid_receipted"]) for j in view["jobs"]}
        settled = self.verifier.settle(outcome)
        written = self.learner.learn(settled, self.episode_index)
        self.model.observe_horizon(len(view["jobs"]), view["tick"] + 1)
        return {"settled": len(settled), "memory_records_written": written}
