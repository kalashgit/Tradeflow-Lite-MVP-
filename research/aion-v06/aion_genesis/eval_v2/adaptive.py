"""Bounded reference policies, independent outcome scorer, and adaptive curriculum.

An adaptive curriculum may select *training cases*, never edit the referee,
oracle, fixed validation, protection of holdouts, or live business policies.
An LLM critic can receive a read-only review packet; its opinions have zero
scoring or promotion authority. All learning here is a small auditable
contextual policy selector, NOT a new language model or autonomous self-edit.
"""

from dataclasses import asdict, dataclass, replace
from statistics import mean
import random

from .causal_world import FAMILIES, World, generate


class Policy:
    def __init__(self, mode):
        if mode not in ("no_action", "deadline_first", "cash_first", "risk_averse"):
            raise ValueError("Unknown fixed policy")
        self.mode = mode
        self.orders = set()
        self.invoice_requests = set()
        self.escalations = set()
        self.approvals = set()
        self.disputes = set()
        self.previous_call = None
        self.pending = None

    def _rank(self, job):
        if self.mode == "deadline_first":
            return (job["deadline"], -job["priority"], job["job_id"])
        margin = job["payment"] - job["material_cost"] - (
            job["crew_cost"] * job["required_known"])
        if self.mode == "cash_first":
            return (-margin / max(1, job["material_cost"] +
                                  job["crew_cost"]), job["deadline"])
        return (-margin / max(1, job["payment"]), job["deadline"])

    def choose(self, view):
        if self.mode == "no_action":
            return {"tool": "wait", "job_id": "", "key": ""}
        if self.pending is not None:
            return {"tool": "verify_operation", "job_id": "",
                    "key": self.pending["key"]}
        jobs = sorted(view["jobs"], key=self._rank)
        tick = view["tick"]
        for j in jobs:
            name = j["job_id"]
            if j["authority_seen"] == "revoked":
                continue
            if j["change_seen"] == "approval_required" and name not in self.approvals:
                return {"tool": "request_change_approval", "job_id": name,
                        "key": "owner:approval:" + name}
            if j["blocker_seen"] == "active" and name not in self.escalations:
                return {"tool": "escalate_blocker", "job_id": name,
                        "key": "field:blocker:" + name}
            if j["invoice_seen"] == "disputed" and name not in self.disputes:
                return {"tool": "resolve_invoice_dispute", "job_id": name,
                        "key": "finance:dispute:" + name}
            if j["invoice_seen"] in ("verified", "disputed", "dispute_resolved") or (
                    j["paid_receipted"]):
                continue
            if (j["work_receipted"] >= j["required_known"] and
                    j["materials_seen"] == "delivered" and
                    name not in self.invoice_requests and
                    j["change_seen"] not in ("approval_required", "approval_requested") and
                    j["blocker_seen"] not in ("active", "resolution_requested")):
                return {"tool": "request_invoice", "job_id": name,
                        "key": "finance:invoice:" + name}
            if name not in self.orders and j["materials_seen"] not in (
                    "delivered", "delivery_delayed"):
                reserve = j["crew_cost"] * (2 if self.mode == "risk_averse" else 1)
                if (j["material_cost"] <= j["order_limit"] and
                        view["cash_budget"] >= j["material_cost"] + reserve):
                    return {"tool": "order_material", "job_id": name,
                            "key": "materials:" + name}
            if (j["materials_seen"] == "delivered" and
                    j["work_receipted"] < j["required_known"] and
                    j["blocker_seen"] not in ("active", "resolution_requested") and
                    j["change_seen"] not in ("approval_required", "approval_requested") and
                    view["cash_budget"] >= j["crew_cost"]):
                return {"tool": "assign_crew", "job_id": name,
                        "key": f"crew:{name}:{j['work_receipted']+1}"}
        return {"tool": "wait", "job_id": "", "key": ""}

    def observe(self, call, response):
        status = response.get("status")
        tool, name = call["tool"], call["job_id"]
        if status == "timeout_unknown_commit":
            self.pending = dict(call)
            return
        if tool == "verify_operation" and self.pending:
            if status == "committed":
                old = self.pending
                self.pending = None
                self.observe(old, {"status": "already_committed"})
            elif status == "not_found":
                # Retry with the original key; never guess if it committed.
                self.previous_call = self.pending
                self.pending = None
            return
        if status not in ("committed", "already_committed"):
            return
        if tool == "order_material":
            self.orders.add(name)
        if tool == "request_invoice":
            self.invoice_requests.add(name)
        if tool == "escalate_blocker":
            self.escalations.add(name)
        if tool == "request_change_approval":
            self.approvals.add(name)
        if tool == "resolve_invoice_dispute":
            self.disputes.add(name)


