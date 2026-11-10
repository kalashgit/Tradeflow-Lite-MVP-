"""Shared machinery for hidden worlds: matched random shocks and public views."""

from hashlib import sha256

from ...runtime.contracts import GoalProfileV1, ObservationV1
from ..protocol import VARIANTS


def uniform(*event) -> float:
    """Common random number in [0, 1) keyed by the event, never by the policy.

    Every policy facing the same seed sees the same shocks, so comparisons are
    paired and a different action only changes what the shock is applied to.
    """
    digest = sha256("/".join(str(part) for part in event).encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def pick(options, *event):
    return options[int(uniform(*event) * len(options))]


class World:
    """A functional world: ``transition`` is pure, so counterfactuals are exact."""

    family = ""
    version = ""
    domain_id = ""
    horizon = 0
    sequential = False   # True when an action changes later states
    baseline_decisions: tuple = ()

    def __init__(self, seed: int, variant: str, tenant_id: str):
        if type(seed) is not int or seed < 0 or variant not in VARIANTS:
            raise ValueError("Invalid world seed or variant")
        self.seed, self.variant, self.tenant_id = seed, variant, tenant_id
        self.shifted = variant == "shifted"
        self.weights: dict = {}
        self.max_spend = 0.0
        self.risk_tolerance = 0.5

    def _goals(self, profiles, spends, tolerances=(0.9, 0.7, 0.5)) -> None:
        self.weights = dict(pick(profiles, self.seed, self.family, "profile"))
        self.max_spend = float(pick(spends, self.seed, self.family, "spend"))
        self.risk_tolerance = pick(tolerances, self.seed, self.family, "risk")

    def goal_profile(self) -> GoalProfileV1:
        return GoalProfileV1(
            tenant_id=self.tenant_id, domain_id=self.domain_id,
            goal_weights=dict(self.weights), hard_constraints={"max_spend": self.max_spend},
            risk_tolerance=self.risk_tolerance, decision_deadline=None,
            owner_preference_version=1)

    def fact(self, event_id, scope, subject, metric, value, revision, at, **extra):
        return ObservationV1(
            event_id=event_id, tenant_id=self.tenant_id, domain_id=self.domain_id,
            scope_id=scope, subject_id=subject, metric=metric, value=value,
            source_revision=revision, observed_at=at, **extra)

    def as_of(self, step: int) -> int:
        return 100 + step * 10

    def _feasible(self, pack, facts) -> list:
        """Declared prerequisites plus the owner's spending bound."""
        from itertools import product
        found = []
        for picks in product(*(axis.choices for axis in pack.axes)):
            decisions = tuple(zip((axis.name for axis in pack.axes), picks))
            option = pack.assess(facts, decisions)
            if option is not None and option.estimated_spend <= self.max_spend:
                found.append(decisions)
        return found

    # Subclasses implement:
    def initial_state(self):
        return None

    def public_step(self, state, step):
        raise NotImplementedError

    def admissible(self, state, step) -> list:
        raise NotImplementedError

    def transition(self, state, step, decisions) -> tuple[dict, object]:
        raise NotImplementedError
