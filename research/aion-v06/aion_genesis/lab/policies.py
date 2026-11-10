"""Policies under test. PUBLIC SIDE: uses only the runtime and public protocol.

A policy receives public observations and, later, the supplied outcome of the
action that was actually applied. It never receives a world object, hidden
state, counterfactual results, oracle values or scores.
"""

from ..runtime import AionRuntime, DecisionRequestV1, RuntimeStore
from .protocol import PublicStep, adapters

POLICY_VERSIONS = {
    "no_action": "safe-no-action/1.0",
    "fixed_rule": "runtime-1.0/deterministic-fast-path+declared-domain-rule",
    "v09_strategist": "runtime-1.0/bounded-search(strategic-planner-0.9.0)/memory-off",
    "aion_v1_memory": "runtime-1.0/bounded-search(strategic-planner-0.9.0)"
                      "/outcome-memory(additive_residual_v1)",
    "aion_v12_contextual": "runtime-1.2/bounded-search(strategic-planner-0.9.0)"
                           "/outcome-memory(contextual_residual_v12)",
    "aion_v12_hybrid": "runtime-1.2.1/bounded-search(strategic-planner-0.9.0)"
                       "/outcome-memory(hierarchical_contextual_residual_v12)",
}
_CAPABILITIES = {
    "fixed_rule": ("deterministic_fast_path",),
    "v09_strategist": ("bounded_search",),
    "aion_v1_memory": ("bounded_search", "outcome_memory"),
    "aion_v12_contextual": ("bounded_search", "contextual_outcome_memory"),
    "aion_v12_hybrid": ("bounded_search", "hybrid_outcome_memory"),
}


class NoActionPolicy:
    """Always leaves things as they are; the safe reference for harm."""

    name, memory_mode = "no_action", "none"

    def begin(self, tenant_id, domain_id, profile) -> None:
        pass

    def decide(self, step: PublicStep):
        return None

    def learn(self, outcome) -> None:
        pass

    def close(self) -> None:
        pass


class RuntimePolicy:
    """One fresh, isolated v1.0 runtime per episode (one synthetic tenant)."""

    def __init__(self, name: str, budgets: dict):
        self.name = name
        self.capabilities = _CAPABILITIES[name]
        self.memory_mode = "on" if "outcome_memory" in self.capabilities else "off"
        self.budgets = budgets
        self.store = self.runtime = None

    def begin(self, tenant_id, domain_id, profile) -> None:
        self.tenant_id, self.domain_id = tenant_id, domain_id
        self.store = RuntimeStore(":memory:")
        self.runtime = AionRuntime(self.store, adapters())
        self.runtime.set_goal_profile(profile)

    def decide(self, step: PublicStep):
        for observation in step.observations:
            self.runtime.observe(observation)
        return self.runtime.investigate(DecisionRequestV1(
            request_id="REQ-" + step.case_id, case_id=step.case_id,
            tenant_id=self.tenant_id, domain_id=self.domain_id, scope_id=step.scope_id,
            as_of=step.as_of, available_capabilities=self.capabilities,
            time_budget_ms=self.budgets["time_budget_ms"],
            compute_budget=self.budgets["compute_budget"], model_call_budget=0))

    def learn(self, outcome) -> None:
        self.runtime.record_outcome(outcome)

    def close(self) -> None:
        if self.store is not None:
            self.store.close()


def build_policy(name: str, budgets: dict):
    if name == "no_action":
        return NoActionPolicy()
    if name not in _CAPABILITIES:
        raise ValueError("Unknown policy")
    return RuntimePolicy(name, budgets)
