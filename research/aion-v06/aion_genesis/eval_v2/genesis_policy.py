"""A real AionRuntime (review-only) policy bridge to the v2.3 causal sandbox.

This is the production Genesis *reasoning runtime* under a lab-only domain
adapter, not a substitute heuristic named 'Genesis'. It can optionally use a
configured OpenAI-compatible model via its existing bounded ModelBinding;
CI never calls a remote model. Proposals cannot execute production commands.
The ONLY executor is v2.3's fictional World.step after contract validation.
"""

from dataclasses import dataclass
from hashlib import sha256
import json

from ..strategic_planner import Axis, Choice
from ..runtime import (
    AionRuntime, CaseBuild, DecisionRequestV1, GoalProfileV1,
    ModelBinding, ObservationV1, OutcomeRecordV1, RuntimeStore,
    PENDING_HUMAN_REVIEW,
)
from .causal_world import World

DOMAIN = "synthetic_causal_business_v24"
ACTIONS = (
    "wait", "order_material", "assign_crew", "escalate_blocker",
    "request_change_approval", "request_invoice", "resolve_invoice_dispute",
)
STATUSES = {
    "unknown": 0, "unplaced": 0, "committed": 1, "in_transit": 1,
    "delivered": 2, "delivery_delayed": 3, "active": 1,
    "resolution_requested": 2, "resolved": 3,
    "approval_required": 1, "approval_requested": 2, "approved": 3,
    "revoked": 4, "verified": 1, "disputed": 2,
    "dispute_review_requested": 3, "dispute_resolved": 4,
    "review_requested": 5,
}
METRICS = (
    "priority", "deadline", "material_cost", "crew_cost", "payment",
    "order_limit", "work_receipted", "required_known", "materials_seen",
    "blocker_seen", "change_seen", "invoice_seen", "authority_seen",
    "paid_receipted", "purchase_known",
)
OBJECTIVES = ("progress", "liquidity", "collection")
FALLBACK = {"tool": "wait", "job_id": "", "key": ""}