def judge(case, state):
    """Frozen *independent* synthetic scorer, not LLM or candidate policy."""
    paid = sum(s["paid"] for s in state["jobs"].values())
    verified = sum(s["invoice"] == "verified" for s in state["jobs"].values())
    block_pending = sum(s["blocked"] for s in state["jobs"].values())
    cash_delta = state["ending_cash"] - case.initial_cash
    # Opportunity proxy does not claim counterfactual optimality.
    opportunity_proxy = sum(max(0, j.payment - j.material_cost -
                                j.crew_cost * j.shifts) for j in case.jobs)
    missed_proxy = int(opportunity_proxy * (1 - paid / len(case.jobs)))
    value = cash_delta - missed_proxy - 1000 * state["denials"]
    return {
        "schema": "GenesisCausalSyntheticScore/2.3",
        "case_id": case.case_id, "split": case.split,
        "family": case.family, "difficulty": case.difficulty,
        "paid_jobs": paid, "verified_invoices": verified,
        "possible_jobs": len(case.jobs),
        "cash_change": cash_delta, "ending_cash": state["ending_cash"],
        "missed_opportunity_proxy": missed_proxy,
        "safety_denials": state["denials"], "pending_blockers": block_pending,
        "synthetic_value_proxy": value,
        "real_world_value_proven": False,
        "causal_optimality_proven": False,
        "promotion_authorized": False,
    }


def episode(case, policy_name, *, review=False):
    if policy_name not in (
            "no_action", "deadline_first", "cash_first", "risk_averse"):
        raise ValueError("Unknown fixed benchmark policy")
    world = World(case)
    policy = Policy(policy_name)
    trace = []
    while world.tick < case.horizon:
        view = world.public_view("project_manager",
                                 tenant="SYN-TENANT-" + str(case.seed))
        action = policy.choose(view)
        # No candidate access to hidden shock schedule, server or grader.
        result = world.step(action)
        policy.observe(action, result["result"])
        if review:
            trace.append({"tick": result["tick"], "action": result["action"],
                          "result": result["result"],
                          "observation": result["view"]})
    result = judge(case, world.final_truth())
    return (result, trace) if review else result


@dataclass(frozen=True)
class Lesson:
    family: str
    difficulty: int
    novelty: int
    mode: str
    reason: str


