"""Genesis World Laboratory: versioned scenarios, rollouts and verified outcomes.

HIDDEN SIDE. Wraps the existing v2.3 causal business world unchanged. This is
the only GML module that touches authoritative state (``final_truth``, the
judge, counterfactual branches). It emits sealed learning trajectories whose
model-visible part contains the role-scoped observation only.

Partitions are separated by causal mechanism and template lineage, not just by
seed. Non-train partitions can be generated only with an ``AuthorityToken``.
"""

import copy
from dataclasses import asdict, dataclass
import random

from ..eval_v2.adaptive import Policy, judge
from ..eval_v2.causal_world import World, generate
from .contracts import content_hash, seal

WORLD_VERSION = "causal-business-v23"
DOMAIN_PACK = "synthetic-electrical-contractor/gml-01"
VERIFIER = "gml-laboratory-verifier/1.0"
STRATEGIES = ("risk_averse", "cash_first", "deadline_first", "no_action")
DENIED = ("authority_revoked", "approval_denied", "invalid_tool_call", "key_conflict")
ACTIONS = ("wait", "order_material", "assign_crew", "escalate_blocker",
           "request_change_approval", "request_invoice", "resolve_invoice_dispute")
TRAIN_FAMILIES = ("supplier_shock", "field_blocker", "scope_approval", "working_capital")
HELD_OUT_FAMILIES = ("invoice_dispute", "compound")
# name -> (world split, first index, families, difficulties, novelties)
PARTITION_SPECS = {
    "train": ("dev", 10000, TRAIN_FAMILIES, (1, 2, 3), (0, 1, 2)),
    "public_validation": ("validation", 10000, TRAIN_FAMILIES, (1, 2, 3), (0, 1, 2)),
    "protected_test": ("validation", 20000, (*HELD_OUT_FAMILIES, *TRAIN_FAMILIES),
                       (4,), (0, 1, 2)),
    "adversarial": ("validation", 30000, (*TRAIN_FAMILIES, *HELD_OUT_FAMILIES),
                    (5,), (3, 4, 5)),
}
MAX_CASES = 5000


class AuthorityToken:
    """Capability held by the evaluation authority; never by training code."""

    _issued = False

    def __init__(self, _secret=None):
        if _secret is not AuthorityToken:
            raise PermissionError("Only the evaluation authority can mint this token")


@dataclass(frozen=True)
class Scenario:
    partition: str
    index: int
    case: object

    @property
    def scenario_id(self) -> str:
        return f"GML-{self.partition}-{self.index}"

    @property
    def tenant(self) -> str:
        return "SYN-TENANT-" + str(self.case.seed)

    @property
    def mechanisms(self) -> list[str]:
        return sorted({"cash_constraint", *(shock.kind for shock in self.case.shocks)})

    @property
    def template_lineage(self) -> str:
        case = self.case
        return f"{case.family}.d{case.difficulty}.n{case.novelty}.j{len(case.jobs)}"


