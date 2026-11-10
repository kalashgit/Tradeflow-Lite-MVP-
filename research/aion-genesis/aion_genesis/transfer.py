"""Controlled research on provisional experience transfer.

Only DEVELOPMENT-world observations build the casebook. Held-out worlds are never
written into it, and hidden rules are never accessed for retrieval or proposal.
"""
from copy import deepcopy
from dataclasses import dataclass
import json
import random

from .core import ReferenceProposer, states, validate, violations, worlds


class ProvisionalCasebook:
    """Bounded, audit-friendly, nonpersistent candidate library.

    A candidate is admitted only if it predicts a separate, prospective set of
    DEVELOPMENT-world interventions. This is still provisional evidence and
    NOT verified durable causal knowledge.
    """
    def __init__(self, minimum_worlds=2, capacity=128):
        if not isinstance(minimum_worlds, int) or minimum_worlds < 2:
            raise ValueError("minimum independent support must be at least two worlds")
        if not isinstance(capacity, int) or capacity < 1:
            raise ValueError("invalid casebook capacity")
        self.minimum_worlds = minimum_worlds
        self.capacity = capacity
        self._cases = {}

    def admit_training_case(self, world_id, split, variables, proposed, validation_evidence):
        if split != "development":
            return False
        if not isinstance(world_id, str) or not world_id or len(validation_evidence) < 3:
            return False
        try:
            candidate = validate(proposed, variables)
            if violations(candidate, validation_evidence, variables):
                return False
        except (ValueError, KeyError, TypeError, RecursionError):
            return False
        key = (tuple(variables), json.dumps(candidate, sort_keys=True))
        if key not in self._cases and len(self._cases) >= self.capacity:
            return False
        entry = self._cases.setdefault(key, {"candidate": deepcopy(candidate), "variables": tuple(variables), "support": set()})
        entry["support"].add(world_id)
        return True

    def retrieve(self, variables, observations, *, world_id=None, limit=3):
        """Return expressions, not cross-world outcomes or hidden rules."""
        if not 0 <= limit <= 10:
            raise ValueError("invalid retrieval size")
        candidates = []
        for entry in self._cases.values():
            if entry["variables"] != tuple(variables) or len(entry["support"]) < self.minimum_worlds:
                continue
            if world_id is not None and world_id in entry["support"]:
                continue
            candidate = entry["candidate"]
            if not violations(candidate, observations, variables):
                candidates.append((len(entry["support"]), json.dumps(candidate, sort_keys=True), candidate))
        candidates.sort(key=lambda item: (-item[0], item[1]))
        return [deepcopy(item[2]) for item in candidates[:limit]]

    def summary(self):
        return {
            "status": "provisional-only",
            "persistent": False,
            "candidateGroups": len(self._cases),
            "independentlySupportedGroups": sum(len(item["support"]) >= self.minimum_worlds for item in self._cases.values()),
            "distinctDevelopmentWorlds": len(set().union(*(item["support"] for item in self._cases.values()))) if self._cases else 0,
        }


def prepare_casebook(seed=71, count=120):
    """Build from development worlds only, using observable interventions.

    A fixed deterministic proposer examines training measurements. A separate
    subset of interventions is then used as a filter; no hidden rule is queried.
    The cost of the resulting bank is reported separately from model calls.
    """
    batch = worlds(seed=seed, count=count)
    library = ProvisionalCasebook()
    observations = 0
    admitted = 0
    for world in batch:
        if world.split != "development":
            continue
        rng = random.Random(seed * 10000 + int(world.world_id.rsplit("-", 1)[-1]))
        inputs = states(world.variables)
        rng.shuffle(inputs)
        midpoint = len(inputs) // 2
        learning = [world.intervene(state) for state in inputs[:midpoint]]
        validation = [world.intervene(state) for state in inputs[midpoint:]]
        observations += len(learning) + len(validation)
        model = ReferenceProposer(composed=False)
        candidate = model.propose(variables=world.variables, recent=learning, feedback=[], previous=None)
        if candidate is not None and library.admit_training_case(world.world_id, world.split, world.variables, candidate, validation):
            admitted += 1
    return library, {"developmentInterventions": observations, "trainingWorlds": len([w for w in batch if w.split == "development"]), "acceptedCaseInstances": admitted, **library.summary()}