class Curriculum:
    """Training-only bounded scheduler with diversity quota and safe rollback."""

    def __init__(self, seed=31):
        self.rng = random.Random(seed)
        self.levels = {family: 1 for family in FAMILIES}
        self.index = 0
        self.history = []
        self.pending: Lesson | None = None

    def next_lesson(self):
        if self.pending is not None:
            raise RuntimeError("Resolve previous training lesson first")
        if self.index % 4 == 3:
            # Forced exploration; avoids self-generated easy-case overfitting.
            family = FAMILIES[(self.index // 4) % len(FAMILIES)]
            lesson = Lesson(family, self.levels[family],
                            min(5, 1 + self.index // 12), "explore",
                            "Novel family scheduled independent of previous score")
        elif self.history and self.history[-1]["mode_next"] == "remediate":
            family = self.history[-1]["family"]
            lesson = Lesson(family, self.levels[family],
                            min(5, self.index // 5), "remediate",
                            "Revisit measured family weakness with controlled change")
        elif self.history and self.history[-1]["mode_next"] == "escalate":
            family = self.history[-1]["family"]
            lesson = Lesson(family, self.levels[family],
                            min(5, self.index // 5), "escalate",
                            "Challenge successful policy under stricter parameters")
        else:
            family = FAMILIES[self.index % len(FAMILIES)]
            lesson = Lesson(family, self.levels[family], 0, "explore",
                            "Coverage-driven first exposure")
        self.pending = lesson
        return lesson

    def admit_feedback(self, lesson, case, candidate, baseline):
        if lesson != self.pending or case.split != "dev":
            raise PermissionError("Only matching completed development evaluations can teach")
        if case.family != lesson.family or case.difficulty != lesson.difficulty:
            raise ValueError("Feedback does not match the assigned challenge")
        if candidate.get("case_id") != case.case_id or baseline.get("case_id") != case.case_id:
            raise ValueError("Cannot use unpaired scenario results")
        if candidate.get("schema") != "GenesisCausalSyntheticScore/2.3" or (
                baseline.get("schema") != "GenesisCausalSyntheticScore/2.3"):
            raise ValueError("Scorer provenance mismatch")
        safe = candidate["safety_denials"] == 0
        wins = (candidate["synthetic_value_proxy"] >=
                baseline["synthetic_value_proxy"] and
                candidate["paid_jobs"] >= baseline["paid_jobs"] and safe)
        if wins:
            self.levels[lesson.family] = min(5, self.levels[lesson.family] + 1)
            action = "escalate"
        else:
            self.levels[lesson.family] = max(1, self.levels[lesson.family] - 1)
            action = "remediate"
        record = {
            "lesson": asdict(lesson), "case_id": case.case_id,
            "family": lesson.family, "win": wins, "safe": safe,
            "candidate_value": candidate["synthetic_value_proxy"],
            "baseline_value": baseline["synthetic_value_proxy"],
            "level_after": self.levels[lesson.family],
            "mode_next": action, "used_hidden_holdout": False,
            "code_update_permitted": False,
        }
        self.history.append(record)
        self.pending = None
        self.index += 1
        return record


class OutcomeBandit:
    """Tiny empirical policy selector, no weights/prompt auto-editing."""

    OPTIONS = ("deadline_first", "cash_first", "risk_averse")

    def __init__(self):
        self.samples = {family: {name: [] for name in self.OPTIONS}
                        for family in FAMILIES}

    def learn_from_paired_dev(self, case, outcomes):
        if case.split != "dev" or set(outcomes) != set(self.OPTIONS):
            raise PermissionError("Requires all fixed policy controls on development only")
        for name, score in outcomes.items():
            if score.get("case_id") != case.case_id or score.get("split") != "dev":
                raise ValueError("Unmatched synthetic outcome rejected")
            value = score["synthetic_value_proxy"]
            # Unsafe runs are ineligible regardless of their financial payoff.
            self.samples[case.family][name].append(
                value if score["safety_denials"] == 0 else -10**9)

    def choose(self, family):
        if family not in FAMILIES:
            raise ValueError("Unknown operating context")
        samples = self.samples[family]
        # Baseline defaults to a fixed, auditable safe policy.
        if not any(samples[name] for name in self.OPTIONS):
            return "deadline_first"
        return max(self.OPTIONS, key=lambda name: (
            mean(samples[name]) if samples[name] else -10**12,
            -self.OPTIONS.index(name)))

    def snapshot(self):
        return {family: {policy: {
            "observations": len(values),
            "estimated_mean_synthetic_value": round(mean(values), 4)
            if values else None} for policy, values in choices.items()}
            for family, choices in self.samples.items()}


def contrast(case, policy_name, shock_kind):
    """Paired synthetic intervention; conditional evidence, not general truth."""
    selection = tuple(s for s in case.shocks if s.kind != shock_kind)
    if len(selection) == len(case.shocks):
        raise ValueError("Cannot ablate an absent business shock")
    counterfactual = replace(case, shocks=selection,
                             case_id=case.case_id + "-ABL-" + shock_kind.upper())
    actual = episode(case, policy_name)
    ablated = episode(counterfactual, policy_name)
    return {
        "schema": "GenesisPairedInterventionEvidence/2.3",
        "case_id": case.case_id, "shock_ablated": shock_kind,
        "policy": policy_name,
        "observed_with_shock": actual["synthetic_value_proxy"],
        "observed_without_shock": ablated["synthetic_value_proxy"],
        "value_delta": (actual["synthetic_value_proxy"] -
                        ablated["synthetic_value_proxy"]),
        "matched_seed": case.seed, "paired_same_policy": True,
        "authoritative_reviewer": "frozen_synthetic_scorer",
        "real_world_causation_proven": False,
        "code_change_authorized": False,
    }


def critic_packet(case, score, trace):
    """Non-authoritative qualitative LLM judge input. No hidden future truth."""
    if score.get("case_id") != case.case_id:
        raise ValueError("Wrong scored run")
    return {
        "schema": "GenesisReadOnlyLLMCriticPacket/2.3",
        "case_id": case.case_id, "split": case.split,
        "public_action_trace": trace,
        "independent_outcome": score,
        "permitted_task": "Cite observed evidence, analyze likely mistakes, "
                          "suggest possible repairs and new failure tests.",
        "forbidden": [
            "change_referee", "read_protected_holdout", "change_ground_truth",
            "execute_business_action", "promote_candidate", "modify_running_policy"],
        "judgment_binding": False, "score_override_permitted": False,
        "source_truth_included": False,
    }