def scenarios(partition: str, count: int, *, start: int = 0, families=None,
              token: AuthorityToken | None = None) -> list[Scenario]:
    """Deterministic scenarios for a partition; held-out ones need the token."""
    if partition not in PARTITION_SPECS:
        raise ValueError("Unknown partition")
    if partition != "train" and not isinstance(token, AuthorityToken):
        raise PermissionError("Only the evaluation authority may generate " + partition)
    if type(count) is not int or type(start) is not int or not (
            0 <= start and 0 < count and start + count <= MAX_CASES):
        raise ValueError("Scenario range out of bounds")
    split, base, allowed, difficulties, novelties = PARTITION_SPECS[partition]
    families = tuple(families or allowed)
    if set(families) - set(allowed):
        raise PermissionError("Family is not part of this partition's lineage")
    found = []
    for i in range(start, start + count):
        case = generate(split, base + i, family=families[i % len(families)],
                        difficulty=difficulties[(i // len(families)) % len(difficulties)],
                        novelty=novelties[(i // 3) % len(novelties)])
        found.append(Scenario(partition, i, case))
    return found


def initial_observation(scenario: Scenario) -> dict:
    """The project manager's public view before anything has happened."""
    return World(scenario.case).public_view("project_manager", tenant=scenario.tenant)


def _play(world, policy, tenant, horizon, log=None):
    while world.tick < horizon:
        view = world.public_view("project_manager", tenant=tenant)
        action = policy.choose(view)
        event = world.step(action)
        policy.observe(action, event["result"])
        if log is not None:
            log.append((view, event["action"], event["result"]["status"]))
    return world


def strategy_outcomes(scenario: Scenario) -> dict:
    """Independently executed outcome of every fixed strategy (hidden side)."""
    outcomes = {}
    for name in STRATEGIES:
        log = []
        world = _play(World(scenario.case), Policy(name), scenario.tenant,
                      scenario.case.horizon, log)
        score = judge(scenario.case, world.final_truth())
        outcomes[name] = {
            "value": int(score["synthetic_value_proxy"]), "paid_jobs": score["paid_jobs"],
            "possible_jobs": score["possible_jobs"], "cash_change": score["cash_change"],
            "denied": score["safety_denials"],
            "receipt_digest": content_hash([(a, s) for _, a, s in log]),
            "committed_operations": sum(s == "committed" for _, _, s in log)}
    return outcomes


def acceptable(outcomes: dict) -> list[str]:
    """Strategies tied for the best independently measured value."""
    best = max(row["value"] for row in outcomes.values())
    return [name for name in STRATEGIES if outcomes[name]["value"] == best]


def _base_record(scenario, observation, model=None):
    case = scenario.case
    return {
        "environment": {
            "scenario_id": scenario.scenario_id, "family": case.family,
            "mechanisms": scenario.mechanisms,
            "template_lineage": scenario.template_lineage,
            "world_version": WORLD_VERSION,
            "initial_state_hash": content_hash(asdict(case)["jobs"]),
            "mechanism_hash": content_hash([case.family, case.difficulty, case.novelty,
                                            sorted(s.kind for s in case.shocks)]),
            "seed": case.seed, "partition": scenario.partition,
            "domain_pack_version": DOMAIN_PACK},
        "model": model or {
            "base_model": "none", "base_revision": "none", "tokenizer_revision": "none",
            "adapter_revision": "none", "prompt_hash": "none", "tool_schema_hash": "none",
            "memory_version": "none", "inference_settings": {}},
        "available_information": {
            "actor": "project_manager", "tenant_scope": scenario.tenant,
            "observation": observation,
            "source_refs": [m["source_ref"] for m in observation.get("messages", [])],
            "as_of_tick": observation["tick"],
            "missing": sorted({f"{j['job_id']}:{k}" for j in observation["jobs"]
                               for k in ("materials_seen", "blocker_seen", "change_seen",
                                         "invoice_seen") if j[k] == "unknown"})[:40],
            "permissions": ["propose_review_only_strategy"]},
    }


def decision_trajectory(scenario: Scenario, selected: str, *, behaviour: str,
                        outcomes: dict | None = None, model=None) -> dict:
    """One sealed strategy decision with its verified, counterfactual evidence."""
    if selected not in STRATEGIES:
        raise ValueError("Unknown strategy")
    outcomes = outcomes or strategy_outcomes(scenario)
    good, chosen = acceptable(outcomes), outcomes[selected]
    eligible = scenario.partition == "train" and chosen["committed_operations"] + (
        selected == "no_action") > 0
    record = _base_record(scenario, initial_observation(scenario), model)
    record.update({
        "decision": {
            "candidate_actions": list(STRATEGIES), "selected_action": selected,
            "predictions": {}, "confidence": None, "memory_records_used": [],
            "budgets": {"behaviour_policy": behaviour, "simulations": len(STRATEGIES)}},
        "verified_consequences": {
            "receipts": [chosen["receipt_digest"]],
            "direct_effects": {"committed_operations": chosen["committed_operations"]},
            "delayed_outcome": {"paid_jobs": chosen["paid_jobs"],
                                "possible_jobs": chosen["possible_jobs"],
                                "cash_change": chosen["cash_change"]},
            "denied_operations": chosen["denied"], "censored": False,
            "attribution": "matched_counterfactual_same_world_all_strategies",
            "utility": chosen["value"], "safety": {"denied": chosen["denied"]}},
        "learning_evidence": {
            "diagnosis": None if selected in good else "selected strategy was not among "
                         "the best independently measured alternatives",
            "counterfactuals": {name: {k: row[k] for k in (
                "value", "paid_jobs", "cash_change", "denied", "receipt_digest")}
                for name, row in outcomes.items()},
            "better_worse": [[a, b] for a in STRATEGIES for b in STRATEGIES
                             if outcomes[a]["value"] > outcomes[b]["value"]],
            "corrective_action": good[0], "applicability": scenario.template_lineage,
            "counterexamples": [], "evidence_quality": "simulated_exact_counterfactual"},
        "provenance": {
            "source_trace_hash": content_hash(outcomes), "verifier_version": VERIFIER,
            "training_eligible": eligible,
            "ineligible_reason": None if eligible else (
                "held_out_partition" if scenario.partition != "train"
                else "no_verified_receipt"),
            "data_permissions": "synthetic_public_research", "checkpoint_lineage": None},
    })
    return seal(record)


class ExploringPolicy(Policy):
    """A fixed strategy with occasional random orders, for intervention coverage."""

    def __init__(self, mode: str, epsilon: float, seed: int):
        super().__init__(mode)
        self.epsilon, self.rng = epsilon, random.Random(seed)

    def choose(self, view):
        action = super().choose(view)
        if action["tool"] == "verify_operation" or self.rng.random() >= self.epsilon:
            return action
        open_jobs = [j for j in view["jobs"] if j["job_id"] not in self.orders
                     and j["materials_seen"] != "delivered"
                     and j["authority_seen"] != "revoked"
                     and j["material_cost"] <= min(j["order_limit"], view["cash_budget"])]
        if not open_jobs:
            return action
        job = self.rng.choice(open_jobs)
        return {"tool": "order_material", "job_id": job["job_id"],
                "key": "explore:" + job["job_id"]}


def step_view(view: dict, job_id: str, ordered: set, committed: int) -> dict:
    """Model-visible numbers for one candidate action on one job."""
    job = next(j for j in view["jobs"] if j["job_id"] == job_id) if job_id else None
    cash = max(1, view["cash_budget"])
    open_cost = sum(j["crew_cost"] * max(0, j["required_known"] - j["work_receipted"])
                    for j in view["jobs"] if j["job_id"] in ordered
                    and not j["paid_receipted"] and j["job_id"] != job_id)
    row = {"tick": view["tick"], "cash_budget": view["cash_budget"],
           "crew_slots": view["crew_slots"], "job_count": len(view["jobs"]),
           "other_open_commitments": open_cost, "operations_committed": committed,
           "global_truth": False}
    if job is not None:
        row["job"] = {k: job[k] for k in (
            "priority", "material_cost", "crew_cost", "payment", "order_limit",
            "materials_seen", "blocker_seen", "change_seen", "invoice_seen",
            "authority_seen", "work_receipted", "required_known", "paid_receipted")}
        row["job"]["ordered_by_me"] = job_id in ordered
    return row


def transition_records(scenario: Scenario, behaviour: str, *, epsilon=0.25,
                       wait_keep=0.1) -> list[dict]:
    """Step-level records: observed state + action -> verified later consequences.

    ``label`` is hidden-side information (used only as a training target).
    ``censored`` marks a job still in the payment pipeline at the cutoff: its
    non-payment is unknown, not a verified failure.
    """
    case, rng = scenario.case, random.Random(scenario.case.seed * 31 + len(behaviour))
    policy = ExploringPolicy(behaviour, epsilon, case.seed + 7) if epsilon else Policy(behaviour)
    log = []
    world = _play(World(case), policy, scenario.tenant, case.horizon, log)
    truth = world.final_truth()["jobs"]
    delivered_at, ordered, committed, rows = {}, set(), 0, []
    for view, _, _ in log:
        for job in view["jobs"]:
            if job["materials_seen"] == "delivered":
                delivered_at.setdefault(job["job_id"], view["tick"])
    for view, action, status in log:
        tool, job_id = action["tool"], action["job_id"]
        if tool == "verify_operation" or (tool == "wait" and rng.random() >= wait_keep):
            continue
        label = {"denied": int(status in DENIED), "committed": int(status == "committed")}
        censored = False
        if job_id:
            final = truth[job_id]
            censored = (not final["paid"]) and final["invoice"] in ("pending", "verified")
            label["job_paid"] = int(final["paid"])
            if tool == "order_material" and status == "committed":
                seen = delivered_at.get(job_id)
                label["delivered_within_4"] = int(seen is not None
                                                  and seen - view["tick"] <= 4)
        rows.append({
            "scenario_id": scenario.scenario_id, "partition": scenario.partition,
            "family": case.family, "template_lineage": scenario.template_lineage,
            "behaviour": behaviour, "action": tool,
            "input": step_view(view, job_id, ordered, committed),
            "label": label, "censored": censored,
            "receipt": status, "source_ref": content_hash(
                [scenario.scenario_id, behaviour, view["tick"], action])[:24]})
        if status == "committed":
            committed += 1
            if tool == "order_material":
                ordered.add(job_id)
    return rows


def intervention_pairs(scenario: Scenario, limit=2) -> list[dict]:
    """Matched counterfactuals: same state, order job A versus job B, then replay."""
    case, tenant, pairs = scenario.case, scenario.tenant, []
    world, policy = World(case), Policy("risk_averse")
    committed = 0
    while world.tick < case.horizon and len(pairs) < limit:
        view = world.public_view("project_manager", tenant=tenant)
        open_jobs = [j for j in view["jobs"] if j["job_id"] not in policy.orders
                     and j["materials_seen"] not in ("delivered", "delivery_delayed")
                     and j["authority_seen"] != "revoked"
                     and j["material_cost"] <= min(j["order_limit"], view["cash_budget"])]
        if len(open_jobs) >= 2 and policy.pending is None:
            arms = []
            for job in open_jobs[:2]:
                branch_world, branch_policy = copy.deepcopy(world), copy.deepcopy(policy)
                action = {"tool": "order_material", "job_id": job["job_id"],
                          "key": "intervene:" + job["job_id"]}
                event = branch_world.step(action)
                branch_policy.observe(action, event["result"])
                _play(branch_world, branch_policy, tenant, case.horizon)
                final = branch_world.final_truth()
                arms.append({
                    "input": step_view(view, job["job_id"], set(policy.orders), committed),
                    "job_paid": int(final["jobs"][job["job_id"]]["paid"]),
                    "total_paid": sum(s["paid"] for s in final["jobs"].values())})
            pairs.append({"scenario_id": scenario.scenario_id, "tick": view["tick"],
                          "family": case.family, "arms": arms})
        action = policy.choose(view)
        event = world.step(action)
        policy.observe(action, event["result"])
        committed += event["result"]["status"] == "committed"
    return pairs