@dataclass
class AblationSummary:
    label: str
    world_count: int
    mean_accuracy: float
    evidence_consistency: float
    valid_proposal_rate: float
    model_calls: int
    prompt_tokens: int
    completion_tokens: int
    retrieved_hypotheses: int
    world_results: list


def evaluate_arm(proposer_factory, casebook, *, retrieval, seed, target_indices, budget=5):
    """Reset worlds and model state for each arm to eliminate state leakage."""
    batch = worlds(seed=seed, count=120)
    results = []
    for index in target_indices:
        world = batch[index]
        if world.split != "heldout":
            raise ValueError("evaluation must use held-out worlds")
        from .scientist import Scientist
        agent = Scientist(proposer_factory(), working_limit=8, casebook=casebook if retrieval else None)
        trial = agent.investigate(world, max_experiments=budget)
        results.append(trial)
    total = sum(r.experiments for r in results)
    return AblationSummary(
        label="reviewed-provisional-memory" if retrieval else "working-memory-only",
        world_count=len(results),
        mean_accuracy=round(sum(r.final_accuracy for r in results) / len(results), 4),
        evidence_consistency=round(sum(r.consistent_proposals for r in results) / total, 4),
        valid_proposal_rate=round(sum(r.valid_proposals for r in results) / total, 4),
        model_calls=sum(r.model_calls for r in results),
        prompt_tokens=sum(r.prompt_tokens for r in results),
        completion_tokens=sum(r.completion_tokens for r in results),
        retrieved_hypotheses=sum(r.retrieved_hypotheses for r in results),
        world_results=[{"world": r.world, "accuracy": r.final_accuracy, "experiments": r.experiments,
                        "validProposals": r.valid_proposals, "consistentProposals": r.consistent_proposals,
                        "retrievals": r.retrieved_hypotheses} for r in results]
    )


def run_ablation(proposer_factory, *, seed=71, count=8, budget=5, real_model=False):
    if not isinstance(count, int) or not 1 <= count <= 60:
        raise ValueError("invalid number of target worlds")
    if not isinstance(budget, int) or not 1 <= budget <= 8:
        raise ValueError("invalid observation budget")
    library, training = prepare_casebook(seed=seed)
    target_indices = tuple(range(60, 60 + count))
    control = evaluate_arm(proposer_factory, library, retrieval=False, seed=seed, target_indices=target_indices, budget=budget)
    memory = evaluate_arm(proposer_factory, library, retrieval=True, seed=seed, target_indices=target_indices, budget=budget)
    paired = [b["accuracy"] - a["accuracy"] for a, b in zip(control.world_results, memory.world_results)]
    return {
        "kind": "AION-Genesis-V1-provisional-memory-ablation",
        "realQwenInference": bool(real_model),
        "persistentCausalKnowledge": False,
        "seed": seed,
        "budgetPerWorld": budget,
        "training": training,
        "control": control.__dict__,
        "provisionalMemory": memory.__dict__,
        "comparison": {
            "accuracyDelta": round(memory.mean_accuracy - control.mean_accuracy, 4),
            "positiveTransferWorlds": sum(v > 0 for v in paired),
            "negativeTransferWorlds": sum(v < 0 for v in paired),
            "unchangedWorlds": sum(v == 0 for v in paired),
        },
        "interpretation": "Model responses are scored by an independent world evaluator; deterministic casebook training does not prove autonomous learning. This benchmark tests transfer or negative transfer from observation-validated development-world proposals."
    }