def _id(*values):
    return sha256(json.dumps(values, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:22]


@dataclass(frozen=True)
class LabFacts:
    cash: int
    tick: int
    jobs: dict
    citations: dict


class CausalStrategyDomain:
    """Typed runtime DecisionDomain: no world state or hidden shock API."""

    name = DOMAIN

    def __init__(self, job_ids):
        self.axes = (
            Axis("job", ("NONE", *tuple(job_ids))),
            Axis("action", ACTIONS),
        )
        self.baseline_decisions = (("job", "NONE"), ("action", "wait"))

    def assess(self, facts: LabFacts, decisions):
        selected = dict(decisions)
        job_id, action = selected["job"], selected["action"]
        cash = facts.cash
        if action == "wait":
            if job_id != "NONE":
                return None
            return Choice("ACT:WAIT", decisions, {
                "progress": 0.0, "liquidity": 0.0, "collection": 0.0,
            }, {k: 0.0 for k in OBJECTIVES}, 0,
                tuple(facts.citations["company"]),
                "Wait without business effects", "Future messages may be delayed.")
        if job_id not in facts.jobs:
            return None
        j = facts.jobs[job_id]
        mat = j["materials_seen"]
        block, change, invoice = j["blocker_seen"], j["change_seen"], j["invoice_seen"]
        if j["authority_seen"] == STATUSES["revoked"]:
            return None
        spent = 0
        progress, collection = 0.0, 0.0
        if action == "order_material":
            if (j["purchase_known"] or mat != 0 or
                    cash < j["material_cost"] + j["crew_cost"] or
                    j["material_cost"] > j["order_limit"]):
                return None
            spent = j["material_cost"]
            progress = 1.4
        elif action == "assign_crew":
            if (mat != 2 or block in (1, 2) or change in (1, 2) or
                    j["work_receipted"] >= j["required_known"] or
                    cash < j["crew_cost"]):
                return None
            spent = j["crew_cost"]
            progress = 2.4
        elif action == "escalate_blocker":
            if block != 1:
                return None
            progress = 2.7
        elif action == "request_change_approval":
            if change != 1:
                return None
            progress = 2.6
        elif action == "request_invoice":
            if (mat != 2 or block in (1, 2) or change in (1, 2) or
                    j["work_receipted"] < j["required_known"] or invoice != 0):
                return None
            progress, collection = 1.9, 4.0
        elif action == "resolve_invoice_dispute":
            if invoice != 2:
                return None
            progress, collection = 1.6, 3.7
        else:
            return None
        evidence = tuple(sorted(set(
            (*facts.citations["company"], *facts.citations[job_id]))))
        return Choice(
            "ACT:" + action.upper() + ":" + job_id, decisions,
            {
                "progress": round(progress * (1.0 + 0.05 * j["priority"]), 4),
                "liquidity": round(-spent / 100.0, 4),
                "collection": collection,
            }, {"progress": 0.4, "liquidity": 0.1,
                "collection": 0.6 if collection else 0.0},
            spent, evidence,
            "Bounded review-only simulation option grounded in observed state",
            "Estimates omit unknown shocks and delayed external effects.",
        )


class CausalDomainAdapter:
    domain_id = DOMAIN
    version = "2.4.0-runtime-bridge"
    objectives = OBJECTIVES
    default_freshness_ticks = 1
    freshness_ticks = {}

    def __init__(self, job_ids):
        self.job_ids = tuple(job_ids)
        if not 2 <= len(self.job_ids) <= 5 or len(set(self.job_ids)) != len(self.job_ids):
            raise ValueError("Invalid public job roster")
        self.decision_domain = CausalStrategyDomain(self.job_ids)

    def build_case(self, observations, tenant_id, scope_id):
        rows = {(o.subject_id, o.metric): o for o in observations}
        company = rows.get(("COMPANY", "cash_budget"))
        current = rows.get(("COMPANY", "tick"))
        if company is None or current is None:
            return CaseBuild(None, missing=("cash_budget", "tick"))
        jobs, citations = {}, {"company": [company.event_id, current.event_id]}
        for job_id in self.job_ids:
            present = {metric: rows.get((job_id, metric)) for metric in METRICS}
            if any(value is None for value in present.values()):
                return CaseBuild(None, missing=(job_id + ":observed_metrics",))
            jobs[job_id] = {name: record.value for name, record in present.items()}
            citations[job_id] = [record.event_id for record in present.values()]
        return CaseBuild(LabFacts(
            cash=int(company.value), tick=int(current.value),
            jobs=jobs, citations=citations))

    def fixed_rule(self, facts):
        # The bounded planner owns ranking; fixed path has a safe abstention.
        return self.decision_domain.baseline_decisions


class GenesisCausalPolicy:
    """One isolated AionRuntime per fictional company/episode.

    A proposal remains pending human review. In this *explicit* simulator
    fixture only, the bridge maps reviewed option syntax to the mock world's
    typed action. No command registry, live supplier or production effects.
    """

    def __init__(self, case, *, model_binding: ModelBinding | None = None,
                 enable_outcome_memory=True, model_call_budget=0):
        if model_call_budget and model_binding is None:
            raise ValueError("Model budget requires an explicitly bound adapter")
        if not 0 <= model_call_budget <= 1:
            raise ValueError("v2.4 lab model call budget is 0 or 1 per decision")
        if case.split not in ("dev", "validation"):
            raise PermissionError("No holdout or production Genesis policy")
        self.case = case
        self.tenant = "SYN-TENANT-" + str(case.seed)
        self.scope = "SYN-SCOPE-" + str(case.seed)
        self.domain = CausalDomainAdapter([j.name for j in case.jobs])
        self.store = RuntimeStore(":memory:")
        self.runtime = AionRuntime(
            self.store, [self.domain], model=model_binding)
        self.runtime.set_goal_profile(GoalProfileV1(
            tenant_id=self.tenant, domain_id=DOMAIN,
            goal_weights={"progress": 5, "liquidity": 1, "collection": 3},
            hard_constraints={"max_spend": max(0, case.initial_cash),
                              "forbidden_choices": []},
            risk_tolerance=0.25,
            decision_deadline=None, owner_preference_version=1))
        self.memory_enabled = bool(enable_outcome_memory)
        self.model_budget = model_call_budget
        self.pending = None
        self.proposals = []
        self.receipts = []
        self.last_error = None
        self.actual_model_calls = 0
        self.invalid_model_responses = 0
        self.learning_receipts = 0

    def close(self):
        self.store.close()

    def _observe(self, view):
        if view.get("role") != "project_manager" or view.get("global_truth") is not False:
            raise PermissionError("Genesis accepts only its scoped public PM observation")
        if view.get("fictional") is not True or not isinstance(view.get("jobs"), list):
            raise PermissionError("Non-synthetic or incomplete model input is forbidden")
        if not isinstance(view.get("tick"), int) or not isinstance(view.get("cash_budget"), int):
            raise ValueError("Malformed public role observation")
        if {j.get("job_id") for j in view["jobs"]} != set(self.domain.job_ids):
            raise PermissionError("Unrecognized or missing synthetic job")
        snapshot = [
            ("COMPANY", "cash_budget", view["cash_budget"]),
            ("COMPANY", "tick", view["tick"]),
        ]
        visible = {(e["job_id"], e["stream"]): e["status"]
                   for e in view.get("messages", [])}
        for job in view["jobs"]:
            for key in METRICS:
                if key == "purchase_known":
                    value = int(visible.get((job["job_id"], "purchase")) == "committed")
                elif key.endswith("_seen"):
                    value = STATUSES.get(job.get(key, "unknown"), 0)
                elif key == "paid_receipted":
                    value = int(job[key])
                else:
                    value = job[key]
                if type(value) not in (int, float):
                    raise ValueError("Non-numeric public projection")
                snapshot.append((job["job_id"], key, value))
        for subject, metric, number in snapshot:
            obs = ObservationV1(
                event_id="EV-" + _id(self.case.seed, view["tick"], subject, metric),
                tenant_id=self.tenant, domain_id=DOMAIN, scope_id=self.scope,
                subject_id=subject, metric=metric, value=number,
                source_revision=view["tick"] + 1,
                observed_at=view["tick"], provenance="synthetic",
                visibility="tenant", department="general")
            self.runtime.observe(obs)

    def choose(self, view):
        self._observe(view)
        if self.pending is not None:
            return {"tool": "verify_operation", "job_id": "",
                    "key": self.pending["action"]["key"]}
        capabilities = ["bounded_search"]
        if self.memory_enabled:
            capabilities.append("outcome_memory")
        if self.model_budget:
            capabilities.append("model_advice")
        request = DecisionRequestV1(
            request_id="REQ-" + _id(self.case.case_id, view["tick"]),
            case_id="CASE-" + _id(self.case.case_id),
            tenant_id=self.tenant, domain_id=DOMAIN, scope_id=self.scope,
            as_of=view["tick"], available_capabilities=tuple(capabilities),
            compute_budget=100, time_budget_ms=3000,
            model_call_budget=self.model_budget)
        proposal = self.runtime.investigate(request)
        self.proposals.append(proposal)
        self.actual_model_calls += (proposal.model or {}).get("calls", 0)
        if (proposal.model or {}).get("status") == "invalid_reply_ignored":
            self.invalid_model_responses += 1
        if proposal.approval_state != PENDING_HUMAN_REVIEW or proposal.abstained:
            return dict(FALLBACK)
        card = proposal.selected_option
        if (not card or card.get("approval_state") != PENDING_HUMAN_REVIEW
                or not card.get("within_spend_bound")
                or not set(card.get("evidence_ids", ())) <= {
                    e["event_id"] for e in proposal.evidence_refs}):
            self.last_error = "invalid_proposal"
            return dict(FALLBACK)
        try:
            job_id = dict(card["decisions"])["job"]
            tool = dict(card["decisions"])["action"]
        except (KeyError, TypeError, ValueError):
            self.last_error = "bad_decision_encoding"
            return dict(FALLBACK)
        if (tool not in ACTIONS or job_id not in (
                "NONE", *self.domain.job_ids) or
                (tool == "wait") != (job_id == "NONE")):
            self.last_error = "unrecognized_business_option"
            return dict(FALLBACK)
        if tool == "wait":
            return dict(FALLBACK)
        key = "GEN-" + _id(self.case.seed, view["tick"], tool, job_id)
        action = {"tool": tool, "job_id": job_id, "key": key}
        self.pending = {
            "action": action, "proposal": proposal,
            "before_cash": view["cash_budget"],
            "before_work": next(j["work_receipted"] for j in view["jobs"]
                                if j["job_id"] == job_id),
            "committed": False, "verified": False,
        }
        return action

    def observe(self, action, response):
        if self.pending is None:
            return
        pending = self.pending
        if action == pending["action"]:
            if response.get("status") in ("committed", "already_committed"):
                pending["committed"] = True
            elif response.get("status") == "timeout_unknown_commit":
                # Never issue a new write while the commit is uncertain.
                pending["committed"] = False
            else:
                self.pending = None
            return
        if action.get("tool") != "verify_operation":
            self.last_error = "out_of_sequence_receipt"
            return
        if response.get("status") == "committed":
            pending["verified"] = True
        self.receipts.append({
            "action": dict(pending["action"]), "verified": pending["verified"],
            "receipt": response.get("status"),
        })
        if pending["verified"] and self.memory_enabled:
            proposal = pending["proposal"]
            chosen = proposal.selected_option
            job_id = pending["action"]["job_id"]
            tool = pending["action"]["tool"]
            # Record only what this *verified operation* establishes. No
            # invented downstream payment or final utility attribution.
            material = next(j.material_cost for j in self.case.jobs if j.name == job_id)
            crew = next(j.crew_cost for j in self.case.jobs if j.name == job_id)
            spending = material if tool == "order_material" else (
                crew if tool == "assign_crew" else 0)
            progress = 1 if tool == "assign_crew" else 0
            outcome = OutcomeRecordV1(
                outcome_id="OUT-" + _id(proposal.proposal_id),
                proposal_id=proposal.proposal_id, tenant_id=self.tenant,
                domain_id=DOMAIN, chosen_action_ref=chosen["identifier"],
                observed_effects={
                    "progress": progress,
                    "liquidity": -round(spending / 100.0, 4),
                    "collection": 0.0,
                },
                receipt_ref="SYN-RECEIPT-" + _id(pending["action"]["key"]),
                evidence_ref="SYN-PROPOSAL-" + _id(proposal.trace_id),
                observation_time=proposal.as_of + 1,
                verified=True,
            )
            result = self.runtime.record_outcome(outcome)
            if result.get("status") == "learned_provisional":
                self.learning_receipts += 1
        self.pending = None


def run_genesis_episode(case, *, model_binding=None, enable_outcome_memory=True,
                        model_call_budget=0):
    policy = GenesisCausalPolicy(
        case, model_binding=model_binding,
        enable_outcome_memory=enable_outcome_memory,
        model_call_budget=model_call_budget)
    world = World(case)
    trace = []
    try:
        while world.tick < case.horizon:
            view = world.public_view("project_manager", tenant=policy.tenant)
            action = policy.choose(view)
            event = world.step(action)
            policy.observe(action, event["result"])
            trace.append({"tick": event["tick"], "action": event["action"],
                          "result": event["result"],
                          "public_observation_digest": _id(event["view"])})
        from .adaptive import judge
        scored = judge(case, world.final_truth())
        return {
            "schema": "GenesisActualRuntimeCausalEpisode/2.4",
            "case_id": case.case_id,
            "runtime": "AionRuntime", "runtime_domain": DOMAIN,
            "model_advice_enabled": bool(model_call_budget),
            "model_calls": policy.actual_model_calls,
            "learning_receipts": policy.learning_receipts,
            "memory_mode": "provisional_outcome_residual" if enable_outcome_memory else "off",
            "verified_operations": sum(r["verified"] for r in policy.receipts),
            "score": scored,
            "trace": trace,
            "proposal_count": len(policy.proposals),
            "external_business_actions": 0,
            "synthetic_mock_operations_only": True,
            "protected_holdout_evaluated": False,
        }
    finally:
        policy.close()
